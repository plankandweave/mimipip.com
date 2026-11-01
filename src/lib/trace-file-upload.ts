import { MAX_PIECE_VIDEO_BYTES, MAX_STILL_BYTES, PIECE_SECONDS } from "./trace";

export function traceFileType(file: { type: string; size: number }): "photo" | "video" {
  const type = file.type.split(";")[0].toLowerCase();
  const kind = ["image/jpeg", "image/png", "image/webp"].includes(type) ? "photo"
    : ["video/mp4", "video/quicktime", "video/webm"].includes(type) ? "video" : null;
  if (!kind) throw new Error("Choose a JPEG, PNG or WebP photo, or an MP4, MOV or WebM video.");
  if (file.size <= 0 || file.size > (kind === "photo" ? MAX_STILL_BYTES : MAX_PIECE_VIDEO_BYTES)) {
    throw new Error(kind === "photo" ? "Photos must be nonempty and at most 6 MiB." : "Videos must be nonempty and at most 96 MiB.");
  }
  return kind;
}

export function checkTraceVideoDuration(seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > PIECE_SECONDS) {
    throw new Error("Choose a playable video of at most 3 minutes. Trim longer videos into shorter clips first.");
  }
}

export type TraceUploadProgress = { startKey?: string; markKey?: string; walkId?: string; piece?: boolean; markId?: string; committed?: boolean; ended?: boolean };
type Post = (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;

/** Keep successful stages in memory, so retry never creates a second mark or
 * re-uploads a committed file. The server remains responsible for all scope. */
export async function saveTraceFile(input: {
  kind: "photo" | "video"; blob: Blob; seconds: number; name: string; where: string;
  progress: TraceUploadProgress; post: Post;
  put: (url: string, blob: Blob) => Promise<void>;
}): Promise<void> {
  const { progress: p, post, kind, blob } = input;
  traceFileType(blob);
  if (kind === "video") checkTraceVideoDuration(input.seconds);
  if (!p.walkId) {
    p.startKey ??= crypto.randomUUID();
    const j = await post("", { action: "start", requestId: p.startKey, walkerName: input.name, where: input.where });
    if (typeof j.walkId !== "string") throw new Error("The upload session did not start.");
    p.walkId = j.walkId;
  }
  if (!p.piece) {
    await post("", { action: "piece", walkId: p.walkId, seq: 1 });
    p.piece = true;
  }
  if (kind === "photo" && !p.markId) {
    p.markKey ??= crypto.randomUUID();
    const j = await post("", { action: "mark", requestId: p.markKey, walkId: p.walkId, seq: 1, atSeconds: 0, walkSeconds: 0, label: input.where });
    if (typeof j.markId !== "string") throw new Error("The photo slot did not start.");
    p.markId = j.markId;
  }
  if (!p.committed) {
    const meta = { kind: kind === "photo" ? "still" : "video", walkId: p.walkId, seq: 1, markId: p.markId, contentType: blob.type };
    const signed = await post("/media", { action: "sign", ...meta, bytes: blob.size });
    if (typeof signed.signedUrl !== "string") throw new Error("The upload slot did not open.");
    await input.put(signed.signedUrl, blob);
    await post("/media", { action: "commit", ...meta, seconds: input.seconds });
    p.committed = true;
  }
  if (!p.ended) {
    await post("", { action: "end", walkId: p.walkId, seconds: input.seconds });
    p.ended = true;
  }
}
