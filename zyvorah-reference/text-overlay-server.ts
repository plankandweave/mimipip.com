import { textOverlaySchema, type TextOverlay } from "./text-overlay";

/** Private server-to-server render; text never appears in URLs or public caches. */
export async function renderTextOverlay(overlay: TextOverlay, widthPx = 1200): Promise<Response> {
  const clean = textOverlaySchema.parse(overlay);
  const base = process.env.MIMAKI_BACKEND_URL;
  const key = process.env.MIMAKI_SERVICE_KEY;
  if (!base || !key) throw new Error("Lettering renderer is unavailable");
  const r = await fetch(`${base.replace(/\/$/, "")}/text-overlay/render`, {
    method: "POST", headers: { "content-type": "application/json", "X-Service-Key": key },
    body: JSON.stringify({ overlay: clean, width_px: Math.max(120, Math.min(12000, Math.round(widthPx))) }),
    signal: AbortSignal.timeout(20_000), cache: "no-store",
  });
  if (!r.ok) {
    if (r.status === 422) throw new Error("The text cannot fit or contains characters unavailable in this font. Shorten it or choose another font.");
    throw new Error("Lettering preview is temporarily unavailable. Please retry.");
  }
  if (!r.headers.get("content-type")?.includes("image/png")) throw new Error("Invalid lettering preview");
  if (clean.companion) await (await renderTextOverlay(clean.companion, widthPx)).arrayBuffer();
  return r;
}

