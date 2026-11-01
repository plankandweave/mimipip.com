import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { artPathOf } from "@/lib/corporate-files";
import { caDownload } from "@/lib/corporate-art-store";
import { thumbnailBytesRemote } from "@/lib/media-client";
import { geometryIsCurrent, type CompositionStyle, type DesignGeometry, type SubjectBox } from "@/lib/band-geometry";
import { anthropicKeyFor } from "@/lib/ai-keys";
import { firstJsonObject, vsOpenAIJson } from "@/lib/vs-openai";

// Where the FLOOR is and where the SUBJECTS are inside a design — measured
// once by vision, stored on corporate_designs, and read by every wall the
// design ever lands on (the same contract as design-focal.ts).
//
// Why both exist: the band composer fits every design to the band's height,
// which only keeps the platform line level if every design draws its floor
// at the same height. They do not — on the Narol proposal (6 October 2026)
// televisions stood lower than the cans beside them, and the run's last copy
// was cut straight through a tablet. With the floor measured, the composer
// pins every design's floor to the store's one line; with the subjects
// measured, it cuts a run only in the background between them.

const GEOMETRY_MODEL = "claude-opus-5";

const GEOMETRY_PROMPT = `This artwork is one segment of a long wallpaper band in a retail store: segments from different artworks sit side by side, and the FLOOR the objects stand on must read as one continuous line across all of them. The band may also be cut off at its end, and that cut must fall in background, never through an object.

Measure two things, as fractions of the image (0.0–1.0, origin top-left):

1. floorY — the height of the floor / ground / platform line the main objects stand on, measured where their bases touch it. If objects float or there is no ground plane, return null.
2. subjects — a bounding box for EVERY distinct object or figure (each appliance separately, not one box for the group), with a 1–3 word label. Ignore shadows, brush texture and colour patches. Return them left to right.

3. style — which visual language the design speaks: "blocks" when each object sits alone on its own flat colour panel, "scene" when the objects share one continuous scene (they overlap, cast shadows, stand among props or clutter). If neither fits (a pure pattern), return null.

Return STRICT JSON only:
{"floorY": 0.0-1.0 or null, "subjects":[{"x0":0.0,"x1":0.0,"y0":0.0,"y1":0.0,"label":"..."}], "style":"blocks"|"scene"|null, "note":"<one short phrase about the composition>"}`;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const cleanStyle = (v: unknown): CompositionStyle | null =>
  v === "blocks" || v === "scene" ? v : null;

function cleanSubjects(raw: unknown): SubjectBox[] {
  if (!Array.isArray(raw)) return [];
  const out: SubjectBox[] = [];
  for (const s of raw.slice(0, 24)) {
    if (!s || typeof s !== "object") continue;
    const b = s as Record<string, unknown>;
    const x0 = Number(b.x0), x1 = Number(b.x1), y0 = Number(b.y0), y1 = Number(b.y1);
    if (![x0, x1, y0, y1].every(Number.isFinite)) continue;
    const box: SubjectBox = {
      x0: clamp01(Math.min(x0, x1)), x1: clamp01(Math.max(x0, x1)),
      y0: clamp01(Math.min(y0, y1)), y1: clamp01(Math.max(y0, y1)),
    };
    if (box.x1 - box.x0 < 0.01) continue;
    if (typeof b.label === "string" && b.label.trim()) box.label = b.label.trim().slice(0, 40);
    out.push(box);
  }
  return out.sort((a, b) => a.x0 - b.x0);
}

/** Measure any designs that lack geometry, persist it, and return it for all.
 *  Fails open to "no floor, no subjects" — a vision hiccup must never block a
 *  composition; the composer then does what it always did for that design. */
/** Vision measurements in flight at once. */
export const MEASURE_CONCURRENCY = 6;

