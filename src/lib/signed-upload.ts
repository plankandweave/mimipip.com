/**
 * Put a file in `product-images` without the browser holding write access.
 *
 * The server mints a one-path, one-hour token (see /api/admin/sign-upload
 * and /api/custom-upload); the bytes then PUT to /api/media-upload, which
 * writes them to R2 through the Worker's binding. The token carries its own
 * authorization, scoped to exactly one path — the browser can neither choose
 * nor change where the bytes land.
 *
 * (Pre-R2 this was Supabase's uploadToSignedUrl, and the bytes bypassed the
 * app because of Vercel's ~4.5MB body cap. The Worker has no such cap.)
 */

export type SignedTarget = { path: string; token: string; publicUrl: string };

/** Upload to an already-signed target and return the durable public URL. */
export async function putSigned(target: SignedTarget, file: Blob, contentType?: string): Promise<string> {
  const res = await fetch("/api/media-upload", {
    method: "PUT",
    headers: {
      "x-upload-token": target.token,
      "content-type": contentType || file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `upload failed (${res.status})`);
  }
  return target.publicUrl;
}

/** Ask the signer for a target. The PATH IS THE SERVER'S to choose — callers
 *  describe what they are uploading, never where it goes. Authorised by the
 *  staff sign-in the request already carries. */
export async function signAdminUpload(
  intent: { kind: "studio-flat"; ext: string; hash: string }
        | { kind: "studio-picture"; ext: string }
        | { kind: "admin-design"; ext: string; folder: string },
): Promise<SignedTarget> {
  const res = await fetch("/api/admin/sign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(intent),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.token) throw new Error(j?.error ?? "Could not authorise the upload.");
  return { path: j.path, token: j.token, publicUrl: j.publicUrl };
}

/** File extension, normalised the way the signer expects. */
export function extOf(file: File, fallback = "png"): string {
  const raw = (file.name.split(".").pop() || fallback).toLowerCase().replace(/[^a-z0-9]/g, "");
  return raw || fallback;
}
