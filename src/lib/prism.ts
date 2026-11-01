import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropicKeyFor } from "@/lib/ai-keys";
import { caDownload } from "@/lib/corporate-art-store";
import { signArt, DAY } from "@/lib/corporate-files";
import { thumbnailBytesRemote } from "@/lib/media-client";
import { searchProducts } from "@/lib/concierge-tools";
import { getFlatImageMap } from "@/lib/queries";
import { detectWallQuad, type Quad } from "@/lib/wall-quad";
import { loadPulse, loadVault, type BlueprintWallRow, type PulseWall } from "@/lib/vault";
import type { BlueprintRow } from "@/lib/trace-link";
import { mediaRendition, toMediaUrl } from "@/lib/media-url";
import { presentedFilm } from "@/lib/lumen";
import {
  alignWalls, dedupeLeads, nextRevision, PRISM_VERSION, proposalHeadline,
  type Candidate, type Narrative, type ProposalStatus,
} from "@/lib/prism-rules";

// ─── Prism: the campus design engine ────────────────────────────────────────
//
// Prism reads everything the Blueprint has gathered — the brief, the meeting
// notes and brand material in the Vault, every wall on the Pulse board with
// its photograph, size and brief — and writes ONE DIRECTION for the whole
// campus: a story, a palette, motifs, the journeys people walk, and a concept
// for every wall. Then it goes looking in the catalogue for designs that
// could carry each concept, by real search, so it can never name a design
// that does not exist. The founder answers in words; each answer becomes a
// new revision. What Prism says is a proposal; what she approves is the
// design.
//
// Two rules that matter:
//   · The board decides how many walls there are. A revision covers every
//     live wall and no other (alignWalls); the model cannot add or drop one.
//   · A proposal reaches the college only when Pulse says every wall is
//     ready (presentable). Exploring earlier is fine and is how she thinks.

const MODEL = "claude-opus-5";
const MAX_DOC_CHARS = 14_000;
const MAX_WALLS_WITH_PHOTOS = 24;

const SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  required: ["direction", "standfirst", "theme", "palette", "motifs", "journeys", "walls", "summary"],
  properties: {
    direction: { type: "string" as const },
    standfirst: { type: "string" as const },
    theme: { type: "string" as const },
    palette: {
      type: "array" as const,
      items: { type: "object" as const, additionalProperties: false, required: ["name", "hex", "purpose"],
        properties: { name: { type: "string" as const }, hex: { type: "string" as const }, purpose: { type: "string" as const } } },
    },
    motifs: {
      type: "array" as const,
      items: { type: "object" as const, additionalProperties: false, required: ["name", "description"],
        properties: { name: { type: "string" as const }, description: { type: "string" as const } } },
    },
    journeys: {
      type: "array" as const,
      items: { type: "object" as const, additionalProperties: false, required: ["who", "route", "body"],
        properties: { who: { type: "string" as const }, route: { type: "array" as const, items: { type: "string" as const } }, body: { type: "string" as const } } },
    },
    walls: {
      type: "array" as const,
      items: {
        type: "object" as const, additionalProperties: false,
        required: ["seq", "title", "rationale", "concept", "mood", "scale", "voiceLine", "searchPhrases", "commissioned", "commissionNote"],
        properties: {
          seq: { type: "integer" as const },
          title: { type: "string" as const },
          rationale: { type: "string" as const },
          concept: { type: "string" as const },
          mood: { type: "string" as const },
          scale: { type: "string" as const, enum: ["mural", "band", "panel"] },
          voiceLine: { type: "string" as const },
          searchPhrases: { type: "array" as const, items: { type: "string" as const } },
          commissioned: { type: "boolean" as const },
          commissionNote: { anyOf: [{ type: "string" as const }, { type: "null" as const }] },
        },
      },
    },
    summary: { type: "string" as const },
  },
};