export async function ensureDesignGeometry(
  sb: SupabaseClient, designIds: string[],
): Promise<Map<string, DesignGeometry>> {
  const out = new Map<string, DesignGeometry>();
  const ids = [...new Set(designIds)];
  if (!ids.length) return out;
  const { data: rows } = await sb.from("corporate_designs")
    .select("id, design_url, floor_y, subjects, composition_style, geometry_measured_at").in("id", ids);

  // Six at a time (Nelamangala, 13 October 2026): a library of ~100 unmeasured
  // designs measured one by one outlived every drive tick, so the store never
  // got past allocation. Each design is independent; the map is filled per id.
  const queue = [...(rows ?? [])];
  const measureNext = async (): Promise<void> => {
    for (let r = queue.shift(); r; r = queue.shift()) await measureOne(r);
  };
  const measureOne = async (r: NonNullable<typeof rows>[number]): Promise<void> => {
    const id = r.id as string;
    const cached: DesignGeometry | null = r.geometry_measured_at ? {
      floorY: r.floor_y == null ? null : clamp01(Number(r.floor_y)),
      subjects: cleanSubjects(r.subjects),
      style: cleanStyle(r.composition_style),
    } : null;
    // A design measured before the style question existed has no style, and
    // never will unless it is asked again (see geometryIsCurrent).
    if (cached && geometryIsCurrent(r as { geometry_measured_at: string | null; composition_style: string | null })) {
      out.set(id, cached);
      return;
    }
    let geo: DesignGeometry = { floorY: null, subjects: [] };
    let note: string | null = null;
    let sawArtwork = false;
    let failure: string | null = null;
    try {
      // BYTES, never a URL: Anthropic's image fetcher obeys robots.txt and
      // our /api is disallowed, so a signed link dies silently — which is how
      // the first run stamped fourteen designs "measured" with no geometry at
      // all (6 Oct 2026; same lesson as the allocate pass, 15 Sep 2026).
      const path = artPathOf(r.design_url as string);
      const dl = path ? await caDownload(path) : { data: null, error: { message: "no artwork path" } };
      if (!dl.data) failure = `artwork download: ${dl.error?.message ?? "empty"}`;
      if (dl.data) {
        const small = await thumbnailBytesRemote(await dl.data.arrayBuffer(), { width: 1100, quality: 80 });
        const b64 = small.toString("base64");
        type Reply = { floorY?: unknown; subjects?: unknown; style?: unknown; note?: unknown };
        let reply: Reply | null = null;
        let model = GEOMETRY_MODEL;
        // GPT-6 Astra first (vs-openai.ts); Claude when it is unavailable.
        const viaOpenAI = await vsOpenAIJson<Reply>({ text: GEOMETRY_PROMPT, imagesJpegB64: [b64], maxOutputTokens: 4000 }, "design-geometry");
        if (viaOpenAI) {
          reply = viaOpenAI.json; model = viaOpenAI.model;
        } else if (!anthropicKeyFor("vijaySales")) {
          failure = "no OpenAI or Anthropic key here";
        } else {
          const anthropic = new Anthropic({ apiKey: anthropicKeyFor("vijaySales") });
          const msg = await anthropic.messages.create({
            model: GEOMETRY_MODEL,
            // A dense grid (nine appliances, each with a box and a label) ran past
            // 1,200 tokens and the reply was cut before its closing brace (VS1,
            // 7 October 2026).
            max_tokens: 4000,
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
                { type: "text", text: GEOMETRY_PROMPT },
              ],
            }],
          });
          const text = msg.content.find((b) => b.type === "text")?.text ?? "";
          reply = firstJsonObject<Reply>(text);
          if (!reply) failure = `vision reply carried no JSON (stop: ${msg.stop_reason ?? "?"}; "${text.slice(0, 80)}")`;
        }
        if (reply) {
          sawArtwork = true;
          const f = Number(reply.floorY);
          geo = {
            floorY: reply.floorY == null || !Number.isFinite(f) ? null : clamp01(f),
            subjects: cleanSubjects(reply.subjects),
            style: cleanStyle(reply.style),
          };
          // Which model measured it, on the row a person reads.
          const said = typeof reply.note === "string" ? reply.note.slice(0, 170) : "";
          note = `${said}${said ? " " : ""}[${model}]`;
        }
      }
    } catch (e) {
      console.error("[design-geometry] measure failed, composing without:", id, (e as Error)?.message);
      failure = `measure threw: ${String((e as Error)?.message ?? e)}`;
      sawArtwork = false;
    }
    // "Measured" means the model actually SAW the artwork. A failed fetch or
    // a thrown call leaves measured_at null, so the next composition tries
    // again instead of carrying an empty verdict forever.
    if (sawArtwork) {
      const { error } = await sb.from("corporate_designs").update({
        floor_y: geo.floorY, subjects: geo.subjects, geometry_note: note,
        composition_style: geo.style ?? null,
        geometry_measured_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) failure = `saving the measurement: ${error.message}`;
    }
    // A failure is written where a person will read it — the design's own
    // geometry note — and measured_at stays null so the next composition
    // tries again. Silence here is how Narol composed four times unmeasured.
    if (failure) {
      await sb.from("corporate_designs")
        .update({ geometry_note: `UNMEASURED: ${failure}`.slice(0, 300) })
        .eq("id", id).then(() => undefined, () => undefined);
    }
    // A re-measure that failed keeps what was already known.
    out.set(id, sawArtwork ? geo : (cached ?? geo));
  };
  await Promise.all(Array.from({ length: MEASURE_CONCURRENCY }, measureNext));
  return out;
}

/** Design codes among `designIds` whose geometry is still not current — the
 *  measurement failed or never ran. ensureDesignGeometry fails OPEN so a vision
 *  hiccup cannot throw; the caller that is about to spend a render must ask
 *  this afterwards and refuse to compose blind. */
export async function unmeasuredDesignCodes(
  sb: SupabaseClient, designIds: string[],
): Promise<string[]> {
  const ids = [...new Set(designIds)];
  if (!ids.length) return [];
  const { data: rows } = await sb.from("corporate_designs")
    .select("id, design_code, composition_style, geometry_measured_at, geometry_note").in("id", ids);
  const stale = (rows ?? []).filter((r) =>
    !geometryIsCurrent(r as { geometry_measured_at: string | null; composition_style: string | null }));
  const why = (r: { geometry_note?: unknown }) => {
    const n = String(r.geometry_note ?? "");
    return n.startsWith("UNMEASURED: ") ? ` (${n.slice(12)})` : "";
  };
  // A row that did not come back at all is also unmeasured.
  const seen = new Set((rows ?? []).map((r) => r.id as string));
  return [
    ...stale.map((r) => `${String(r.design_code ?? r.id)}${why(r)}`),
    ...ids.filter((i) => !seen.has(i)),
  ];
}
