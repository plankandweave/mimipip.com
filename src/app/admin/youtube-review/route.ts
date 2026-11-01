import { currentStaff } from "@/lib/staff-access";
import { privateBucket } from "@/lib/r2-media";
import { accessToken } from "@/lib/marketing/publish/youtube";
import { youtubeReviewPlan } from "@/lib/marketing/youtube-review-plan";
import { MAX_REVIEW_BYTES, REVIEW_CHANNEL, reviewOwner, reviewReceipt, runYouTubeReview, sameReviewOrigin } from "@/lib/marketing/youtube-review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
// A standalone route, not a Desk page: no layouts, automatic requests or JS.
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function page(content: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>YouTube private review · Zyvorah</title><style>body{font:17px/1.6 system-ui;max-width:760px;margin:48px auto;padding:24px;color:#18202b}pre{white-space:pre-wrap;overflow-wrap:anywhere}button{padding:12px;margin:20px 0}label{display:block;margin:16px 0}</style><h1>YouTube private review</h1>${content}</html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" },
  });
}
async function owner(req: Request): Promise<boolean> {
  // Require the real production identity; development convenience identity is not evidence.
  return process.env.NODE_ENV === "production" && reviewOwner((await currentStaff(req))?.email);
}
export async function GET(req: Request): Promise<Response> {
  if (!(await owner(req))) return page("<p>Sign in with the existing owner account through Cloudflare Access.</p>", 403);
  const plan = youtubeReviewPlan();
  if (!plan) return page("<p>Uploads are disabled. Verify the quota project and approve one exact asset and metadata before enabling a review plan.</p>");
  const bucket = await privateBucket();
  if (!bucket) return page("<p>Private receipt storage is unavailable.</p>", 503);
  const receipt = await reviewReceipt(bucket, plan);
  const facts = { ...plan, channelId: REVIEW_CHANNEL, privacyStatus: "private", notifySubscribers: false };
  return page(`<p>One approved MP4, private visibility, no subscriber notifications. This does not approve or schedule marketing posts.</p><pre>${escape(JSON.stringify(facts, null, 2))}</pre>${receipt ? `<h2>Recorded result</h2><pre>${escape(JSON.stringify(receipt, null, 2))}</pre>` : `<form method="post" enctype="multipart/form-data"><label>Approved MP4 (up to 25 MiB)<input required type="file" name="video" accept="video/mp4"></label><label><input required type="checkbox" name="confirm" value="private-review">I confirm this exact private review upload.</label><button>Upload approved private review</button></form><p>After an interrupted response, submitting the same file only reconciles the existing attempt; it never starts another upload session.</p>`}`);
}
export async function POST(req: Request): Promise<Response> {
  if (!sameReviewOrigin(req) || !(await owner(req))) return page("<p>Owner sign-in and same-origin submission are required.</p>", 403);
  const plan = youtubeReviewPlan();
  if (!plan) return page("<p>No approved review plan. No upload attempted.</p>", 409);
  const bucket = await privateBucket();
  if (!bucket) return page("<p>Private receipt storage is unavailable. No upload attempted.</p>", 503);
  try {
    // Bound the multipart body before parsing, including chunked requests.
    const reader = req.body?.getReader();
    if (!reader) return page("<p>Missing file.</p>", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > MAX_REVIEW_BYTES + 64 * 1024) { await reader.cancel(); return page("<p>File too large.</p>", 413); }
      chunks.push(part.value);
    }
    const body = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    const form = await new Response(body, { headers: { "Content-Type": req.headers.get("content-type") || "" } }).formData();
    const file = form.get("video");
    if (form.get("confirm") !== "private-review" || !(file instanceof File) || file.type !== "video/mp4" || file.size > MAX_REVIEW_BYTES) return page("<p>Confirm the approved MP4.</p>", 400);
    const receipt = await runYouTubeReview(plan, new Uint8Array(await file.arrayBuffer()), { bucket, clientId: process.env.YT_CLIENT_ID, token: accessToken });
    return page(`<h2>${receipt.state === "verified" ? "Private upload verified by YouTube" : "Attempt needs reconciliation — do not create another plan"}</h2><pre>${escape(JSON.stringify(receipt, null, 2))}</pre><p>Processing and playback must be checked separately. A private video is not accessible to Google reviewers merely because its URL is known.</p>`, receipt.state === "verified" ? 200 : 409);
  } catch {
    return page("<p>Review could not be completed. Inspect the private attempt receipt before trying again. No upstream error details are shown.</p>", 409);
  }
}