export type ProposalRow = {
  id: string; blueprint_id: string; account_id: string; revision: number; direction: string;
  status: ProposalStatus; narrative: Narrative & { candidates?: Record<string, Candidate[]> };
  instruction: string | null; model: string | null; created_by_email: string | null;
  presented_at: string | null; created_at: string;
};
export type MessageRow = { id: string; blueprint_id: string; role: "founder" | "prism"; body: string; proposal_id: string | null; author_email: string | null; created_at: string };
export type PreviewRow = { id: string; proposal_id: string; wall_id: string; product_handle: string; chosen: boolean; quad_json: Quad | null; render_path: string | null; render_error: string | null; created_at: string };

const LANG: Record<string, string> = { ta: "Tamil", kn: "Kannada", hi: "Hindi", te: "Telugu", mr: "Marathi", ml: "Malayalam", en: "English" };

/** The photographs the model will look at: one per live wall, downscaled in
 *  the media container. A wall whose picture cannot be read is described in
 *  words only; the run never stops for a picture. */
async function wallPictures(walls: BlueprintWallRow[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const w of walls.slice(0, MAX_WALLS_WITH_PHOTOS)) {
    if (!w.photo_path) continue;
    try {
      const { data } = await caDownload(w.photo_path);
      if (!data) continue;
      const small = await thumbnailBytesRemote(await data.arrayBuffer(), { width: 1100, quality: 72 });
      out.set(w.id, Buffer.from(small).toString("base64"));
    } catch (e) {
      console.error("[prism] picture skipped:", w.id, (e as Error)?.message);
    }
  }
  return out;
}

/** Everything written down about the project, within a budget: the brief
 *  first, then meeting notes, brand material and notes, newest first. */
function dossier(blueprint: BlueprintRow, docs: { kind: string; title: string; body: string | null; observedOn: string | null }[]): string {
  const parts: string[] = [];
  if (blueprint.brief) parts.push(`BRIEF\n${blueprint.brief}`);
  const texts = docs.filter((d) => d.body).sort((a, b) => (a.kind === "brand" ? -1 : 0) - (b.kind === "brand" ? -1 : 0));
  let budget = MAX_DOC_CHARS;
  for (const d of texts) {
    const body = (d.body ?? "").trim();
    if (!body) continue;
    const take = body.slice(0, Math.max(0, Math.min(body.length, budget)));
    if (!take) break;
    parts.push(`${d.kind.toUpperCase()}${d.observedOn ? ` (${d.observedOn})` : ""} · ${d.title}\n${take}`);
    budget -= take.length;
    if (budget <= 0) break;
  }
  return parts.join("\n\n");
}

