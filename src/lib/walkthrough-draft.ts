import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { TranscriptSegment } from "./transcribe";
import { spokenSizeToMm } from "./wall-measure";
import { anthropicKeyFor, type AiWorkflow } from "@/lib/ai-keys";

// Turning a narrated walk into a list of walls somebody can confirm.
//
// Anthropic rather than OpenAI, and not for cost reasons: the same model
// already reads site photographs here (detectWallQuad, allocateDesigns), and
// keeping the reasoning on one provider means the walkthrough does not stop
// working the day an image account runs out of credit — which is exactly the
// state the transcription half is in as this is written.
//
// WHAT THIS IS AND IS NOT ALLOWED TO DO.
//
//   It attaches WHAT WAS SAID to WHERE IT WAS SAID. The walker tapped once per
//   wall, so the walls are already known and already counted; this does not get
//   to invent, merge or drop any of them. All it decides is which sentences
//   belong to which tap, what to call each wall, and whether a measurement was
//   spoken aloud.
//
//   It must never produce a dimension nobody said. A wall with a plausible
//   invented size is far worse than a wall with no size: an unmeasured wall is
//   obviously unfinished, whereas a wrongly measured one is quoted, printed and
//   delivered wrong. Sizes that ARE spoken come back flagged as estimates and
//   stay flagged all the way to the quote.

const MODEL = "claude-opus-5";
const MAX_MARKS = 40;

export type MarkForDraft = {
  seq: number;
  atSeconds: number;
};

export type DraftedMark = {
  seq: number;
  name: string;
  brief: string | null;
  widthMm: number | null;
  heightMm: number | null;
  sizeEstimated: boolean;
};

export type DraftResult =
  | { ok: true; marks: DraftedMark[] }
  | { ok: false; error: string };

/**
 * Draft one wall per tap, from what was said around it.
 *
 * Fails soft, always. A walkthrough whose drafting fails still has its video,
 * its stills and its taps — a person can name the walls themselves, which is
 * exactly what they would have done anyway. Returning an error here costs
 * wording, never the walk.
 */
export async function draftWallsFromWalkthrough(input: {
  buildingName: string;
  areaLabel: string;
  transcript: string;
  segments?: TranscriptSegment[];
  marks: MarkForDraft[];
  /** Whose key pays: the signed-in partner's (partnerWorkflow). */
  workflow?: AiWorkflow;
}): Promise<DraftResult> {
  const workflow = input.workflow ?? "proposals";
  const marks = input.marks.slice(0, MAX_MARKS);
  if (marks.length === 0) return { ok: false, error: "no walls were marked during the walk" };
  if (!input.transcript.trim()) return { ok: false, error: "there is no transcript to read" };
  if (!anthropicKeyFor(workflow)) return { ok: false, error: "drafting is not configured" };

  // Timed lines where we have them, otherwise the flat transcript. Timings are
  // what let a sentence be attached to the tap it was spoken next to, so they
  // are worth the larger prompt when they exist.
  const body = input.segments?.length
    ? input.segments.map((s) => `[${s.start.toFixed(0)}s] ${s.text}`).join("\n")
    : input.transcript;

  const taps = marks.map((m) => `- tap ${m.seq} at ${m.atSeconds.toFixed(0)}s`).join("\n");

  try {
    const anthropic = new Anthropic({ apiKey: anthropicKeyFor(workflow) });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `Someone walked "${input.areaLabel}" in ${input.buildingName} — a commercial building — recording a video and talking as they went. Each time they stood in front of a wall they want treated, they tapped once. Here is what they said, and when they tapped.

TRANSCRIPT
${body}

TAPS
${taps}

For EACH tap, in order, give:
- "name": a short name for that wall, in the walker's own terms where they gave one ("facing the entrance", "behind reception"). If they named nothing, describe it plainly from what they were talking about. Never leave it blank.
- "brief": what they want that wall to say or do, in their words, condensed to a sentence or two. Null if they said nothing about intent for this wall.
- "width"/"height" + "unit": ONLY if a measurement for THIS wall was actually spoken aloud. Unit is one of mm, cm, m, ft, in. If no measurement was spoken, use null — this is the normal case and is completely fine.

Rules that matter:
- Return exactly ${marks.length} entries, one per tap, in tap order. Do not merge, split, add or drop walls — the taps decide how many walls there are.
- NEVER invent or estimate a dimension. A wall with no size is correct and expected; a wall with a made-up size gets quoted and printed wrong.
- Speech may switch between English, Hindi and Marathi. Write the name and brief in English.
- Ignore chatter that is not about the walls.

Return STRICT JSON only:
{"walls":[{"seq":1,"name":"…","brief":"…"|null,"width":null,"height":null,"unit":null}]}`,
      }],
    });

    const text = msg.content.find((b) => b.type === "text")?.text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, error: "the drafting pass returned nothing readable" };

    const parsed = JSON.parse(m[0]) as {
      walls?: { seq?: unknown; name?: unknown; brief?: unknown; width?: unknown; height?: unknown; unit?: unknown }[];
    };
    const rows = Array.isArray(parsed.walls) ? parsed.walls : [];

    // Driven by OUR taps, not by the model's list: an answer that returned the
    // wrong number of walls cannot silently change how many walls exist.
    const bySeq = new Map<number, (typeof rows)[number]>();
    for (const r of rows) {
      const seq = Math.round(Number(r?.seq));
      if (Number.isFinite(seq)) bySeq.set(seq, r);
    }

    const out: DraftedMark[] = marks.map((mark) => {
      const r = bySeq.get(mark.seq);
      const name = String(r?.name ?? "").trim().slice(0, 160) || `Wall ${mark.seq}`;
      const brief = String(r?.brief ?? "").trim().slice(0, 4000) || null;
      // Both sides or neither. One spoken dimension is not a size, and a wall
      // carrying a width with no height would read as measured while being
      // unusable — the shape of half-truth that gets quoted wrong later.
      const w = spokenSizeToMm(r?.width, r?.unit);
      const h = spokenSizeToMm(r?.height, r?.unit);
      const both = w !== null && h !== null;
      return {
        seq: mark.seq,
        name,
        brief: brief && brief.toLowerCase() !== "null" ? brief : null,
        widthMm: both ? w : null,
        heightMm: both ? h : null,
        sizeEstimated: both,
      };
    });

    return { ok: true, marks: out };
  } catch (e) {
    console.error("[walkthrough-draft]", e);
    return { ok: false, error: "the drafting pass could not be reached — the walk is saved and can be drafted later" };
  }
}
