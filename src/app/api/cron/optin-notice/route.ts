import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { intelKeyOk } from "@/lib/elevated-key";
import { sendEmailWithId } from "@/lib/email";
import { SITE_URL } from "@/lib/seo";
import { inMailWindow, optinNoticeEmail, pickNoticeHero, type NoticeHeroCandidate } from "@/lib/optin-notice";
import { withCronRun } from "@/lib/cron-run";
import { toMediaUrl } from "@/lib/media-url";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * THE OPT-IN NOTICE: one email to each existing account holder who never
 * opted in, telling them they will now receive new collections, with a
 * one-click unsubscribe (src/lib/optin-notice.ts). Once delivered, the person
 * is marked opted in (optin_notice_mark_sent) — never before.
 *
 * 14:00 IST Mon–Sat from the cron worker; does nothing unless optin_notice_settings says so:
 *   off  — nothing (the default).
 *   test — one copy to settings.test_to, once (test_sent_at); marks no one.
 *   live — every eligible account holder (optin_notice_recipients: not
 *          unsubscribed, not bounced, not in DoNotContact, not already told),
 *          and only Mon–Sat 09:00–19:00 IST, checked before every send.
 * The switch is a database row, not a deploy, so the send is a deliberate act
 * the founder approves separately.
 */
async function tick(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const viaCron = !!cronSecret && auth === `Bearer ${cronSecret}`;
  if (!viaCron && !(await intelKeyOk(req.headers.get("x-intel-key")))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_role_not_configured" }, { status: 500 });

  const { data: settings, error: setErr } = await admin
    .from("optin_notice_settings")
    .select("stage, test_to, test_sent_at")
    .maybeSingle();
  if (setErr) return NextResponse.json({ error: setErr.message }, { status: 500 });
  const stage = (settings?.stage as string | undefined) ?? "off";
  if (stage === "off") return NextResponse.json({ ok: true, stage });
  if (!inMailWindow(new Date())) return NextResponse.json({ ok: true, stage, skipped: "outside_send_window" });

  // The newest design, on a wall — chosen once per run, so every copy of a
  // run carries the same picture. Without one the email still sends, text-only.
  const { data: newest } = await admin
    .from("products")
    .select("title, product_images ( url, is_flat, width, height )")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(30);
  const hero = pickNoticeHero(
    ((newest ?? []) as { title: string; product_images: NoticeHeroCandidate["images"] | null }[]).map((p) => ({
      title: p.title,
      // Stored URLs may still be the old Supabase Storage form; an email needs
      // the public address the shop serves today (src/lib/media-url.ts).
      images: (p.product_images ?? []).map((i) => ({ ...i, url: toMediaUrl(i.url) })),
    })),
  );

  const senderName = process.env.SELLER_LEGAL_NAME || "Zyvorah";
  const senderAddress = process.env.SELLER_ADDRESS || null;
  const send = async (to: string, token: string) => {
    const unsub = `${SITE_URL}/api/newsletter/unsubscribe?token=${token}`;
    const { subject, html } = optinNoticeEmail({ siteUrl: SITE_URL, unsubscribeUrl: unsub, senderName, senderAddress, hero });
    let res = { ok: false, id: null as string | null };
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await sendEmailWithId({
        to, subject, html,
        from: "Zyvorah <hello@mail.zyvorah.com>",
        replyTo: "hello@zyvorah.com",
        headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [{ name: "campaign", value: "optin_notice" }],
      });
      if (res.ok) break;
      await pause(1000 * attempt);
    }
    return res;
  };

  if (stage === "test") {
    const to = (settings?.test_to as string | null)?.trim().toLowerCase();
    if (!to) return NextResponse.json({ ok: false, stage, error: "test_to not set" });
    if (settings?.test_sent_at) return NextResponse.json({ ok: true, stage, skipped: "test_already_sent" });
    // A real token, so the test exercises the real unsubscribe link.
    const { data: me } = await admin.from("customers").select("unsubscribe_token").eq("email", to).maybeSingle();
    if (!me?.unsubscribe_token) return NextResponse.json({ ok: false, stage, error: "test_to is not a customer" });
    const { ok } = await send(to, me.unsubscribe_token as string);
    if (ok) await admin.from("optin_notice_settings").update({ test_sent_at: new Date().toISOString() }).eq("id", true);
    return NextResponse.json({ ok, stage, to });
  }

  // live
  const { data: recips, error: recErr } = await admin.rpc("optin_notice_recipients", { p_limit: 500 });
  if (recErr) return NextResponse.json({ ok: false, error: recErr.message }, { status: 500 });
  const todo = (recips ?? []) as { id: string; email: string; unsubscribe_token: string }[];

  let sent = 0, failed = 0;
  const deadline = Date.now() + 240_000; // stop well inside maxDuration; the next tick resumes
  for (const r of todo) {
    if (Date.now() > deadline || !inMailWindow(new Date())) break;
    const { ok } = await send(r.email, r.unsubscribe_token);
    if (ok) {
      sent++;
      const { error } = await admin.rpc("optin_notice_mark_sent", { p_id: r.id });
      if (error) console.error("[optin-notice] mark_sent failed:", error.message);
    } else {
      failed++;
    }
    await pause(250);
  }
  return NextResponse.json({ ok: true, stage, sentThisRun: sent, failedThisRun: failed, remaining: todo.length - sent });
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const GET = withCronRun("optin-notice", tick);
