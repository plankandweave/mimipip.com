import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY, artPathOf, signArt } from "@/lib/corporate-files";
import { anthropicKeyFor } from "@/lib/ai-keys";

// Where the SUBJECT sits inside a design.
//
// The composer fits artwork to the band's height and crops the overflow. It
// used to crop from the left edge, which is only correct by accident: a
// square appliance still-life on a 1.2:1 column had its subject shoved off to
// one side (wall 13, Bhosari, 18 Aug 2026). Vision judges the focal point
// ONCE per design and it is stored, so every future wall that design lands on
// is composed around the subject instead of around the file's left edge.

const FOCAL_MODEL = "claude-opus-5";

export type Focal = { x: number; y: number; note?: string };
export const CENTRE: Focal = { x: 0.5, y: 0.5 };

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Judge focal points for any designs that lack one, and persist them.
 *  Fails open to centre — a vision hiccup must never block a composition. */
export async function ensureFocalPoints(
  sb: SupabaseClient, designIds: string[],
): Promise<Map<string, Focal>> {
  const out = new Map<string, Focal>();
  if (!designIds.length) return out;
  const { data: rows } = await sb.from("corporate_designs")
    .select("id, design_url, focal_x, focal_y, focal_note").in("id", designIds);

  for (const r of rows ?? []) {
    const id = r.id as string;
    if (r.focal_x != null && r.focal_y != null) {
      out.set(id, { x: Number(r.focal_x), y: Number(r.focal_y), note: (r.focal_note as string) ?? undefined });
      continue;
    }
    let focal = CENTRE;
    try {
      const path = artPathOf(r.design_url as string);
      const url = path ? await signArt(sb, path, DAY) : null;
      if (url) {
        const anthropic = new Anthropic({ apiKey: anthropicKeyFor("vijaySales") });
        const msg = await anthropic.messages.create({
          model: FOCAL_MODEL,
          max_tokens: 300,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "url", url } },
              { type: "text", text: `This artwork will be cropped to fit a wall of a different shape. Give the VISUAL CENTRE OF INTEREST — the point that must survive the crop and sit centred on the wall (the main product, the face, the focal object; not the empty background).\n\nReturn STRICT JSON only: {"x":0.0-1.0,"y":0.0-1.0,"subject":"<3-6 words>"}  where x is across from the left edge and y is down from the top.` },
            ],
          }],
        });
        const text = msg.content.find((b) => b.type === "text")?.text ?? "";
        const m = text.match(/\{[\s\S]*?\}/);
        if (m) {
          const j = JSON.parse(m[0]) as { x?: number; y?: number; subject?: string };
          if (Number.isFinite(j.x) && Number.isFinite(j.y)) {
            focal = { x: clamp(Number(j.x)), y: clamp(Number(j.y)), note: j.subject };
          }
        }
      }
    } catch {
      /* fail open to centre */
    }
    await sb.from("corporate_designs").update({
      focal_x: focal.x, focal_y: focal.y, focal_note: focal.note ?? null,
    }).eq("id", id).then(() => undefined, () => undefined);
    out.set(id, focal);
  }
  return out;
}
