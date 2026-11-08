import "server-only";
import { legacyPartnerWorkflowAllowed } from "./partner-legacy-policy";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@/brand/database-types";
import { safeEqual } from "@/lib/corporate-auth";
// TYPE-ONLY at module scope. corporate-band-compose pulls in `sharp`, a native
// binary workerd cannot run, and every route that merely reads a batch imports
// loadBatch from this file. When sharp failed to load on the linux runtime the
// CLIENT'S APPROVAL PAGE went down with it (live 500s, 19 Aug 2026) — a page
// that never composes anything. Composing now happens in the media container
// (bandComposeRemote), so only the composer's TYPES may ever be imported here.
import type { BandPiece, composeBandPieces } from "@/lib/corporate-band-compose";
import { bandComposeRemote, mediaHealthRemote, restartMediaRemote, thumbnailBytesRemote } from "@/lib/media-client";
import { caDownload } from "@/lib/corporate-art-store";
import { detectWallQuad } from "@/lib/wall-quad";
import { onePerArtwork } from "@/lib/design-fingerprint-rules";
import { planSerialRuns } from "@/lib/serial-run-rules";
import { allocatable, awaitsArt, chainStyle, cityAllows, composingStale, entranceRule, fitsChain, isSuggested, storeCity, suggestionBrief } from "@/lib/site-batch-rules";
import { ensureDesignGeometry } from "@/lib/design-geometry";
import { BAND_RULES_VERSION, bandOutcome, medianFloor, minSubjectsFor, subjectCount, wantsDenseComposition } from "@/lib/band-geometry";
import { anthropicKeyFor } from "@/lib/ai-keys";
import { vsOpenAIJson, vsOpenAIKey } from "@/lib/vs-openai";

// ─── Site batch: one measured store → one proposal → ONE approval ───────────
//
// The pipeline the operator never touches: walls arrive from the Wallpaper
// Calculator (measured clockwise, photographed clockwise), the AI reads each
// wall's photo to understand what the wall IS (the geyser bay, the café
// counter, the TV run), allocates approved library designs so that NO design
// repeats anywhere in the store, and the band composer builds each wall's
// print master with the platform line level across every join. The one human
// act left is the partner admin approving the whole batch — which places the
// project through the same batch-order route their team uses by hand.

export const SITE_BATCH_STATUSES = [
  "collecting", "allocated", "composed", "needs_attention", "proposed", "ordered", "cancelled",
] as const;
export type SiteBatchStatus = (typeof SITE_BATCH_STATUSES)[number];

/** Wall statuses, which are a different vocabulary from the batch's and used to
 *  be written as bare strings in six places. */
export const WALL_STATUSES = ["measured", "allocated", "composed", "compose_failed", "ordered"] as const;
export type WallStatus = (typeof WALL_STATUSES)[number];

/** A wall that has failed to compose this many times is not tried again. A
 *  transient native/sharp failure deserves another go; a deterministic one (a
 *  chain that exceeds MAX_SEGMENTS, a missing storage object) must not spin —
 *  which it did, forever, until 2026-08-19. */
export const MAX_COMPOSE_ATTEMPTS = 3;


export type SiteBatchWall = {
  id: string; batch_id: string; seq: number; name: string; room: string | null;
  width_mm: number; height_mm: number; photo_path: string | null; notes: string | null;
  context_json: { context?: string; note?: string; pinned?: boolean; awaitingArt?: boolean } | null;
  /** The wall carries on round a corner into the next one (serial-run-rules.ts). */
  turns_into_next?: boolean | null;
  design_ids: string[]; art_json: BandPiece[] | null; quad_json: unknown;
  order_refs: string[]; status: string; warning: string | null;
  compose_attempts: number; photo_error: string | null;
  /** Zyvorah's own suggestion beyond the client's drawing (migration
   *  20261006123000): allocated and composed with the rest, shown and priced
   *  as an optional addition, released only when named. Undefined on rows
   *  older than the column — read through site-batch-rules.ts, never `=== false`. */
  suggested?: boolean | null; suggestion_reason?: string | null;
};
export type SiteBatch = {
  id: string; account_id: string; title: string; status: string; series_names: string[];
  state: string | null; ship_address: string | null; ship_city: string | null;
  notes: string | null; source: string | null; source_ref: string | null;
  gps: string | null; created_by: string | null;
  allocation_json: { warnings?: string[]; summary?: string } | null;
  approved_by_email: string | null; group_ref: string | null; error: string | null;
  // Previously reached through `as unknown as { revision?: number }` casts at
  // three call sites, which is how `revision` came to be written back unchanged
  // for a fortnight without anyone noticing.
  revision: number; revision_note: string | null;
  proposed_at: string | null; proposed_revision: number | null; email_error: string | null;
  /** The physical store this survey belongs to. Null on batches that predate
   *  corporate_stores; every one since is linked, which is what keeps a
   *  showroom's delivery address off the state-level GSTIN row. */
  store_id: string | null;
  /** An HQ admin's one tap. Nothing spends AI budget before this is set — the
   *  person who submits the measurements is not the person who authorises
   *  acting on them. */
  released_at: string | null; released_by_email: string | null;
  /** Drive-worker bookkeeping: the lease that stops two chains running one
   *  batch, and the attempt count that stops a doomed one running forever. */
  drive_lease_until: string | null; drive_attempts: number;
  /** Composed but never auto-proposed: the founder sends it (migration 20261013160000). */
  hold_proposal?: boolean | null;
  /** Who the proposal goes to, when the founder names them (migration
   *  20261014071500). Null = the account's approver and every active admin.
   *  Nelamangala, 14 October 2026: "send the proposal to Abhay & Nilesh". */
  proposal_to?: string[] | null;
  /** The partner's person who sent the order, when it reached us by WhatsApp
   *  or email and one of us keyed it in (migration 20261023104213). Read
   *  through `orderOrigin` in site-batch-rules.ts. */
  received_from?: string | null;
  /** Whether wall 1 is the first wall left of the street entrance (migration
   *  20261006123000). False for a survey of interior walls only, where no
   *  wall may lead with the city collection. Undefined on older rows = true. */
  entrance_in_scope?: boolean | null;
};

