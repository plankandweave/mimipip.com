import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { supabase } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import { reviewRequestEmail } from "@/lib/email-templates";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily: invite genuine reviews a few days after delivery (time to actually
// live with the installed mural) — never fabricated, always tied to a real
// delivered order. Idempotent per order via mark_review_requested.
const MIN_DAYS_AFTER_DELIVERY = 5;

type Candidate = {
  order_id: string;
  order_number: number;
  zvy: string | null;
  email: string;
  items: { product_handle: string; product_title: string }[] | null;
};

async function tick(req: Request) {
  // If a CRON_SECRET is configured, require it (Vercel sends it automatically).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const { data, error } = await supabase.rpc("orders_needing_review_request", { p_min_days: MIN_DAYS_AFTER_DELIVERY });
  if (error) {
    console.error("orders_needing_review_request failed:", error.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const candidates = (data ?? []) as Candidate[];
  let sent = 0;
  for (const o of candidates) {
    const { data: claimed } = await supabase.rpc("mark_review_requested", { p_order_id: o.order_id });
    if (!claimed) continue; // already requested (race with another run)
    const items = (o.items ?? []).map((it) => ({ productHandle: it.product_handle, productTitle: it.product_title }));
    if (!items.length) continue; // a sample or gift-card order — no product to review
    const { subject, html } = reviewRequestEmail({ orderNumber: o.order_number, zvy: o.zvy, items });
    const ok = await sendEmail({ to: o.email, subject, html });
    if (ok) sent++;
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, sent });
}

export const GET = withCronRun("review-request", tick);
