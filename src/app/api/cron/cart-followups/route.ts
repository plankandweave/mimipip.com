import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { cartSavedEmail } from "@/lib/email-templates";
import { fileLeadToCrm } from "@/lib/lead-intake";
import { CART_IDLE_MINUTES, CART_MAX_AGE_DAYS, inShopperMailWindow, isTestLead, resumeUrl } from "@/lib/lead-rules";
import { isInternalOrder } from "@/lib/internal-orders";
import { storeWhatsappHref } from "@/lib/whatsapp";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * A cart with a name on it is a sales call waiting to happen.
 *
 * Hourly in working hours (09:30–18:30 IST, founder 9 Oct 2026; it was every
 * ten minutes round the clock): open carts that carry an email or WhatsApp number
 * (cart_set_contact, asked for the moment something is added), have lines,
 * and have sat untouched for an hour. For each, once:
 *
 *  1. A CRM task, due today: "Call <who> about their ₹X <design> cart", with
 *     the wall sizes in a note, and an email to the team so it is seen today.
 *  2. If they gave an email, one "your wall is saved" email to them — inside
 *     Mon–Sat 09:00–19:00 IST only. A cart left at night is emailed the next
 *     morning (the row waits with tasked_at set and emailed_at empty).
 *
 * The 7 October 2026 audit found 15 cart lines worth about 1.5 lakh with no
 * follow-up of any kind; the only checkout alert went to us and only after a
 * shopper had pressed Place order. This is the step before that.
 *
 * Auth: the cron worker sends `Authorization: Bearer <CRON_SECRET>`.
 */
const ALERT_TO = process.env.CHECKOUT_ALERT_TO || "roheena@plankandweave.com";
const TEAM_TO = process.env.EMAIL_REPLY_TO || "hello@zyvorah.com";
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Line = { width_cm: number; height_cm: number; line_total: number; quantity: number; products: { handle: string; title: string } | null; materials: { slug: string; name: string } | null };
type Cart = { id: string; contact_email: string | null; contact_phone: string | null; contact_name: string | null; updated_at: string; cart_items: Line[] };

async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const now = new Date();
  const idleBefore = new Date(now.getTime() - CART_IDLE_MINUTES * 60_000).toISOString();
  const notBefore = new Date(now.getTime() - CART_MAX_AGE_DAYS * 86_400_000).toISOString();

  const { data, error } = await db
    .from("carts")
    .select("id, contact_email, contact_phone, contact_name, updated_at, cart_items(width_cm, height_cm, line_total, quantity, products(handle, title), materials(slug, name))")
    .eq("status", "open")
    .lt("updated_at", idleBefore)
    .gt("updated_at", notBefore)
    .or("contact_email.not.is.null,contact_phone.not.is.null")
    .limit(50);
  if (error) {
    console.error("cart-followups query failed:", error.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  const carts = ((data ?? []) as unknown as Cart[]).filter((c) => c.cart_items?.length);
  if (!carts.length) return NextResponse.json({ ok: true, carts: 0 });

  const { data: done } = await db.from("cart_followups").select("cart_id, emailed_at, email_skipped").in("cart_id", carts.map((c) => c.id));
  const seen = new Map((done ?? []).map((r) => [r.cart_id as string, r as { emailed_at: string | null; email_skipped: string | null }]));
  const mailOpen = inShopperMailWindow(now);
  let tasked = 0;
  let emailed = 0;

  for (const cart of carts) {
    const email = cart.contact_email?.trim().toLowerCase() || null;
    const phone = cart.contact_phone?.trim() || null;
    if (isInternalOrder(email) || isTestLead(email)) continue;
    const lines = cart.cart_items.filter((l) => l.products);
    const total = lines.reduce((s, l) => s + Number(l.line_total) * (l.quantity || 1), 0);
    const first = lines[0];
    const who = cart.contact_name?.trim() || phone || email || "a shopper";
    const prior = seen.get(cart.id);

    // 1 · The call task — once per cart.
    if (!prior) {
      const sizes = lines
        .map((l) => `${l.products!.title}: ${(l.width_cm / 30.48).toFixed(1)} × ${(l.height_cm / 30.48).toFixed(1)} ft, ${l.materials?.name ?? "finish"}, ${rupees(Number(l.line_total))}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`)
        .join("\n");
      const { taskId } = await fileLeadToCrm(db, {
        name: cart.contact_name,
        email,
        phone,
        source: "cart",
        taskTitle: `Call ${who} about their ${rupees(total)} ${first?.products?.title ?? "wallpaper"} cart${phone ? ` (${phone})` : ""}`,
        note: `Left a cart on zyvorah.com (last touched ${new Date(cart.updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST), not checked out.\n${sizes}\nTotal ${rupees(total)} incl. GST.`,
      });
      await db.from("cart_followups").insert({ cart_id: cart.id, value_inr: total, crm_task_id: taskId, tasked_at: now.toISOString(), email_skipped: email ? null : "no email" });
      tasked++;
      await sendEmail({
        to: [TEAM_TO, ALERT_TO],
        subject: `Cart left — ${rupees(total)} — call ${who} today`,
        html: `<p><strong>${esc(who)}</strong>${email ? ` · ${esc(email)}` : ""}${phone ? ` · <a href="tel:${esc(phone)}">${esc(phone)}</a>` : ""} left a cart and did not check out.</p><pre style="font-family:inherit">${esc(sizes)}</pre><p>Total ${rupees(total)} incl. GST. A call task is on the CRM for today.</p>`,
      }).catch((e) => console.error("[cart-followups] team alert failed:", e));
    }

    // 2 · The shopper's one email — inside the window, once.
    const alreadyMailed = prior?.emailed_at || prior?.email_skipped;
    if (email && !alreadyMailed && mailOpen && first) {
      const { subject, html } = cartSavedEmail({
        name: cart.contact_name,
        totalLabel: rupees(total),
        whatsappUrl: storeWhatsappHref(`Hi Zyvorah, I priced ${first.products!.title} for my wall and have a question before ordering.`),
        lines: lines.map((l) => ({
          title: l.products!.title,
          handle: l.products!.handle,
          size: `${(l.width_cm / 30.48).toFixed(1)} × ${(l.height_cm / 30.48).toFixed(1)} ft`,
          material: l.materials?.name ?? "",
          priceLabel: rupees(Number(l.line_total)),
          resumeUrl: resumeUrl(SITE_URL, { handle: l.products!.handle, widthCm: Number(l.width_cm), heightCm: Number(l.height_cm), materialSlug: l.materials?.slug ?? "" }),
        })),
      });
      const ok = await sendEmail({
        to: email,
        from: "Team Zyvorah <hello@mail.zyvorah.com>",
        subject,
        html,
        idempotencyKey: `cart-saved-${cart.id}`,
        tags: [{ name: "kind", value: "cart_saved" }],
      }).catch(() => false);
      await db.from("cart_followups").update(ok ? { emailed_at: new Date().toISOString() } : { email_skipped: "send failed" }).eq("cart_id", cart.id);
      if (ok) emailed++;
    }
  }

  return NextResponse.json({ ok: true, carts: carts.length, tasked, emailed, mailWindow: mailOpen });
}

export const GET = withCronRun("cart-followups", handler);