/** Server-to-server calls (the OS driving the pipeline, and our own drive
 *  worker) present the same shared secret the OS↔store order bridge uses.
 *
 *  Compared in constant time: this secret guards allocate/compose/propose,
 *  every one of which spends money, and it also travels OUTBOUND to
 *  os.magnitudegroup.in on each order push (src/lib/corporate-os.ts). A plain
 *  `===` on a value that leaves the building is the wrong shape for that. */
export function internalTokenOk(req: Request): boolean {
  const t = process.env.ZYVORAH_WEBHOOK_TOKEN ?? "";
  const got = req.headers.get("x-zyvorah-token") ?? "";
  return Boolean(t) && safeEqual(got, t);
}

export async function loadBatch(sb: SupabaseClient, id: string): Promise<{ batch: SiteBatch; walls: SiteBatchWall[] } | null> {
  const { data: batch } = await sb.from("corporate_site_batches").select("*").eq("id", id).single();
  if (!batch) return null;
  const { data: account } = await sb.from("corporate_accounts")
    .select("*").eq("id", batch.account_id).maybeSingle();
  if (!legacyPartnerWorkflowAllowed(account)) return null;
  const { data: walls } = await sb.from("corporate_site_batch_walls")
    .select("*").eq("batch_id", id).order("seq");
  return { batch: batch as SiteBatch, walls: (walls ?? []) as SiteBatchWall[] };
}

type Candidate = {
  id: string; title: string; series_name: string | null; design_code: string | null;
  design_url: string; aspect: number; usage: string | null; city: string | null;
};

export async function approvedCandidates(sb: SupabaseClient, accountId: string): Promise<Candidate[]> {
  const { data } = await sb.from("corporate_designs")
    .select("id, title, series_name, design_code, design_url, design_w_px, design_h_px, status, usage, city, content_sha256")
    .eq("account_id", accountId).eq("status", "approved").order("created_at");
  // One candidate per artwork (design-fingerprint.ts): two rows of the same
  // bytes would otherwise pass the no-repetition rule as two designs.
  return onePerArtwork(data ?? []).map((d) => ({
    id: d.id as string, title: d.title as string,
    series_name: (d.series_name as string) ?? null,
    design_code: (d.design_code as string) ?? null,
    design_url: d.design_url as string,
    usage: (d.usage as string) ?? null, city: (d.city as string) ?? null,
    // Aspect decides coverage: a chain covers sum(aspect) × wall height of
    // width. Unknown pixel sizes assume 2:1 — the validator only ever uses
    // this to add MORE designs, so a wrong guess costs nothing but variety.
    aspect: d.design_w_px && d.design_h_px ? Number(d.design_w_px) / Number(d.design_h_px) : 2,
  }));
}

const AI_MODEL = "claude-opus-5";

/** The allocation's shape — the Claude tool's input schema and GPT-6 Astra's structured output alike. */
const ALLOCATE_SCHEMA: { type: "object"; properties: Record<string, unknown>; required: string[] } = {
  type: "object",
  properties: {
    walls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          seq: { type: "number" },
          context: { type: "string", description: "what this wall is, 8 words max" },
          designCodes: { type: "array", items: { type: "string" }, description: "library codes in order" },
          note: { type: "string" },
        },
        required: ["seq", "designCodes"],
      },
    },
    summary: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["walls"],
};

/**
 * The AI pass. One request: every wall photo (downscaled by signed transform),
 * the candidate catalogue as text, and the house rules. Returns per-wall
 * ordered design chains. Deterministic validation AFTER the model call is
 * what makes this safe to run unattended: the no-repetition rule and the
 * cover-the-width rule are enforced in code, never merely requested.
 */
