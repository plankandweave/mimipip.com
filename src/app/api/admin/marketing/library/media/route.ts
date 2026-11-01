import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole, serviceClient } from "@/lib/marketing/db";
import { privateBucket } from "@/lib/r2-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  if (!hasServiceRole()) return new Response("Unavailable", { status: 503 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const kind = url.searchParams.get("kind") === "cover" ? "cover" : "video";
  const download = kind === "video" && url.searchParams.get("download") === "1";
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Invalid asset", { status: 400 });
  const { data, error } = await serviceClient().from("marketing_asset_library")
    .select("title,media_key,cover_key").eq("id", id).maybeSingle();
  if (error) return new Response("Storage error", { status: 500 });
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
  if (download) {
    const filename = String(data?.title ?? "Zyvorah film")
      .normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "Zyvorah-film";
    headers.set("content-disposition", `attachment; filename="${filename}.mp4"`);
  }
  const range = req.headers.get("range");
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && kind === "video" && !download) {
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
