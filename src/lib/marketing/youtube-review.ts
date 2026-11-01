import type { R2Bucket } from "../r2-media";
import type { YouTubeReviewPlan } from "./youtube-review-plan";
import { startYouTubeUpload, finishYouTubeUpload } from "./publish/youtube-upload";

export const REVIEW_OWNER = "roheena@plankandweave.com";
export const REVIEW_CHANNEL = "UCelObHWULTjzICEnwdKJDXQ";
export const MAX_REVIEW_BYTES = 25 * 1024 * 1024;
const API = "https://www.googleapis.com/youtube/v3";
type Receipt = { state: "verified" | "needs-reconciliation"; videoId?: string; channelId?: string; privacyStatus?: string; uploadStatus?: string };
type Dependencies = { bucket: R2Bucket; clientId: string | undefined; token: () => Promise<string> };

export function reviewOwner(email: string | undefined): boolean { return email?.toLowerCase() === REVIEW_OWNER; }
export function sameReviewOrigin(req: Request): boolean {
  return new URL(req.url).origin === "https://zyvorah.com" && req.headers.get("origin") === "https://zyvorah.com";
}
function key(plan: YouTubeReviewPlan, name: string): string {
  if (!/^[a-z0-9-]{8,80}$/.test(plan.id)) throw new Error("Invalid review plan identifier");
  return `youtube-review/${plan.id}/${name}.json`;
}
async function read<T>(bucket: R2Bucket, path: string): Promise<T | null> {
  const obj = await bucket.get(path);
  return obj ? JSON.parse(new TextDecoder().decode(await obj.arrayBuffer())) as T : null;
}
async function writeOnce(bucket: R2Bucket, path: string, value: unknown): Promise<boolean> {
  const result = await bucket.put(path, JSON.stringify(value), {
    onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
  });
  return result !== null && result !== undefined;
}
export async function reviewReceipt(bucket: R2Bucket, plan: YouTubeReviewPlan): Promise<Receipt | null> {
  const receipt = await read<Receipt>(bucket, key(plan, "receipt"));
  return receipt?.state === "verified" ? receipt : null;
}
async function verifyVideo(token: string, videoId: string): Promise<Receipt> {
  const r = await fetch(`${API}/videos?part=snippet,status&id=${encodeURIComponent(videoId)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error("Video read-back unavailable");
  const json = await r.json();
  const v = json.items?.find((item: { id?: string }) => item.id === videoId);
  const valid = v?.snippet?.channelId === REVIEW_CHANNEL && v?.status?.privacyStatus === "private" && ["uploaded", "processed"].includes(v?.status?.uploadStatus);
  return { state: valid ? "verified" : "needs-reconciliation", videoId, channelId: v?.snippet?.channelId, privacyStatus: v?.status?.privacyStatus, uploadStatus: v?.status?.uploadStatus };
}
// Only terminal verification is cached. Processing/missing/transient observations
// must remain retryable using the durable result, never a second upload.
async function verifyResult(bucket: R2Bucket, plan: YouTubeReviewPlan, token: string): Promise<Receipt> {
  const result = await read<{ videoId: string }>(bucket, key(plan, "result"));
  if (!result || !/^[a-zA-Z0-9_-]{11}$/.test(result.videoId)) throw new Error("Durable result unavailable");
  const receipt = await verifyVideo(token, result.videoId);
  if (receipt.state === "verified") {
    await writeOnce(bucket, key(plan, "receipt"), receipt);
    // A competing verifier may have won. Never report an unpersisted receipt.
    const canonical = await reviewReceipt(bucket, plan);
    if (!canonical) throw new Error("Verified receipt persistence unavailable");
    return canonical;
  }
  return await reviewReceipt(bucket, plan) ?? receipt;
}
async function saveResult(bucket: R2Bucket, plan: YouTubeReviewPlan, videoId: unknown): Promise<void> {
  if (typeof videoId !== "string" || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) throw new Error("Invalid upload result");
  await writeOnce(bucket, key(plan, "result"), { videoId });
  const canonical = await read<{ videoId: string }>(bucket, key(plan, "result"));
  if (!canonical || canonical.videoId !== videoId) throw new Error("Conflicting or unavailable upload result");
}
function sessionAllowed(value: string): boolean {
  try { const u = new URL(value); return u.origin === "https://www.googleapis.com" && u.pathname === "/upload/youtube/v3/videos" && !u.username && !u.password; } catch { return false; }
}

/** One reviewed asset. No marketing database, twins, audit switch or release path.
 * Claim is permanent: ambiguous results NEVER restart a session or resend bytes.
 * Retrying only queries the saved session to recover a completed video's ID.
 */
export async function runYouTubeReview(plan: YouTubeReviewPlan, bytes: Uint8Array, deps: Dependencies): Promise<Receipt> {
  if (!plan.caseId || !plan.cloudProjectId || !plan.oauthClientId || deps.clientId !== plan.oauthClientId) throw new Error("Review project/client mapping is not configured");
  if (!plan.title.trim() || plan.title.length > 100 || plan.description.length > 5000 || typeof plan.selfDeclaredMadeForKids !== "boolean") throw new Error("Invalid reviewed metadata");
  if (!bytes.length || bytes.length > MAX_REVIEW_BYTES || new TextDecoder().decode(bytes.slice(4, 8)) !== "ftyp") throw new Error("Expected a reviewed MP4 up to 25 MiB");
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), b => b.toString(16).padStart(2, "0")).join("");
  if (hash !== plan.sha256) throw new Error("Asset differs from the reviewed SHA-256");
  const { bucket } = deps;
  const claimKey = key(plan, "claim");
  const previous = await read<{ plan: YouTubeReviewPlan }>(bucket, claimKey);
  if (previous && JSON.stringify(previous.plan) !== JSON.stringify(plan)) throw new Error("Plan changed after claim; reconcile the existing attempt");
  const saved = await reviewReceipt(bucket, plan);
  if (saved) return saved;
  const token = await deps.token();
  const channel = await fetch(`${API}/channels?part=id&mine=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!channel.ok) throw new Error("Channel preflight unavailable");
  const channels = await channel.json();
  if (channels.items?.length !== 1 || channels.items[0]?.id !== REVIEW_CHANNEL) throw new Error("YouTube token is not for the reviewed channel");
  const claimed = await writeOnce(bucket, claimKey, { plan, bytes: bytes.length, channelId: REVIEW_CHANNEL });
  if (!claimed) {
    // Another request can be in flight; no lock stealing or automatic new upload.
    const current = await read<{ plan: YouTubeReviewPlan }>(bucket, claimKey);
    if (!current || JSON.stringify(current.plan) !== JSON.stringify(plan)) throw new Error("Conflicting review attempt");
    const completed = await read<{ videoId: string }>(bucket, key(plan, "result"));
    if (completed) {
      return verifyResult(bucket, plan, token);
    }
    const session = await read<{ url: string; bytes: number }>(bucket, key(plan, "session"));
    if (!session || !sessionAllowed(session.url)) return { state: "needs-reconciliation" };
    const progress = await fetch(session.url, { method: "PUT", headers: { "Content-Length": "0", "Content-Range": `bytes */${session.bytes}` }, body: new Uint8Array() });
    if (progress.status !== 200 && progress.status !== 201) return { state: "needs-reconciliation" };
    const result = await progress.json();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(result.id ?? "")) return { state: "needs-reconciliation" };
    await saveResult(bucket, plan, result.id);
    return verifyResult(bucket, plan, token);
  }
  try {
    const url = await startYouTubeUpload(token, {
      snippet: { title: plan.title, description: plan.description, categoryId: "26" },
      status: { privacyStatus: "private", selfDeclaredMadeForKids: plan.selfDeclaredMadeForKids },
    }, bytes.length, false);
    if (!sessionAllowed(url)) throw new Error("Unexpected resumable endpoint");
    if (!(await writeOnce(bucket, key(plan, "session"), { url, bytes: bytes.length }))) throw new Error("Session persistence failed");
    const result = await finishYouTubeUpload(url, bytes);
    if (!/^[a-zA-Z0-9_-]{11}$/.test(result.id ?? "")) return { state: "needs-reconciliation" };
    await saveResult(bucket, plan, result.id);
    return await verifyResult(bucket, plan, token);
  } catch {
    // Do not return upstream messages: they may contain tokens or session URLs.
    return { state: "needs-reconciliation" };
  }
}
