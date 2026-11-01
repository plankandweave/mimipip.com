import { currentCorporateSession } from "@/lib/corporate-auth";
import { imageNotesEnabled } from "@/lib/vault-image-notes";
import { isCleared, normaliseClearance } from "@/lib/marketing/library-record";
import { hasServiceRole, serviceClient } from "@/lib/marketing/db";
import { privateBucket } from "@/lib/r2-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await currentCorporateSession({ allowVaultUploadOnly: true });
  if (!session) return new Response("Not signed in", { status: 401 });
  if (session.agreementPending || !imageNotesEnabled(session.account.slug)) {
    return new Response("Not available for this account", { status: 403 });
  }
  if (!hasServiceRole()) return new Response("Unavailable", { status: 503 });
  // Only the reviewed institutional guide is shared, never caller-selected library media.
  const id = "e53e1149-a096-4f72-a57b-2a7905cbdbbf";
  const kind = new URL(req.url).searchParams.get("kind") === "cover" ? "cover" : "video";
  const { data, error } = await serviceClient().from("marketing_asset_library")
    .select("title,media_key,cover_key,clearance").eq("id", id).maybeSingle();
  if (error) return new Response("Storage error", { status: 500 });
  if (!data || !isCleared(normaliseClearance(data.clearance))) return new Response("Not available", { status: 404 });
  const key = kind === "cover" ? data?.cover_key : data?.media_key;
  if (!key) return new Response("Not found", { status: 404 });
  const bucket = await privateBucket();
  if (!bucket) return new Response("Unavailable", { status: 503 });
  const head = await bucket.head(key);
  if (!head) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "content-type": head.httpMetadata?.contentType ?? (kind === "cover" ? "image/jpeg" : "video/mp4"),
    "cache-control": "private, no-store",
    "accept-ranges": "bytes",
  });
  const range = req.headers.get("range");
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && kind === "video") {
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : head.size - 1;
    if (!match[1] && match[2]) { start = Math.max(0, head.size - Number(match[2])); end = head.size - 1; }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= head.size) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${head.size}` } });
    }
    end = Math.min(end, head.size - 1);
    const length = end - start + 1;
    const obj = await bucket.get(key, { range: { offset: start, length } });
    if (!obj) return new Response("Not found", { status: 404 });
    headers.set("content-range", `bytes ${start}-${end}/${head.size}`);
    headers.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  const obj = await bucket.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  headers.set("content-length", String(head.size));
  return new Response(obj.body, { headers });
}