export async function composeProposal(sb: SupabaseClient, blueprint: BlueprintRow, input: {
  instruction?: string | null; byEmail: string | null;
}): Promise<{ ok: true; proposal: ProposalRow } | { ok: false; error: string }> {
  if (!anthropicKeyFor("prism")) return { ok: false, error: "Prism has no key to spend (ANTHROPIC_KEY_PRISM or the shared key)." };

  const [{ documents }, pulse, { data: prevRows }, { data: msgRows }] = await Promise.all([
    loadVault(sb, blueprint),
    loadPulse(sb, blueprint),
    sb.from("prism_proposals").select("*").eq("blueprint_id", blueprint.id).order("revision", { ascending: false }).limit(1),
    sb.from("prism_messages").select("*").eq("blueprint_id", blueprint.id).order("created_at", { ascending: false }).limit(12),
  ]);
  const previous = (prevRows?.[0] as ProposalRow | undefined) ?? null;
  const history = ((msgRows ?? []) as MessageRow[]).reverse();
  const live = pulse.walls.filter((w) => !w.dropped);
  if (live.length === 0) return { ok: false, error: "There are no walls on the board yet. Prism designs walls, not air." };

  const { data: wallRows } = await sb.from("blueprint_walls").select("*").eq("blueprint_id", blueprint.id).neq("status", "dropped").order("seq");
  const rows = (wallRows ?? []) as BlueprintWallRow[];
  const pictures = await wallPictures(rows);

  const wallLines = live.map((w) => [
    `Wall ${w.seq}: ${w.name}`,
    w.location ? `  where: ${w.location}` : null,
    w.widthMm && w.heightMm ? `  size: ${(w.widthMm / 1000).toFixed(2)} m wide × ${(w.heightMm / 1000).toFixed(2)} m high${w.sizeSource === "spoken" ? " (as spoken, unconfirmed)" : ""}` : "  size: not measured yet",
    w.brief ? `  the college says: ${w.brief}` : "  the college has not said what it should do yet",
    pictures.has(w.id) ? "  photograph: attached below" : "  photograph: none",
  ].filter(Boolean).join("\n")).join("\n\n");

  const language = LANG[blueprint.language] ?? blueprint.language;
  const content: Anthropic.MessageCreateParams["messages"][number]["content"] = [{
    type: "text",
    text: `You are Prism ${PRISM_VERSION}, Zyvorah's campus design engine. Zyvorah curates the walls of institutions: large printed murals, bands and panels, each with a QR that speaks about the artwork in the house voice. You are writing ONE DIRECTION for the whole campus of ${blueprint.name}${blueprint.city ? ` in ${blueprint.city}` : ""}, to be reviewed by Roheena, the founder, who will answer in words and ask for changes.

WHAT ZYVORAH BELIEVES: a wall is a story, not decoration. The entrance says who the institution is; corridors carry the stories of what is studied there; a library is quiet; a canteen is colour; a hostel corridor says you belong. Campus walls are read by a student from a smaller town arriving somewhere built to feel large — the design must make them feel they belong. Every wall must stand alone AND read as one range across the campus. Prefer artwork over slogans; never typography as the idea. The campus language is ${language}: the spoken layer will greet in it, so each wall's voiceLine is written in English but should be the kind of line that translates naturally.

THE PROJECT DOSSIER
${dossier(blueprint, documents)}

THE WALLS (${live.length})
${wallLines}
${previous ? `\nTHE PREVIOUS DIRECTION (revision ${previous.revision}, "${previous.direction}")\n${JSON.stringify({ standfirst: previous.narrative.standfirst, theme: previous.narrative.theme, palette: previous.narrative.palette, motifs: previous.narrative.motifs, walls: previous.narrative.walls.map((w) => ({ seq: w.seq, title: w.title, concept: w.concept })) })}` : ""}
${history.length ? `\nTHE CONVERSATION SO FAR\n${history.map((m) => `${m.role === "founder" ? "Roheena" : "Prism"}: ${m.body}`).join("\n")}` : ""}
${input.instruction ? `\nROHEENA NOW SAYS\n${input.instruction}\n\nRevise the direction to do what she asks. Keep what she did not ask to change.` : previous ? "\nWrite a DIFFERENT direction from the previous one: another story the same campus could tell, so she has options." : ""}

Return JSON only, matching the schema:
- direction: two to four words naming the direction.
- standfirst: one sentence a visitor would read first.
- theme: a paragraph on the story and how it moves through the campus.
- palette: 3 to 5 colours with hex and what each is for.
- motifs: 2 to 4 recurring motifs and what they mean here.
- journeys: 1 to 3 people (a first-year student, a parent on open day, a professor) and the walls they pass, in order, as the route, with a line on what they feel.
- walls: EXACTLY one entry per wall above, same seq. title (3 to 6 words), rationale (why this wall gets this), concept (what the artwork shows, how it is composed, where the eye goes; concrete enough to brief an artist), mood, scale (mural: the whole wall; band: a horizontal band; panel: a framed field), voiceLine (one sentence the wall would say aloud to someone who scans its QR, in the first person of the campus, English), searchPhrases (2 to 3 short phrases describing artwork that could carry this, as a shopper would type them: motif + style, e.g. "watercolour banyan tree", "line art city map", "indigo block print"), commissioned (true when no catalogue design could be right and an artist should paint it), commissionNote (what to commission, or null).
- summary: three sentences for Roheena on what this direction does and where she might push back.`,
  }];
  for (const w of rows) {
    const b64 = pictures.get(w.id);
    if (!b64) continue;
    content.push({ type: "text", text: `Photograph of wall ${w.seq} (${w.name}):` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } });
  }

  let narrative: Narrative;
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKeyFor("prism") });
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    });
    const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    if (!text) return { ok: false, error: "Prism returned nothing readable." };
    const parsed = JSON.parse(text) as Narrative;
    narrative = { ...parsed, walls: alignWalls(parsed.walls ?? [], live.map((w) => ({ seq: w.seq, name: w.name }))) };
  } catch (e) {
    console.error("[prism] compose failed:", (e as Error)?.message);
    return { ok: false, error: "Prism could not be reached. Nothing was changed; try again in a moment." };
  }

  // Candidates from the catalogue, by real search, then no design leading
  // two walls. Searches are cheap; a wall marked commissioned still gets
  // candidates so she can disagree with the commission.
  const perWall = await Promise.all(narrative.walls.map(async (w) => {
    const seen = new Map<string, Candidate>();
    for (const phrase of w.searchPhrases.slice(0, 3)) {
      try {
        const hits = await searchProducts(phrase, 4);
        for (const h of hits) if (!seen.has(h.handle)) seen.set(h.handle, { handle: h.handle, title: h.title, image: h.image, flat: null, why: phrase });
      } catch (e) { console.error("[prism] search failed:", phrase, (e as Error)?.message); }
      if (seen.size >= 6) break;
    }
    return { seq: w.seq, candidates: [...seen.values()].slice(0, 6) };
  }));
  const deduped = dedupeLeads(perWall);
  const handles = [...new Set(deduped.flatMap((w) => w.candidates.map((c) => c.handle)))];
  const flats = handles.length ? await getFlatImageMap(handles).catch(() => ({} as Record<string, string | null>)) : {};
  const candidates: Record<string, Candidate[]> = {};
  for (const w of deduped) candidates[String(w.seq)] = w.candidates.map((c) => ({ ...c, flat: flats[c.handle] ?? null }));

  const revision = nextRevision(previous?.revision);
  if (previous && previous.status !== "presented") {
    await sb.from("prism_proposals").update({ status: "superseded" }).eq("id", previous.id);
  }
  const { data: row, error } = await sb.from("prism_proposals").insert({
    blueprint_id: blueprint.id, account_id: blueprint.account_id, revision,
    direction: narrative.direction.slice(0, 80), status: "draft",
    narrative: { ...narrative, candidates }, instruction: input.instruction ?? null,
    model: `${MODEL} · Prism ${PRISM_VERSION}`, created_by_email: input.byEmail,
  }).select("*").single();
  if (error || !row) return { ok: false, error: "Prism wrote a direction but it could not be saved." };
  const proposal = row as ProposalRow;

  await sb.from("prism_messages").insert({
    blueprint_id: blueprint.id, role: "prism", proposal_id: proposal.id,
    body: `${proposalHeadline(narrative, revision)}\n\n${narrative.summary}`,
  });
  if (blueprint.status === "collecting" || blueprint.status === "ready") {
    await sb.from("campus_blueprints").update({ status: "designing", updated_at: new Date().toISOString() }).eq("id", blueprint.id);
  }

  // The lead candidate on every photographed wall gets a preview row with
  // the wall plane, found once per photograph and kept on the wall.
  for (const w of rows) {
    const lead = candidates[String(w.seq)]?.[0];
    if (!lead || !w.photo_path) continue;
    let quad = (w.quad_json as Quad | null) ?? null;
    if (!quad) {
      quad = await detectWallQuad(sb, w.photo_path, w.name, "commercial", "prism");
      if (quad) await sb.from("blueprint_walls").update({ quad_json: quad }).eq("id", w.id);
    }
    await sb.from("prism_wall_previews").upsert({
      proposal_id: proposal.id, wall_id: w.id, product_handle: lead.handle, chosen: true, quad_json: quad,
    }, { onConflict: "proposal_id,wall_id,product_handle" });
  }
  return { ok: true, proposal };
}

