import { z } from "zod";

/** v1 coordinates refer to the FINISHED wall, after design crop/flip. Tile is 2:1. */
const letteringFields = z.object({
  version: z.literal(1),
  kind: z.enum(["cloud", "quote"]),
  text: z.string().trim().min(1, "Enter your text to see the preview.").max(180, "Use at most 180 characters."),
  font: z.enum(["inter", "jakarta", "devanagari"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  background: z.string().regex(/^(none|#[0-9a-fA-F]{6})$/),
  align: z.enum(["left", "center", "right"]),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().min(0.12).max(0.8),
  shape: z.literal("scalloped").optional(),
}).strict().superRefine((o, ctx) => {
  const error = (message: string) => ctx.addIssue({ code: "custom", message });
  if (o.kind === "cloud" && (Array.from(o.text).length > 24 || o.text.includes("\n"))) error("Use a name of up to 24 characters.");
  if (o.text.split("\n").length > 5) error("Use at most five lines.");
  if (/[\p{Cc}\p{Cf}]/u.test(o.text.replaceAll("\n", ""))) error("Remove unsupported control characters.");
  if (o.color.toLowerCase() === o.background.toLowerCase()) error("Choose different text and background colours.");
});
export const textOverlaySchema = letteringFields.safeExtend({
  companion: letteringFields.refine(o => o.kind === "quote", "The second lettering item must be a quote.").optional(),
});
export type TextOverlay = z.infer<typeof textOverlaySchema>;
export const defaultTextOverlay = (kind: TextOverlay["kind"]): TextOverlay => ({
  version: 1, kind, shape: "scalloped", text: "", font: kind === "cloud" ? "jakarta" : "inter",
  color: "#273746", background: kind === "cloud" ? "#fff8ed" : "none",
  align: "center", x: .3, y: .2, width: .4,
});
export function overlayPlacementError(o: TextOverlay, wallWidth: number, wallHeight: number,
  doors: {offsetCm: number; widthCm: number; heightCm: number; sillCm?: number}[] = []): string | null {
  const x = o.x * wallWidth, y = o.y * wallHeight, w = o.width * wallWidth, h = w / 2;
  if (!(wallWidth > 0 && wallHeight > 0)) return "Enter your wall dimensions.";
  if (Math.min(x, y, wallWidth-x-w, wallHeight-y-h) < 1.999) return "Keep the lettering at least 2 cm inside the wall edges. Move it or reduce its size.";
  // y runs from the wall top; an opening spans [wallHeight−sill−height, wallHeight−sill].
  if (doors.some(d => x < d.offsetCm+d.widthCm && x+w > d.offsetCm && y+h > wallHeight-(d.sillCm ?? 0)-d.heightCm && y < wallHeight-(d.sillCm ?? 0))) return "Move the lettering clear of the marked door, window or furniture.";
  if (o.companion) return overlayPlacementError(o.companion, wallWidth, wallHeight, doors);
  return null;
}
export function clampOverlayPosition(o: TextOverlay, x: number, y: number, wallWidth: number, wallHeight: number): TextOverlay {
  const mx = 2 / wallWidth, my = 2 / wallHeight, h = o.width * wallWidth / (2 * wallHeight);
  return { ...o, x: Math.max(mx, Math.min(1-mx-o.width, x)), y: Math.max(my, Math.min(1-my-h, y)) };
}

