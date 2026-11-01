import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { inShopperMailWindow, isTestLead } from "@/lib/lead-rules";
import { isInternalOrder } from "@/lib/internal-orders";
import { storeWhatsappHref } from "@/lib/whatsapp";
import { SITE_URL } from "@/lib/seo";
import { NURTURE_DAYS, nurtureDecision, sampleNurtureEmail } from "@/lib/sample-nurture";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * A delivered sample is a wall waiting to be ordered (founder, 12 October 2026).
 *
 * 14:00 IST Monday–Saturday:
 *  1. Every sample order that has reached 'delivered' and is not yet followed
 *     up is enrolled in `sample_nurture`.
 *  2. Each active row is ended first if the customer has since paid for a
 *     wall ('converted'), or unsubscribed, bounced or asked not to be
 *     contacted ('stopped').
 *  3. Otherwise the message due today (src/lib/sample-nurture.ts) is sent
 *     from Team Zyvorah, inside Mon–Sat 09:00–19:00 IST only, at most one per
 *     customer per run; a month after the last message with no order the row
 *     is marked 'lost'.
 *
 * Auth: the cron worker sends `Authorization: Bearer <CRON_SECRET>`.
 */
const FROM = "Team Zyvorah <hello@mail.zyvorah.com>";
const DAY_MS = 86_400_000;
/** A sample marked delivered long after it arrived starts from the first
 *  message, not from the middle of the sequence. */
const FRESH_WITHIN_DAYS = 7;