/** Switch the design shown on one wall of a proposal to another candidate. */
export async function choosePreview(sb: SupabaseClient, proposal: ProposalRow, wall: BlueprintWallRow, handle: string): Promise<boolean> {
  let quad = (wall.quad_json as Quad | null) ?? null;
  if (!quad && wall.photo_path) {
    quad = await detectWallQuad(sb, wall.photo_path, wall.name, "commercial", "prism");
    if (quad) await sb.from("blueprint_walls").update({ quad_json: quad }).eq("id", wall.id);
  }
  await sb.from("prism_wall_previews").update({ chosen: false }).eq("proposal_id", proposal.id).eq("wall_id", wall.id);
  const { error } = await sb.from("prism_wall_previews").upsert({
    proposal_id: proposal.id, wall_id: wall.id, product_handle: handle, chosen: true, quad_json: quad,
  }, { onConflict: "proposal_id,wall_id,product_handle" });
  return !error;
}

export type PrismDesk = {
  blueprint: { id: string; name: string; city: string | null; language: string; status: string; accountName: string; accountSlug: string };
  readiness: Awaited<ReturnType<typeof loadPulse>>["readiness"];
  walls: (PulseWall & { quad: Quad | null })[];
  proposal: (ProposalRow & { headline: string; previews: (PreviewRow & { artUrl: string | null; renderUrl: string | null })[] }) | null;
  revisions: { id: string; revision: number; direction: string; status: ProposalStatus; createdAt: string }[];
  messages: MessageRow[];
};