export async function allocateDesigns(
  sb: SupabaseClient,
  batch: SiteBatch,
  walls: SiteBatchWall[],
  onlySeqs?: number[],
  // Series brief for THIS pass. A store is not one brief: Bhosari runs
  // Series 2 + Pune downstairs and Series 3 + verticals upstairs, so the
  // preference has to travel with the call, not sit on the batch row.
  seriesOverride?: string[],
): Promise<{ perWall: Map<string, { ids: string[]; context: string; note?: string }>; warnings: string[] }> {
  // Hard filters BEFORE anything ranks: a showroom batch never sees office
  // designs, and a Pune store never sees another city's skyline. These were
  // prompt-level requests once; Bhosari proved they must be structural.
  const batchCity = storeCity(batch.ship_city);
  const all = await approvedCandidates(sb, batch.account_id);
  const candidates = all.filter((c) =>
    (c.usage ?? "showroom") !== "office" &&
    // City OR state, and one city's spellings as one (site-batch-rules.ts):
    // a Gujarat store's own collection is tagged "Gujarat", not "Ahmedabad".
    cityAllows(c.city, { city: batchCity, state: batch.state }));
  if (!candidates.length) throw new Error("No approved designs in the library — nothing to allocate.");

  const { data: accRow } = await sb.from("corporate_accounts")
    .select("allocation_rules").eq("id", batch.account_id).single();
  const standingRules = (accRow?.allocation_rules as string) ?? "";

  // Partial re-allocation: untouched walls keep their chains, and their
  // designs stay OFF the table so the no-repetition rule holds store-wide.
  //
  // A wall already in production is immovable, and that is not a preference —
  // it is what stops a customer being billed twice. This route accepts
  // status='proposed', which is exactly where a PARTIALLY approved batch sits,
  // and the caller's write-back loop resets art_json to null on every wall it
  // gets an entry for. An ordered wall reset that way then passes approve's
  // `status !== "ordered"` filter and is ordered a SECOND time: a second
  // corporate_orders row and a second push to the factory. Nobody hit it only
  // because revisions were rare; store links make them routine.
  //
  // site-batch-revise.ts has always got this right (`frozen`/`open`); this is
  // the same rule, finally applied on the allocate side too.
  // A wall the founder pinned by hand keeps its designs (site-batch-rules.ts).
  const target = walls.filter((w) => w.status !== "ordered" && allocatable(w, onlySeqs));
  const targetIds = new Set(target.map((w) => w.id));
  const locked = walls.filter((w) => !targetIds.has(w.id));
  if (!target.length) {
    throw new Error(
      walls.some((w) => w.status === "ordered")
        ? "Every wall in scope is already in production — there is nothing left to re-allocate."
        : "No walls to allocate.");
  }

  const seriesBrief = seriesOverride?.length ? seriesOverride : (batch.series_names ?? []);
  const preferred = new Set(seriesBrief.map((s) => s.toLowerCase()));
  const rank = (c: Candidate) => (c.series_name && preferred.has(c.series_name.toLowerCase()) ? 0 : 1);
  // The brief is a boundary, not a preference (Roheena, 14 October 2026, on
  // photo-style Series 3/4/12 designs filling Nelamangala walls 7, 8 and 11:
  // "the ones with the red squares are not Series 2"). With a brief, only its
  // series are candidates — city art aside, which the entrance rule may need.
  const entranceCity = batch.entrance_in_scope !== false;
  const catalogue = [...candidates]
    .filter((c) => !preferred.size || rank(c) === 0 || (entranceCity && !!c.city))
    .sort((a, b) => rank(a) - rank(b) || (a.series_name ?? "").localeCompare(b.series_name ?? ""));

  const wallImages: Anthropic.ImageBlockParam[] = [];
  const wallLines: string[] = [];
  for (const w of target) {
    if (w.photo_path) {
      // The wall photo goes to the model as BYTES, not a URL. It used to be a
      // signed zyvorah.com/api/files link, but Anthropic's image fetcher obeys
      // robots.txt and /api is disallowed there, so every allocation died with
      // "This URL is disallowed by the website's robots.txt file" once media
      // moved off Supabase to R2/Cloudflare (15 Sep 2026). Read the object
      // straight from R2 and downscale it in the media container — the same
      // 1400px transform the URL used to carry — then attach the base64. One
      // request still, still small enough that a 40-wall store stays tractable.
      // Fail open: a photo we cannot fetch is simply omitted, exactly as a wall
      // with no photo already is.
      try {
        const dl = await caDownload(w.photo_path);
        if (dl.data) {
          const small = await thumbnailBytesRemote(await dl.data.arrayBuffer(), { width: 1400, quality: 80 });
          wallImages.push({
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: small.toString("base64") },
          });
        }
      } catch (e) {
        console.error("[allocate] wall photo unavailable, allocating text-only for it:", w.seq, (e as Error)?.message);
      }
    }
    const wa = w.height_mm > 0 ? w.width_mm / w.height_mm : 0;
    // The measurer's own note. Stored since the pipeline was built and read by
    // nothing until 2026-08-19 — not here, not in the revise prompt, not in the
    // API response. It is the one thing the person with the tape measure knows
    // that the photograph cannot show ("pipe run at 1.2 m", "geyser bay
    // behind"), and it was the only reason to ask a busy person to type it.
    const note = (w.notes ?? "").trim();
    wallLines.push(`Wall ${w.seq} "${w.name}"${w.room ? ` (${w.room})` : ""}: ${w.width_mm}×${w.height_mm}mm, wall aspect ${wa.toFixed(2)}${wa < 1 && wa > 0 ? " (TALL NARROW PIER — needs portrait artwork)" : ""}${wantsDenseComposition(w.width_mm, w.height_mm) ? ` (LARGE PANEL — needs at least ${minSubjectsFor(w.width_mm, w.height_mm)} subjects in total, see 4c)` : ""}` +
      (w.photo_path ? ` — photo ${wallImages.length} above` : " — no photo") +
      // A wall we proposed, not the client: the allocator is told so, because
      // it is never an entrance wall and the approver will read the reason
      // beside the creative (site-batch-rules.ts).
      (isSuggested(w) ? `\n    ${suggestionBrief(w.suggestion_reason)}` : "") +
      (note ? `\n    SURVEYOR'S NOTE: ${note.slice(0, 300)}` : ""));
  }
  // Rule 2b depends on a fact only the uploader knows: whether this survey
  // begins at the street door. A survey of interior walls has no entrance
  // wall, and leading its wall 1 with the city collection would be wrong
  // (Vijay Sales, 6 October 2026). Older batches have no column and keep
  // the whole-floor behaviour.
  const entranceInScope = batch.entrance_in_scope !== false;
    // The model speaks in design CODES (11 chars), never raw UUIDs — sixteen
  // walls of UUID arrays is how the first live run overran its output budget
  // and died mid-JSON. Codes map back to ids here.
  const codeOf = new Map<string, string>();
  for (const c of catalogue) codeOf.set((c.design_code ?? c.id).toUpperCase(), c.id);
  // How many appliances each candidate carries, so a large panel can be given
  // a dense composition (band-geometry.ts). Measured once per design and
  // stored; the first allocation for a library pays the vision calls.
  // Only the store's own series brief is measured here (the rest show
  // "subjects ?" and are measured when composed): a whole library measured
  // before a single allocation outlived the drive tick (Nelamangala,
  // 13 October 2026). No brief → the whole catalogue, as before.
  const measureFirst = preferred.size ? catalogue.filter((c) => rank(c) === 0) : catalogue;
  let geometry = await ensureDesignGeometry(sb, measureFirst.map((c) => c.id));
  // When the brief alone cannot give every wall about two designs that
  // stand in one line (Nelamangala, 14 October 2026: Series 2 has 23 row
  // designs for 14 walls), the next designs in the catalogue's order are
  // measured too — up to MEASURE_MORE a run — so the top-up chooses on
  // facts, not on "?" (an unmeasured design passes every check unseen).
  {
    const MEASURE_MORE = 48;
    const fittingRows = measureFirst.filter((c) => fitsChain(geometry.get(c.id), c.aspect, null, null) && geometry.has(c.id)).length;
    if (measureFirst !== catalogue && fittingRows < target.length * 2) {
      const more = catalogue.filter((c) => !geometry.has(c.id) && !c.city).slice(0, MEASURE_MORE);
      if (more.length) geometry = await ensureDesignGeometry(sb, [...measureFirst, ...more].map((c) => c.id));
    }
  }
  const subjectsOf = (id: string) => subjectCount(geometry.get(id));
  const catLines = catalogue.map((c) =>
    `${c.design_code ?? c.id} | ${c.series_name ?? "—"} | aspect ${c.aspect.toFixed(2)}${c.aspect < 1 ? " (PORTRAIT)" : ""} | subjects ${subjectsOf(c.id) || "?"} | style ${geometry.get(c.id)?.style ?? "?"} | floor ${geometry.get(c.id)?.floorY == null ? (geometry.has(c.id) ? "none" : "?") : geometry.get(c.id)!.floorY!.toFixed(2)} | ${c.title}`);

  const prompt = `You are allocating wallpaper creatives across every wall of one retail store (walls measured and photographed in CLOCKWISE walking order — wall N+1 physically follows wall N).

THIS STORE: ${batch.title ?? "(untitled)"} — city ${batchCity ?? "(unknown)"}${batch.ship_city ? ` (ships to ${batch.ship_city})` : ""}. The city's own collection for this store is the series named after ${batchCity ?? "this city"}${batch.state ? ` or ${batch.state}` : ""} (e.g. "${batchCity ?? "City"} Collection"${batch.state ? ` or "${batch.state} Collection"` : ""}).

ACCOUNT STANDING RULES:
${standingRules || "(none)"}

HOUSE RULES, in priority order:
1. NO design may appear twice anywhere in the store. Never reuse an id.
2. Prefer designs from these series, in this order: ${seriesBrief.join(", ") || "(none given — use your judgement)"}. ONLY these series: never a design from any other series. If they run out, the code repeats a design from a non-adjacent wall rather than leave the brief.
${entranceRule(entranceInScope, batchCity ?? "city")}
3. Match each wall's design chain to what the photo shows the wall IS (the department, fixtures, mood). The creative sits ABOVE/BEHIND the racks in the photo.
3b. A wall may carry a SURVEYOR'S NOTE — written by the person who stood in front of it with a tape measure. It outranks your reading of the photograph on anything the photograph cannot show (what is behind a fixture, what is about to be moved, where a pipe or duct runs, which part of the wall will be hidden). Obey it, and if it changes what you would otherwise have chosen, say so in that wall's note.
4. A chain must COVER its wall: sum of (aspect × wall height) across the chain ≥ wall width. Use more designs for long walls rather than leaving them short.
4c. DENSITY: a LARGE PANEL (taller than 1.5 m and over 3 m², not a header band) must carry at least the number of subjects named on its wall line, in total across its chain — use multi-subject designs or chain several. One appliance on a 60 sq ft panel reads as empty (Narol staircase bay, 6 Oct 2026). Header bands are fine at one or two subjects per design.
4b. PLACEMENT: judge how the artwork will SIT once fitted to this wall. Each candidate's aspect is given; the wall's aspect is width÷height. A design whose aspect is far from the wall's gets cropped hard and its subject can end up cut or off-centre — prefer a shape that already suits. Tall narrow piers need portrait-native artwork (aspect below 1) with one clear subject. If the best available design would still crop badly, allocate it but SAY SO in that wall's note.
4d. ONE BAND, ONE LANGUAGE, ONE FLOOR: every design in a wall's chain must share one style (all "blocks" or all "scene"), stand on a floor (never floor "none"), and draw its floor close to the others' (floors within about 0.1 of each other). The composer drops any design that breaks this and repeats the rest to fill the wall — and a repeat is the one thing rule 1 forbids.
5. Adjacent walls read as one continuous clockwise journey — sequence series/subjects so the transition at each corner feels deliberate, and the platform line in the artwork carries level around the store.

WALLS TO ALLOCATE (photos attached above, in order):
${wallLines.join("\n")}
${locked.length ? `\nALREADY-SET WALLS (context for continuity — do NOT change, their designs are unavailable):\n${locked.map((w) => `Wall ${w.seq} "${w.name}": ${w.design_ids.length} design(s) fixed`).join("\n")}` : ""}

CANDIDATE DESIGNS (code | series | aspect | subjects | style | floor | title):
${catLines.join("\n")}

Return STRICT JSON only:
{"walls":[{"seq":1,"context":"<what this wall is, 8 words max>","designCodes":["ZYVS-......"],"note":"<optional>"}],"summary":"<2 sentences on the overall flow>","warnings":["..."]}`;

  type RawAllocation = {
    walls?: { seq?: number; context?: string; designCodes?: string[]; note?: string }[];
    summary?: string; warnings?: string[];
  };
  // GPT-6 Astra first, with the same schema as a structured output
  // (vs-openai.ts); Claude when it is unavailable.
  const viaOpenAI = await vsOpenAIJson<RawAllocation>({
    text: prompt,
    imagesJpegB64: wallImages.map((im) => (im.source as { data: string }).data),
    schema: { name: "allocate", schema: ALLOCATE_SCHEMA },
    maxOutputTokens: 16000,
  }, "allocate");
  let raw: RawAllocation;
  let chosenBy: string;
  if (viaOpenAI) {
    raw = viaOpenAI.json; chosenBy = viaOpenAI.model;
  } else {
    const anthropic = new Anthropic({ apiKey: anthropicKeyFor("vijaySales") });
    // The allocation comes back as a FORCED TOOL CALL, not free-text JSON. The
    // brace-scanner-then-JSON.parse it replaced choked whenever the model wrote a
    // raw newline or an unescaped quote inside a note/summary — a systematic
    // failure ("Expected ',' or '}' after property value", Vijay Sales 15 Sep
    // 2026), not a rare one. A tool call's input is validated JSON by the API, so
    // this cannot happen. (Same lesson as the print-QC "no JSON" fix.)
    const msg = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      tools: [{
        name: "allocate",
        description: "Return the wall-by-wall design allocation for the store.",
        input_schema: ALLOCATE_SCHEMA,
      }],
      tool_choice: { type: "tool", name: "allocate" },
      messages: [{ role: "user", content: [...wallImages, { type: "text", text: prompt }] }],
    });
    const toolUse = msg.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "allocate",
    );
    if (!toolUse) throw new Error("The allocator returned no allocation.");
    raw = toolUse.input as RawAllocation;
    chosenBy = AI_MODEL;
  }

  // ── Deterministic enforcement ─────────────────────────────────────────────
  const valid = new Map(candidates.map((c) => [c.id, c]));
  const used = new Set<string>(locked.flatMap((w) => w.design_ids));
  // Which walls each design already stands on, so a repeat (when the brief
  // runs out) never lands beside its twin.
  const usedOn = new Map<string, number[]>();
  for (const w of locked) for (const id of w.design_ids) usedOn.set(id, [...(usedOn.get(id) ?? []), w.seq]);
  const warnings: string[] = [...(raw.warnings ?? [])];
  if (raw.summary) warnings.unshift(raw.summary);
  warnings.push(`Designs chosen by ${chosenBy}.`);
  const perWall = new Map<string, { ids: string[]; context: string; note?: string }>();
  const pool = () => catalogue.filter((c) => !used.has(c.id));

  // The store's one floor line, as the composer will use it: the store's own
  // once set, else the median of what is measured (site-batch.ts compose).
  let floorLinePct: number | null = null;
  if (batch.store_id) {
    const { data: store } = await sb.from("corporate_stores").select("floor_line_pct").eq("id", batch.store_id).maybeSingle();
    floorLinePct = store?.floor_line_pct == null ? null : Number(store.floor_line_pct);
  }
  if (floorLinePct == null) floorLinePct = medianFloor([...geometry.values()].map((g) => g.floorY));
  const styleOf = (id: string) => geometry.get(id)?.style ?? null;
  // City artwork belongs to the entrance walls only (rule 2b): a top-up never
  // reaches for it on any other wall.
  const seqs = walls.map((w) => w.seq);
  const entranceSeqs = entranceInScope && seqs.length ? new Set([Math.min(...seqs), Math.max(...seqs)]) : new Set<number>();

  for (const w of target) {
    const pick = (raw.walls ?? []).find((x) => Number(x.seq) === w.seq);
    let ids: string[] = [];
    for (const code of pick?.designCodes ?? []) {
      const id = codeOf.get(String(code).trim().toUpperCase());
      if (id && valid.has(id) && !used.has(id)) { ids.push(id); used.add(id); }
    }
    // Keep only what the composer will keep (fitsChain); a design it would
    // drop goes back to the pool instead of leaving a gap the composer tiles.
    let style = chainStyle(ids.map(styleOf));
    const keep = ids.filter((id) => fitsChain(geometry.get(id), valid.get(id)!.aspect, style, floorLinePct));
    // All of them, if none fits (a wall of grids keeps nothing — 14 October
    // 2026: "keep.length > 0" let a wall of two stacked designs through).
    if (keep.length < ids.length) {
      for (const id of ids) if (!keep.includes(id)) used.delete(id);
      warnings.push(`Wall ${w.seq} (“${w.name}”): ${ids.length - keep.length} design(s) the composer would drop (no floor, other style, or beyond 1.25× to the floor line) were swapped for ones that fit.`);
      ids = keep;
      style = chainStyle(ids.map(styleOf));
    }
    const topUpOk = (c: Candidate) =>
      (entranceSeqs.has(w.seq) || !c.city) && fitsChain(geometry.get(c.id), c.aspect, style, floorLinePct);
    // Cover the width without tiling — tiling IS repetition. Top up from the
    // unused pool (preferred series first) until the chain reaches the wall.
    //
    // Guarded on real dimensions. Coverage is sum(aspect) × HEIGHT, so a wall
    // stored with height 0 (the ingest used to accept `Number(x) || 0`) makes
    // coverage permanently 0 and this loop allocates the ENTIRE approved
    // library to that one wall — which then blows past MAX_SEGMENTS in the
    // composer, fails, and used to be retried forever. Dimensions are
    // validated at every write now; this is the belt to that braces, because
    // the cost of being wrong here is the whole library and a runaway bill.
    const usable = w.width_mm > 0 && w.height_mm > 0;
    if (!usable) {
      warnings.push(`Wall ${w.seq} (“${w.name}”): measured ${w.width_mm}×${w.height_mm}mm, which cannot be covered. Re-measure this wall — it has been left with whatever the allocator chose and no automatic top-up.`);
    }
    const coverage = () => ids.reduce((s, id) => s + valid.get(id)!.aspect, 0) * w.height_mm;
    while (usable && coverage() < w.width_mm) {
      // Measured designs that fit first, then unmeasured ones that might,
      // then anything that is not city art off the entrance, then anything.
      const p = pool();
      // A design the composer would drop is never a top-up: it only comes
      // back as a tile of its neighbour.
      const next = p.find((c) => geometry.has(c.id) && topUpOk(c)) ?? p.find(topUpOk);
      if (!next) {
        // The brief ran out. Repeat one of ITS designs from a wall that is
        // not this one's neighbour (least used first) rather than reach
        // outside the brief or tile this wall's own design.
        const again = catalogue
          .filter((c) => !ids.includes(c.id) && geometry.has(c.id) && topUpOk(c)
            && !(usedOn.get(c.id) ?? []).some((q) => Math.abs(q - w.seq) <= 1))
          .sort((a, b) => (usedOn.get(a.id)?.length ?? 0) - (usedOn.get(b.id)?.length ?? 0))[0];
        if (!again) {
          warnings.push(`Wall ${w.seq} (“${w.name}”): the approved library ran out — the last design will tile to fill. Approve more designs to avoid repetition here.`);
          break;
        }
        warnings.push(`Wall ${w.seq} (“${w.name}”): repeats ${again.design_code ?? again.id} from another wall — the brief (${seriesBrief.join(", ") || "library"}) has no unused design that fits. New designs in the brief would end the repeat.`);
        ids.push(again.id);
        style = chainStyle(ids.map(styleOf));
        continue;
      }
      ids.push(next.id); used.add(next.id);
      style = chainStyle(ids.map(styleOf));
    }
    if (!ids.length) {
      const next = pool().find((c) => geometry.has(c.id) && topUpOk(c)) ?? pool().find(topUpOk);
      if (next) { ids.push(next.id); used.add(next.id); }
    }
    // Density, enforced like coverage. A large panel is near-square, so one
    // design fitted to its height already fills its width — appending more
    // designs would only add a sliver at the edge. What makes it dense is the
    // LEAD design carrying many subjects: if the pool holds a richer design
    // than the one chosen, it takes the lead and the chosen one goes back.
    // Unmeasured designs count as one subject, never zero.
    if (usable && wantsDenseComposition(w.width_mm, w.height_mm)) {
      const need = minSubjectsFor(w.width_mm, w.height_mm);
      const have = () => ids.reduce((s, id) => s + Math.max(1, subjectsOf(id)), 0);
      if (have() < need) {
        // Only a design the composer keeps may lead: the richest designs are
        // the grids, and a grid is never allocated (fitsChain).
        const richest = [...pool()].filter((c) => geometry.has(c.id) && topUpOk(c))
          .sort((a, b) => subjectsOf(b.id) - subjectsOf(a.id))[0];
        const lead = ids[0];
        if (richest && (!lead || subjectsOf(richest.id) > subjectsOf(lead))) {
          // The LEAD only: replacing the whole chain threw away its coverage
          // and left one design to tile the wall (Nelamangala walls 13–15,
          // 14 October 2026), with the rest still marked used.
          if (lead) used.delete(lead);
          ids.splice(0, 1, richest.id);
          used.add(richest.id);
        }
      }
      if (have() < need) {
        warnings.push(`Wall ${w.seq} (“${w.name}”): a large panel that should carry ${need} subjects has ${have()} — the library needs a denser, multi-appliance design for a panel this size.`);
      }
    }
    for (const id of ids) usedOn.set(id, [...(usedOn.get(id) ?? []), w.seq]);
    perWall.set(w.id, { ids, context: pick?.context ?? "", note: pick?.note });
  }
  return { perWall, warnings };
}

