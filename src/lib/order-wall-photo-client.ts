// Browser half of an order's wall photo: shrink on the device, sign, PUT
// straight to storage, commit. Same steps as the survey's sendPhoto
// (partners/[slug]/area-walls.tsx); the route re-reads what landed.

const MAX_EDGE_PX = 2200;
const JPEG_QUALITY = 0.82;

/** Re-encode through a canvas so what leaves the phone is a right-way-up JPEG
 *  of known size. createImageBitmap applies EXIF orientation for us. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("Could not read that photo.");
  return blob;
}

export async function uploadOrderWallPhoto(orderId: string, file: File): Promise<void> {
  const blob = await shrink(file);
  const route = `/api/corporate/orders/${orderId}/wall-photo`;
  const signRes = await fetch(route, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sign", bytes: blob.size, contentType: "image/jpeg" }),
  });
  const sign = await signRes.json().catch(() => ({}));
  if (!signRes.ok || !sign.ok) throw new Error(sign.error ?? "Could not start the upload.");
  const put = await fetch(sign.signedUrl as string, {
    method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob,
  });
  if (!put.ok) throw new Error("The photo didn't upload — check your connection and try again.");
  const commitRes = await fetch(route, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "commit" }),
  });
  const commit = await commitRes.json().catch(() => ({}));
  if (!commitRes.ok || !commit.ok) throw new Error(commit.error ?? "That photo didn't save.");
}