/** Everything the desk shows for one Blueprint. */
export async function loadPrismDesk(sb: SupabaseClient, blueprint: BlueprintRow, account: { name: string; slug: string }): Promise<PrismDesk> {
  const [pulse, { data: propRows }, { data: msgRows }, { data: wallRows }] = await Promise.all([
    loadPulse(sb, blueprint),
    sb.from("prism_proposals").select("*").eq("blueprint_id", blueprint.id).order("revision", { ascending: false }).limit(30),
    sb.from("prism_messages").select("*").eq("blueprint_id", blueprint.id).order("created_at").limit(200),
    sb.from("blueprint_walls").select("id, quad_json").eq("blueprint_id", blueprint.id),
  ]);
  const proposals = (propRows ?? []) as ProposalRow[];
  const current = proposals.find((p) => p.status !== "superseded") ?? proposals[0] ?? null;
  const quads = new Map(((wallRows ?? []) as { id: string; quad_json: Quad | null }[]).map((w) => [w.id, w.quad_json]));
  let proposal: PrismDesk["proposal"] = null;
  if (current) {
    const { data: prevRows } = await sb.from("prism_wall_previews").select("*").eq("proposal_id", current.id);
    const previews = await Promise.all(((prevRows ?? []) as PreviewRow[]).map(async (p) => {
      const cands = current.narrative.candidates ?? {};
      const wall = pulse.walls.find((w) => w.id === p.wall_id);
      const cand = wall ? (cands[String(wall.seq)] ?? []).find((c) => c.handle === p.product_handle) : undefined;
      const flat = cand?.flat ?? null;
      return {
        ...p,
        artUrl: flat ? mediaRendition(toMediaUrl(flat), 1920) : null,
        renderUrl: p.render_path ? await signArt(sb, p.render_path, DAY) : null,
      };
    }));
    proposal = { ...current, headline: proposalHeadline(current.narrative, current.revision), previews };
  }
  return {
    blueprint: { id: blueprint.id, name: blueprint.name, city: blueprint.city, language: blueprint.language, status: pulse.status, accountName: account.name, accountSlug: account.slug },
    readiness: pulse.readiness,
    walls: pulse.walls.map((w) => ({ ...w, quad: quads.get(w.id) ?? null })),
    proposal,
    revisions: proposals.map((p) => ({ id: p.id, revision: p.revision, direction: p.direction, status: p.status, createdAt: p.created_at })),
    messages: (msgRows ?? []) as MessageRow[],
  };
}