/** Compose ONE wall's print master (called repeatedly — one wall per request
 *  keeps each invocation far inside serverless time limits).
 *
 *  `done` means there is no wall left worth attempting; `failed` counts the
 *  walls that were attempted MAX_COMPOSE_ATTEMPTS times and never composed. The
 *  caller must not treat `done` alone as success — a batch with failed walls is
 *  incomplete and must never be proposed to a client as though it were whole. */
export async function composeNextWall(
  sb: SupabaseClient, accountSlug: string, batchId: string,
): Promise<{ done: boolean; wall?: string; error?: string; failed: number; waiting?: boolean; queued?: boolean }> {
  const loaded = await loadBatch(sb, batchId);
  if (!loaded) return { done: true, failed: 0, error: "Batch not found" };

  // A wall that has burned through its attempts is out of the running.
  //
  // The predicate used to be `design_ids.length > 0 && !art_json` with no
  // status term at all. A failed compose writes status='compose_failed' and
  // leaves art_json null, so the very next call selected the SAME wall, failed
  // the same way, and returned {done:false} — forever. The batch could never
  // leave 'allocated'. A human clicking curl notices on the second try; the
  // drive worker would have spent one Opus vision call and one sharp render per
  // tick until someone read the bill.
  const spent = (w: SiteBatchWall) => (w.compose_attempts ?? 0) >= MAX_COMPOSE_ATTEMPTS;
  // A wall pinned to artwork still being made waits; the rest compose now.
  // A wall handed to the artwork service is `composing` until the service
  // saves it (or fails it). One whose last marker is older than
  // COMPOSING_STALE_MS was lost with its container and is tried again.
  const composingNow = (w: SiteBatchWall) => w.status === "composing" && !composingStale(w.warning);
  const outstanding = loaded.walls.filter((w) => w.design_ids.length > 0 && !w.art_json && !awaitsArt(w) && !composingNow(w));
  const failed = outstanding.filter(spent).length;
  const next = outstanding.find((w) => !spent(w));
  if (!next) {
    const inFlight = loaded.walls.some((w) => !w.art_json && composingNow(w));
    return inFlight ? { done: false, waiting: true, failed } : { done: true, failed };
  }

  const attempt = (next.compose_attempts ?? 0) + 1;

  // SERIAL RUN (serial-run-rules.ts; Roheena, 25 October 2026): every wall is
  // laid as part of its run — whole designs one after another, a design that
  // reaches a corner carried on round it, cut only at the run's free ends.
  // The plan is computed from every wall of the batch each time, so walls of
  // one run composed on different ticks still meet at their corners.
  const batchIds = [...new Set(loaded.walls.flatMap((w) => w.design_ids))];
  await ensureDesignGeometry(sb, batchIds);
  const { data: sizes } = await sb.from("corporate_designs")
    .select("id, design_code, design_w_px, design_h_px, subjects").in("id", batchIds);
  const sizeOf = new Map((sizes ?? []).map((d) => [d.id as string, d]));
  const plan = planSerialRuns(
    loaded.walls.map((w) => ({
      seq: w.seq, widthMm: w.width_mm, heightMm: w.height_mm,
      turnsIntoNext: w.turns_into_next === true, designIds: w.design_ids,
    })),
    (id) => {
      const d = sizeOf.get(id);
      if (!d) return null;
      return {
        aspect: d.design_w_px && d.design_h_px ? Number(d.design_w_px) / Number(d.design_h_px) : null,
        subjects: Array.isArray(d.subjects) ? (d.subjects as { x0: number; x1: number }[]) : [],
        code: (d.design_code as string | null) ?? null,
      };
    },
  );
  const runError = plan.errors.get(next.seq);
  if (runError) {
    const exhausted = attempt >= MAX_COMPOSE_ATTEMPTS;
    await sb.from("corporate_site_batch_walls").update({
      status: "compose_failed", compose_attempts: attempt, warning: runError.slice(0, 600),
    }).eq("id", next.id);
    return { done: false, wall: next.name, error: runError, failed: failed + (exhausted ? 1 : 0) };
  }
  const strips = plan.strips.get(next.seq) ?? [];
  const runIds = [...new Set(strips.map((st) => st.id))];
  const { data: rows } = await sb.from("corporate_designs")
    .select("id, title, design_url, design_code, geometry_note").in("id", runIds);

  // ONE floor line per store, fixed. The first wall composed for a store sets
  // it from the median floor of every design allocated across the batch, and
  // every band in the store — this batch and every later one — is composed to
  // that same line (Roheena, 6 October 2026: "the floor line should always
  // match, irrespective of whether there's a column that breaks it"; "fixed
  // per store"). A batch with no store (pre-corporate_stores) composes to its
  // own median.
  let floorLinePct: number | null = null;
  const storeId = loaded.batch.store_id;
  if (storeId) {
    const { data: store } = await sb.from("corporate_stores").select("floor_line_pct").eq("id", storeId).maybeSingle();
    floorLinePct = store?.floor_line_pct == null ? null : Number(store.floor_line_pct);
  }
  if (floorLinePct == null) {
    const allIds = [...new Set(loaded.walls.flatMap((w) => w.design_ids))];
    const geo = await ensureDesignGeometry(sb, allIds);
    floorLinePct = medianFloor([...geo.values()].map((g) => g.floorY));
    if (storeId && floorLinePct != null) {
      await sb.from("corporate_stores").update({ floor_line_pct: floorLinePct }).eq("id", storeId).is("floor_line_pct", null);
    }
  }
  // Geometry was measured above for the whole batch (the run planner reads
  // the objects to keep its end cuts off them). A serial run needs nothing
  // else from it: the pieces are laid as planned.
  // The container holds its own service-role client, so no `sb` travels; the
  // module's union return ({pieces,…} | {error}) passes through verbatim.
  // A THROW is a failed attempt like any other, recorded on the wall with its
  // reason. Uncaught, it escaped the step before compose_attempts moved, so the
  // drive worker retried the same wall every tick with nothing on the row and
  // the walls behind it never composed (Narol wall 2, 7 October 2026: the
  // composer threw on a fractional crop for fifteen minutes in silence).
  // The image model that completes a painted patch with a whole appliance
  // (band-complete.ts) spends the Vijay Sales OpenAI key, handed to the
  // container with the request; what the artwork is comes from the designs'
  // own geometry notes, in the measuring model's words.
  const describe = [...new Set((rows ?? []).map((r) => (r as { geometry_note?: string | null }).geometry_note?.trim())
    .filter((n): n is string => Boolean(n) && !n!.startsWith("UNMEASURED")))].join("; ");
  // A marker before the call, and the container's stage markers after it, so
  // a compose that never returns still says where it stopped (Nelamangala
  // wall 4, 14 October 2026: three runs vanished on it with nothing on the
  // row). The result below overwrites it.
  // A STALE CONTAINER NEVER TAKES A WALL. A media release reaches the floor
  // only when the instance restarts, and an instance with walls in its queue
  // is never recycled — so on 14 October 2026 six Nelamangala walls were
  // composed by yesterday's rules and refused. Before handing a wall over,
  // ask the instance which rules it runs: an idle stale one is restarted
  // (the next request boots the current image); a busy stale one is left to
  // finish and this wall waits for the next tick.
  try {
    const h = await mediaHealthRemote();
    if (h.bandRulesVersion !== BAND_RULES_VERSION) {
      if (h.printQueue === 0 && !h.printing) await restartMediaRemote();
      else return { done: false, waiting: true, failed };
    }
  } catch (e) {
    console.error("[site-batch] media health before hand-off failed:", (e as Error)?.message);
  }
  //
  // HANDED OFF, NOT AWAITED (14 October 2026). The Worker used to hold this
  // request open for the whole compose — minutes, for a wall whose patch the
  // image model completes — and Cloudflare recycles a long request in a busy
  // isolate without a word: Nelamangala lost wall after wall that way, the
  // finished artwork with them, and a fifteen-wall store took hours. Now the
  // artwork service answers at once ("accepted"), composes the wall in its
  // own queue and SAVES it itself (status, art, warning). The wall reads
  // `composing` meanwhile; the next step hands over the next wall, and the
  // batch is done when no wall is left composing.
  await sb.from("corporate_site_batch_walls")
    .update({
      status: "composing", compose_attempts: attempt,
      warning: `Composer stage: sent to the artwork service at ${new Date().toISOString()} (attempt ${attempt})`,
    })
    .eq("id", next.id);
  const out = (await bandComposeRemote({
    accountSlug,
    rows: rows ?? [],
    orderedIds: runIds,
    strips,
    widthMm: next.width_mm,
    heightMm: next.height_mm,
    floorLinePct,
    openaiKey: vsOpenAIKey(),
    describe: describe || null,
    wallId: next.id,
    rulesVersion: BAND_RULES_VERSION,
    async: true,
    // Whole-wall mode, asked for on the wall (context_json.generate).
    generate: (next.context_json as { generate?: { seedId?: string | null } } | null)?.generate ?? null,
  }).catch((e: unknown) => ({
    error: `The artwork service failed composing this wall: ${String((e as Error)?.message ?? e).slice(0, 240)}`,
  }))) as Awaited<ReturnType<typeof composeBandPieces>> | { accepted: true };
  // Accepted: the service owns the wall now and saves it itself.
  if ("accepted" in out) return { done: false, wall: next.name, failed, queued: true };
  // A band from a composer running older rules is refused, and the stale
  // instance is restarted so the next try gets the current image — never
  // under a print file (Narol, 7 October 2026: a release that never reached
  // the running container recomposed every wall with yesterday's rules).
  if (!("error" in out) && (out as { rulesVersion?: string }).rulesVersion !== BAND_RULES_VERSION) {
    const got = (out as { rulesVersion?: string }).rulesVersion ?? "unversioned";
    let restarted = false;
    try {
      const h = await mediaHealthRemote();
      if (h.printQueue === 0 && !h.printing) { await restartMediaRemote(); restarted = true; }
    } catch (e) {
      console.error("[site-batch] stale composer restart failed:", (e as Error)?.message);
    }
    const error = `The artwork service composed with older rules (${got}, want ${BAND_RULES_VERSION}) — not used. `
      + (restarted ? "It has been restarted; the next try uses the current composer." : "It is finishing a print file and will be restarted on the next try.");
    const exhausted = attempt >= MAX_COMPOSE_ATTEMPTS;
    await sb.from("corporate_site_batch_walls").update({
      status: "compose_failed", compose_attempts: attempt, warning: error,
    }).eq("id", next.id);
    return { done: false, wall: next.name, error, failed: failed + (exhausted ? 1 : 0) };
  }
  if ("error" in out) {
    const exhausted = attempt >= MAX_COMPOSE_ATTEMPTS;
    await sb.from("corporate_site_batch_walls").update({
      status: "compose_failed",
      compose_attempts: attempt,
      warning: exhausted
        ? `${out.error} (gave up after ${attempt} attempts — re-allocate this wall to try again)`
        : out.error,
    }).eq("id", next.id);
    return { done: false, wall: next.name, error: out.error, failed: failed + (exhausted ? 1 : 0) };
  }
  // Mark the wall's surface in its own photo the first time it composes, so
  // the approver can see the creative standing on it. Never blocks: no quad
  // simply means the page shows photo and creative side by side.
  // Flat paint where the image model failed is a failed wall (bandOutcome).
  const outcome = bandOutcome(out);
  if (outcome.status === "compose_failed") {
    const exhausted = attempt >= MAX_COMPOSE_ATTEMPTS;
    const error = outcome.warning ?? "Not composed.";
    await sb.from("corporate_site_batch_walls").update({
      status: "compose_failed", compose_attempts: attempt,
      warning: exhausted ? `${error} (gave up after ${attempt} attempts)`.slice(0, 600) : error,
    }).eq("id", next.id);
    return { done: false, wall: next.name, error, failed: failed + (exhausted ? 1 : 0) };
  }
  const quad = next.quad_json
    ?? (next.photo_path ? await detectWallQuad(sb, next.photo_path, next.name) : null);
  await sb.from("corporate_site_batch_walls")
    .update({
      art_json: out.pieces, status: "composed", quad_json: quad,
      compose_attempts: attempt,
      // Clear the last failure. This was omitted, so a wall that failed once
      // and then composed cleanly on a retry kept its stale "compose failed"
      // warning in front of the approver forever. The composer's own notes
      // stay; a patch left flat never gets here (bandOutcome fails the wall).
      warning: outcome.warning,
    })
    .eq("id", next.id);
  return { done: false, wall: next.name, failed };
}


