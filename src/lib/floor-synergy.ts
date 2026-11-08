import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@/brand/database-types";
import { caDownload } from "@/lib/corporate-art-store";
import { thumbnailBytesRemote } from "@/lib/media-client";
import type { SiteBatchWall } from "@/lib/site-batch";
import { SYNERGY_PREFIX, withoutSynergyNotes } from "@/lib/band-geometry";
import { anthropicKeyFor } from "@/lib/ai-keys";
import { firstJsonObject, vsOpenAIJson } from "@/lib/vs-openai";

// The step a human art director does last and the pipeline never did: stand
// back and look at the WHOLE floor at an angle, every composed wall in its
// clockwise order, and ask whether they read as one project — background
// palettes in harmony, the floor line carrying level from wall to wall, no
// wall the odd one out (Roheena, 6 October 2026: "it should view it from an
// angle, looking at the entire project floor-wise, to make sure that it
// looks in synergy").
//
// Runs ONCE per compose cycle, after the last wall composes and before the
// batch is shown or proposed. Its findings land in the batch's warnings, in
// front of whoever reviews the proposal; it never blocks the pipeline and it
// never sends anything. Fails open: a vision hiccup means no review, not a
// stuck batch.

const SYNERGY_MODEL = "claude-opus-5";
const MAX_WALLS = 10;
const THUMB_W = 760;

export type SynergyVerdict = { inSynergy: boolean; notes: string[] };

export async function reviewFloorSynergy(
  walls: SiteBatchWall[],
): Promise<SynergyVerdict | null> {
  const composed = walls
    .filter((w) => (w.art_json ?? []).length > 0)
    .sort((a, b) => a.seq - b.seq)
    .slice(0, MAX_WALLS);
  if (composed.length < 2) return null;

  // Pieces travel as BYTES, not URLs — Anthropic's URL fetcher obeys
  // robots.txt and our /api is disallowed (the allocate pass hit exactly
  // this on 15 Sep 2026).
  const content: Anthropic.MessageParam["content"] = [];
  const images: string[] = [];
  const captions: string[] = [];
  for (const w of composed) {
    const p = w.art_json![0]!;
    if (!p.path) return null;
    const dl = await caDownload(p.path);
    if (dl.error || !dl.data) return null;
    const small = await thumbnailBytesRemote(await dl.data.arrayBuffer(), { width: THUMB_W, quality: 70 });
    const caption = `WALL ${w.seq} · "${w.name}" · ${(w.width_mm / 1000).toFixed(2)} × ${(w.height_mm / 1000).toFixed(2)} m${(w.art_json!.length > 1) ? ` · piece 1 of ${w.art_json!.length}` : ""}`;
    const b64 = Buffer.from(small).toString("base64");
    captions.push(`Image ${images.length + 1}: ${caption}`);
    images.push(b64);
    content.push({ type: "text", text: caption });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } });
  }
  const brief = `These are the composed wallpaper bands for ONE retail floor, in the clockwise order a customer walks them. Judge them the way an art director does on site: standing at an angle where several walls are visible at once, reading the floor as ONE project.

Check, in order of importance:
1. BACKGROUND PALETTE — do the colour patches harmonise wall to wall, or does one wall's background family break the room?
2. FLOOR LINE — does the line the objects stand on read level and continuous from wall to wall (columns between walls are fine; a jump in height is not)?
3. ODD ONE OUT — does any wall differ in style, density or subject scale enough to read as a different project?

Be concrete and name walls by their number. An empty notes list with inSynergy true means the floor reads as one project.

Return STRICT JSON only:
{"inSynergy": true|false, "notes": ["Wall N: <what breaks and what would fix it>", ...]}`;
  content.push({ type: "text", text: brief });

  try {
    type Reply = { inSynergy?: unknown; notes?: unknown };
    // GPT-6 Astra first (vs-openai.ts); Claude when it is unavailable.
    const viaOpenAI = await vsOpenAIJson<Reply>(
      { text: `${captions.join("\n")}\n\n${brief}`, imagesJpegB64: images, maxOutputTokens: 2000 }, "floor-synergy");
    let j: Reply | null = viaOpenAI?.json ?? null;
    if (!j) {
      if (!anthropicKeyFor("vijaySales")) return null;
      const anthropic = new Anthropic({ apiKey: anthropicKeyFor("vijaySales") });
      const msg = await anthropic.messages.create({
        model: SYNERGY_MODEL, max_tokens: 1000,
        messages: [{ role: "user", content }],
      });
      j = firstJsonObject<Reply>(msg.content.find((b) => b.type === "text")?.text ?? "");
    }
    if (!j) return null;
    return {
      inSynergy: j.inSynergy === true,
      notes: (Array.isArray(j.notes) ? j.notes : []).map(String).map((s) => s.trim()).filter(Boolean).slice(0, 8),
    };
  } catch (e) {
    console.error("[floor-synergy] review failed, composing without:", (e as Error)?.message);
    return null;
  }
}

/** Apply a cycle's verdict to the batch's warnings: fresh synergy notes in
 *  front, the previous cycle's removed, everything else kept. */
export async function recordSynergy(
  sb: SupabaseClient,
  batchId: string,
  allocationJson: { warnings?: string[]; summary?: string } | null,
  verdict: SynergyVerdict | null,
): Promise<void> {
  if (!verdict) return;
  const kept = withoutSynergyNotes(allocationJson?.warnings);
  const fresh = verdict.inSynergy ? [] : verdict.notes.map((n) => `${SYNERGY_PREFIX}${n}`);
  await sb.from("corporate_site_batches").update({
    allocation_json: { ...(allocationJson ?? {}), warnings: [...fresh, ...kept] },
  }).eq("id", batchId).then(() => undefined, () => undefined);
}