export const prismRenderPath = (slug: string, previewId: string) => `prism/${slug}/${previewId}.jpg`;

/* ───────────────────── What the college sees in its Vault ───────────────── */

export type PresentedWall = {
  wallId: string; seq: number; name: string; location: string | null;
  widthMm: number | null; heightMm: number | null;
  title: string; concept: string; rationale: string; mood: string;
  commissioned: boolean; commissionNote: string | null;
  /** The design on the wall: a catalogue piece, or null when it is commissioned. */
  design: { handle: string; title: string; artUrl: string | null } | null;
  photoUrl: string | null; quad: Quad | null; renderUrl: string | null;
};

export type PresentedProposal = {
  revision: number; headline: string; presentedAt: string | null;
  /** Lumen's film of this proposal, once the founder has presented it. */
  film: { url: string; posterUrl: string | null; durationS: number | null; title: string } | null;
  direction: string; standfirst: string; theme: string; summary: string;
  palette: Narrative["palette"]; motifs: Narrative["motifs"]; journeys: Narrative["journeys"];
  walls: PresentedWall[];
};

/**
 * The proposal the college may see: ONLY a presented revision, never a draft
 * the founder is still talking to Prism about — and only what a reader needs
 * (the story, each wall's concept, the chosen design on its photograph).
 * Candidates, search phrases, the instruction and the model name stay on the
 * desk. Null until the founder presses Present.
 */
export async function loadPresentedProposal(sb: SupabaseClient, blueprint: BlueprintRow): Promise<PresentedProposal | null> {
  const { data: row } = await sb.from("prism_proposals").select("*").eq("blueprint_id", blueprint.id).eq("status", "presented")
    .order("revision", { ascending: false }).limit(1).maybeSingle();
  const p = row as ProposalRow | null;
  if (!p) return null;
  const [{ data: wallRows }, { data: prevRows }] = await Promise.all([
    sb.from("blueprint_walls").select("*").eq("blueprint_id", blueprint.id).neq("status", "dropped").order("seq"),
    sb.from("prism_wall_previews").select("*").eq("proposal_id", p.id).eq("chosen", true),
  ]);
  const walls = (wallRows ?? []) as BlueprintWallRow[];
  const chosen = new Map(((prevRows ?? []) as PreviewRow[]).map((r) => [r.wall_id, r]));
  const cands = p.narrative.candidates ?? {};
  const out: PresentedWall[] = [];
  for (const w of walls) {
    const c = p.narrative.walls.find((x) => x.seq === w.seq);
    if (!c) continue;
    const pv = chosen.get(w.id) ?? null;
    const cand = pv ? (cands[String(w.seq)] ?? []).find((x) => x.handle === pv.product_handle) ?? null : null;
    out.push({
      wallId: w.id, seq: w.seq, name: w.name, location: w.location, widthMm: w.width_mm, heightMm: w.height_mm,
      title: c.title, concept: c.concept, rationale: c.rationale, mood: c.mood,
      commissioned: c.commissioned, commissionNote: c.commissionNote,
      design: c.commissioned || !cand ? null : { handle: cand.handle, title: cand.title, artUrl: cand.flat ? mediaRendition(toMediaUrl(cand.flat), 1920) : null },
      photoUrl: w.photo_path ? await signArt(sb, w.photo_path, DAY) : null,
      quad: pv?.quad_json ?? (w.quad_json as Quad | null) ?? null,
      renderUrl: pv?.render_path ? await signArt(sb, pv.render_path, DAY) : null,
    });
  }
  return {
    revision: p.revision, headline: proposalHeadline(p.narrative, p.revision), presentedAt: p.presented_at,
    film: await presentedFilm(sb, p.id),
    direction: p.narrative.direction, standfirst: p.narrative.standfirst, theme: p.narrative.theme, summary: p.narrative.summary,
    palette: p.narrative.palette, motifs: p.narrative.motifs, journeys: p.narrative.journeys, walls: out,
  };
}