type Row = {
  order_id: string;
  email: string;
  name: string | null;
  design_handle: string | null;
  design_title: string | null;
  finish: string | null;
  delivered_at: string;
  sent_count: number;
  orders: { created_at: string } | null;
};

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  const now = new Date();

  // 1 · Enrol newly delivered samples.
  const { data: delivered, error: dErr } = await db
    .from("orders")
    .select("id, email, notes, updated_at, shipping_address")
    .eq("placed_via", "sample")
    .eq("status", "delivered")
    .not("email", "is", null)
    .limit(200);
  if (dErr) {
    console.error("sample-nurture: delivered query failed:", dErr.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  let enrolled = 0;
  if (delivered?.length) {
    const { data: known } = await db.from("sample_nurture").select("order_id").in("order_id", delivered.map((o) => o.id));
    const seen = new Set((known ?? []).map((r) => r.order_id as string));
    for (const o of delivered) {
      const email = String(o.email).trim().toLowerCase();
      if (seen.has(o.id) || isInternalOrder(email) || isTestLead(email)) continue;
      const { data: card } = await db
        .from("sample_print_queue")
        .select("design_handle, design_title, material_name")
        .eq("order_id", o.id)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      // Fallback: "Printed design sample — {title} ({handle})" (sample-order/route.ts).
      const m = /Printed design sample — (.+) \(([a-z0-9-]+)\)/.exec(String(o.notes ?? ""));
      const markedAt = new Date(o.updated_at as string);
      const deliveredAt = now.getTime() - markedAt.getTime() > FRESH_WITHIN_DAYS * DAY_MS ? now : markedAt;
      const { error } = await db.from("sample_nurture").insert({
        order_id: o.id,
        email,
        name: (o.shipping_address as { name?: string } | null)?.name ?? null,
        design_handle: card?.design_handle ?? m?.[2] ?? null,
        design_title: card?.design_title ?? m?.[1] ?? null,
        finish: card?.material_name ?? null,
        delivered_at: deliveredAt.toISOString(),
      });
      if (!error) enrolled++;
      else console.error("sample-nurture: enrol failed:", error.message);
    }
  }

  // 2–3 · Work each active row.
  const { data: active, error: aErr } = await db
    .from("sample_nurture")
    .select("order_id, email, name, design_handle, design_title, finish, delivered_at, sent_count, orders!sample_nurture_order_id_fkey(created_at)")
    .eq("status", "active")
    .limit(500);
  if (aErr) {
    console.error("sample-nurture: active query failed:", aErr.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  const mailOpen = inShopperMailWindow(now);
  const counts = { sent: 0, converted: 0, stopped: 0, lost: 0, failed: 0 };
  const end = (orderId: string, status: string, reason: string, extra: Record<string, unknown> = {}) =>
    db.from("sample_nurture").update({ status, end_reason: reason, ended_at: now.toISOString(), updated_at: now.toISOString(), ...extra }).eq("order_id", orderId);

  for (const row of (active ?? []) as unknown as Row[]) {
    const email = row.email;
    const pattern = likeEscape(email);

    // Converted: a paid wall from the same customer after the sample.
    const { data: bought } = await db
      .from("orders")
      .select("id")
      .ilike("email", pattern)
      .neq("placed_via", "sample")
      .eq("payment_status", "paid")
      .gt("created_at", row.orders?.created_at ?? row.delivered_at)
      .limit(1);
    if (bought?.length) {
      await end(row.order_id, "converted", "placed an order", { converted_order_id: bought[0].id });
      counts.converted++;
      continue;
    }

    // Stopped: unsubscribed, bounced, or asked not to be contacted.
    const { data: cust } = await db
      .from("customers")
      .select("unsubscribed_at, email_bounced_at, unsubscribe_token")
      .ilike("email", pattern)
      .limit(1)
      .maybeSingle();
    const { data: dnc } = await db.from("DoNotContact").select("id").ilike("email", pattern).limit(1);
    const stopReason = cust?.unsubscribed_at ? "unsubscribed" : cust?.email_bounced_at ? "email bounced" : dnc?.length ? "do not contact" : null;
    if (stopReason) {
      await end(row.order_id, "stopped", stopReason);
      counts.stopped++;
      continue;
    }

    const decision = nurtureDecision(new Date(row.delivered_at), row.sent_count, now);
    if (decision.kind === "lost") {
      await end(row.order_id, "lost", `no order a month after the last of ${NURTURE_DAYS.length} messages`);
      counts.lost++;
      continue;
    }
    if (decision.kind !== "send" || !mailOpen || !row.design_handle || !row.design_title) continue;

    const imageUrl = await designImage(db, row.design_handle);
    const unsubscribeUrl = cust?.unsubscribe_token ? `${SITE_URL}/api/newsletter/unsubscribe?token=${cust.unsubscribe_token}` : null;
    const { subject, html } = sampleNurtureEmail(decision.step, {
      name: row.name,
      designTitle: row.design_title,
      designHandle: row.design_handle,
      finish: row.finish,
      imageUrl,
      whatsappUrl: storeWhatsappHref(`Hi Zyvorah, I have the ${row.design_title} sample and would like to talk about my wall.`),
      unsubscribeUrl,
    });
    const ok = await sendEmail({
      to: email,
      from: FROM,
      subject,
      html,
      idempotencyKey: `sample-nurture-${row.order_id}-${decision.step}`,
      tags: [{ name: "kind", value: "sample_nurture" }, { name: "step", value: String(decision.step) }],
      ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    }).catch(() => false);
    if (!ok) {
      counts.failed++;
      continue;
    }
    await db
      .from("sample_nurture")
      .update({ sent_count: decision.step + 1, last_step: decision.step, last_sent_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("order_id", row.order_id);
    counts.sent++;
  }

  return NextResponse.json({ ok: true, enrolled, active: active?.length ?? 0, ...counts, mailWindow: mailOpen });
}

/** The design shown on a wall: a room render, never the flat swatch. */
async function designImage(db: NonNullable<ReturnType<typeof supabaseAdmin>>, handle: string): Promise<string | null> {
  const { data: product } = await db.from("products").select("id").eq("handle", handle).maybeSingle();
  if (!product) return null;
  const { data: imgs } = await db
    .from("product_images")
    .select("url, is_featured, position")
    .eq("product_id", product.id)
    .eq("is_flat", false)
    .order("is_featured", { ascending: false })
    .order("position")
    .limit(1);
  return imgs?.[0]?.url ?? null;
}

export const GET = withCronRun("sample-nurture", handler);
