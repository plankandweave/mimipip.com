import { publishingFetch as fetch } from "../../../brand/publishing-transport";
/** Shared real resumable transport. Default query preserves the ordinary publisher. */
export type UploadMetadata = {
  snippet: { title: string; description: string; categoryId: string };
  status: { privacyStatus: "public" | "private"; selfDeclaredMadeForKids: boolean };
};
export type UploadedVideo = { id?: string; status?: { privacyStatus?: string }; error?: { message?: string } };

export async function startYouTubeUpload(token: string, metadata: UploadMetadata, size: number, notifySubscribers?: false): Promise<string> {
  const query = "uploadType=resumable&part=snippet,status" + (notifySubscribers === false ? "&notifySubscribers=false" : "");
  const start = await fetch(`https://www.googleapis.com/upload/youtube/v3/videos?${query}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(size) },
    body: JSON.stringify(metadata),
  });
  if (!start.ok) {
    const err = await start.json().catch(() => null);
    throw new Error(`YT resumable start: ${err?.error?.message || start.status}`);
  }
  const url = start.headers.get("location");
  if (!url) throw new Error("YT resumable: no upload URL");
  return url;
}

export async function finishYouTubeUpload(url: string, bytes: Uint8Array): Promise<UploadedVideo> {
  const put = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.length) },
    body: bytes as BodyInit,
  });
  const json = await put.json() as UploadedVideo;
  if (!put.ok) throw new Error(`YT upload: ${json?.error?.message || put.status}`);
  return json;
}