/** Put a batch back through composition WITHOUT telling the client anything.
 *
 *  composeNextWall only picks walls that have no artwork, so "recompose" means
 *  clearing the artwork — releasing a batch to 'allocated' with its art still
 *  on the walls composes nothing and bounces straight back to 'proposed' with
 *  the old composition, looking exactly like success (Narol, 6 October 2026:
 *  the same defect shipped through two "recomposes"). This is the one place
 *  that knows that, so nobody has to remember it by hand.
 *
 *  Never touches the revision, proposed_at or proposed_revision: a batch the
 *  client has already been mailed comes back to 'proposed' on the SAME link,
 *  and no second email is sent. Walls already ordered are frozen — they have
 *  been approved and released to print as they were. */
export async function requeueRecompose(
  sb: SupabaseClient, batchId: string,
): Promise<{ ok: true; walls: number } | { ok: false; error: string }> {
  const loaded = await loadBatch(sb, batchId);
  if (!loaded) return { ok: false, error: "Batch not found" };
  if (loaded.batch.status === "cancelled") return { ok: false, error: "This survey is cancelled." };
  const open = loaded.walls.filter((w) => w.status !== "ordered" && w.design_ids.length > 0);
  if (!open.length) return { ok: false, error: "Every wall is already ordered; nothing to recompose." };
  const { error: wallErr } = await sb.from("corporate_site_batch_walls")
    .update({ art_json: null, compose_attempts: 0, status: "allocated", warning: null })
    .in("id", open.map((w) => w.id));
  if (wallErr) return { ok: false, error: wallErr.message };
  const { error: batchErr } = await sb.from("corporate_site_batches")
    .update({ status: "allocated", drive_attempts: 0, drive_lease_until: null, error: null })
    .eq("id", batchId);
  if (batchErr) return { ok: false, error: batchErr.message };
  return { ok: true, walls: open.length };
}
