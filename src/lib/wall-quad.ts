import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { caDownload } from "@/lib/corporate-art-store";
import { thumbnailBytesRemote } from "@/lib/media-client";
import type { Point } from "@/lib/homography";
import { anthropicKeyFor, type AiWorkflow } from "@/lib/ai-keys";
import { firstJsonObject, vsOpenAIJson } from "@/lib/vs-openai";

// Where the printable wall surface sits inside its own site photograph.
//
// The store's room visualiser has always warped a design onto a quad the
// CUSTOMER marked by dragging four corners. A partner survey has no such
// moment — sixteen photos arrive at once from a phone in a showroom — so
// vision marks the quad instead, and the approver sees each creative standing
// on the real wall rather than as a flat swatch beside it.
//
// Corners are fractions of the photo, [tl, tr, br, bl], exactly the order and
// space RoomVisualizer uses, so the same homography renders both.

const QUAD_MODEL = "claude-opus-5";

export type Quad = [Point, Point, Point, Point];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * What kind of printable surface to look for.
 *
 * 'retail' is the original and stays the default, so every existing caller
 * behaves exactly as before: a showroom wall's printable area is the blank band
 * ABOVE the racking and below the services, not the whole wall.
 *
 * 'commercial' is a lift lobby, an arrival hall, a corridor in an office tower.
 * There is no racking, the surface usually runs floor to ceiling, and asking for
 * "the band above the shelving" on such a photo makes the model invent a band —
 * which is worse than no quad at all, because a mockup drawn on an imagined
 * strip looks deliberate.
 */
export type SurfaceKind = "retail" | "commercial";

const PROMPT: Record<SurfaceKind, (wallName: string) => string> = {
  retail: (wallName) =>
    `This is a photo of a retail showroom wall called "${wallName}". Wallpaper will be applied to the BLANK UPPER BAND of this wall — the plain painted/concrete strip ABOVE the wooden racking, shelving and products, and BELOW the ceiling and its services.

Give the four corners of that printable band as it appears in the photo, following its perspective (the far end is smaller than the near end).`,

  commercial: (wallName) =>
    `This is a photo of a wall in a commercial building — a lift lobby, arrival area or shared amenity — called "${wallName}". Wallpaper will be applied to ONE FLAT WALL PLANE in this photo: the plain, unbroken surface that is the subject of the shot.

Give the four corners of that wall plane as it appears in the photo, following its perspective (the far edge is smaller than the near edge).

Take the surface as far as it actually runs — these walls are usually floor to ceiling and can be very wide. Do NOT include the ceiling, the floor, a return wall at a different angle, or anything mounted on the wall (lift doors, glazing, signage, artwork, skirting). If two walls meet in the photo, choose the larger flat one and stop at the corner where they meet.`,
};

function sane(q: unknown): Quad | null {
  if (!Array.isArray(q) || q.length !== 4) return null;
  const pts = q.map((p) => {
    const o = p as { x?: unknown; y?: unknown };
    const x = Number(o?.x), y = Number(o?.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x: clamp01(x), y: clamp01(y) } : null;
  });
  if (pts.some((p) => !p)) return null;
  const [tl, tr, br, bl] = pts as Quad;
  // A believable wall: corners in the right order, and big enough to be the
  // subject of the photo rather than a sliver vision imagined.
  if (tr.x <= tl.x || br.x <= bl.x) return null;
  if (bl.y <= tl.y || br.y <= tr.y) return null;
  const w = Math.min(tr.x - tl.x, br.x - bl.x);
  const h = Math.min(bl.y - tl.y, br.y - tr.y);
  if (w < 0.15 || h < 0.08) return null;
  return [tl, tr, br, bl];
}

/** Judge the wall quad for one site photo. Fails soft: null means "show the
 *  photo and the creative side by side, as before" — never a bad mockup. */
export async function detectWallQuad(
  sb: SupabaseClient, photoPath: string, wallName: string,
  kind: SurfaceKind = "retail",
  /** Whose key pays. Vijay Sales by default, as before; Prism passes its own. */
  workflow: AiWorkflow = "vijaySales",
): Promise<Quad | null> {
  const text = `${PROMPT[kind](wallName)}

Coordinates are FRACTIONS of the image: x from 0 at the left edge to 1 at the right, y from 0 at the top to 1 at the bottom. Order strictly: top-left, top-right, bottom-right, bottom-left of the surface itself.

If that surface is not clearly visible in this photo, return {"quad":null,"why":"<short reason>"}. Saying so is much better than guessing — a mockup drawn on the wrong plane looks deliberate and will mislead whoever approves it.

Return STRICT JSON only:
{"quad":[{"x":0.0,"y":0.0},{"x":1.0,"y":0.0},{"x":1.0,"y":0.4},{"x":0.0,"y":0.35}],"why":"<what you identified>"}`;
  try {
    // The photo travels as BYTES: a signed /api link is refused by an image
    // fetcher that obeys robots.txt (the allocate pass, 15 Sep 2026).
    const dl = await caDownload(photoPath);
    if (!dl.data) return null;
    const b64 = (await thumbnailBytesRemote(await dl.data.arrayBuffer(), { width: 1400, quality: 80 })).toString("base64");
    // Vijay Sales walls ask GPT-6 Astra first (vs-openai.ts); Prism keeps its own key and model.
    if (workflow === "vijaySales") {
      const viaOpenAI = await vsOpenAIJson<{ quad?: unknown }>({ text, imagesJpegB64: [b64], maxOutputTokens: 1500 }, "wall-quad");
      if (viaOpenAI) return sane(viaOpenAI.json.quad);
    }
    const anthropic = new Anthropic({ apiKey: anthropicKeyFor(workflow) });
    const msg = await anthropic.messages.create({
      model: QUAD_MODEL,
      max_tokens: 500,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
          { type: "text", text },
        ],
      }],
    });
    const parsed = firstJsonObject<{ quad?: unknown }>(msg.content.find((b) => b.type === "text")?.text ?? "");
    return parsed ? sane(parsed.quad) : null;
  } catch {
    return null;
  }
}
