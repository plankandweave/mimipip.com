import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { fetchReviewLedger } from "@/lib/marketing/review-queue";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!await requireStaff(req)) return notStaff();
  try {
    const rows = await fetchReviewLedger();
    const posts = rows.filter(p => p.review_ready).sort((a,b) => (a.slot_key ?? "").localeCompare(b.slot_key ?? ""));
    // Every held post, BY NAME AND REASON. The page used to show a bare count
    // ("6 posts need production work"); on 7–8 October 2026 that count was
    // the whole of two days' output and nobody could see why.
    const heldPosts = rows
      .filter(p => p.review_hold || (p.approved_at && p.status === "queued" && /^held: /.test((p as {error?: string|null}).error ?? "")))
      .map(p => ({ id: p.id, slot_key: p.slot_key, format: p.format, product_handle: p.product_handle,
        reason: p.review_hold ?? ((p as {error?: string|null}).error ?? "").slice(6), approved: !!p.approved_at }))
      .sort((a,b) => (a.slot_key ?? "").localeCompare(b.slot_key ?? ""));
    return NextResponse.json({posts, held: heldPosts.length, heldPosts}, {headers:{"cache-control":"no-store"}});
  } catch (e) {
    return NextResponse.json({error: e instanceof Error ? e.message : "Review checks could not be completed."}, {status:503,headers:{"cache-control":"no-store"}});
  }
}
