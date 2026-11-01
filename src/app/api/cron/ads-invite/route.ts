import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { intelKeyOk } from "@/lib/elevated-key";
import { sendEmailWithId } from "@/lib/email";
import { SITE_URL } from "@/lib/seo";
import { adsInviteEmail, inInviteWindow } from "@/lib/ads-invite";
import { withCronRun } from "@/lib/cron-run";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * THE ADS-CONSENT INVITATION: one email per subscriber, asking whether we may
 * show them Zyvorah designs in ads on Google and Meta (src/lib/ads-invite.ts).
 *
 * 14:00 IST Mon–Sat from the cron worker; does nothing unless ads_invite_settings says so:
 *   off  — nothing (the default, and where it returns after the send).
 *   test — one copy to settings.test_to, once (test_sent_at), never the ledger.
 *   live — the mailable list, minus anyone already asked or already agreed,
 *          inside the send window (Mon–Sat 10:00–18:00 IST) only.
 * The switch is a database row, not a deploy, so turning the send on is a
 * deliberate act that cannot ride in on an unrelated merge.
 *
 * Same send discipline as launch-mail, for the same reasons recorded there:
 * a per-recipient ledger written after each send (resumable, never twice),
 * 250ms between sends, three attempts on a transient failure.
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
    .from("ads_invite_settings")
    .select("stage, test_to, test_sent_at")
    .maybeSingle();
  if (setErr) return NextResponse.json({ error: setErr.message }, { status: 500 });
  const stage = (settings?.stage as string | undefined) ?? "off";
  if (stage === "off") return NextResponse.json({ ok: true, stage });

  const now = new Date();
  if (!inInviteWindow(now)) return NextResponse.json({ ok: true, stage, skipped: "outside_send_window" });

  const senderName = process.env.SELLER_LEGAL_NAME || "Zyvorah";
  const senderAddress = process.env.SELLER_ADDRESS || null;
  const send = async (to: string, token: string) => {
    const unsub = `${SITE_URL}/api/newsletter/unsubscribe?token=${token}`;
    const { subject, html } = adsInviteEmail({
      siteUrl: SITE_URL,
      yesUrl: `${SITE_URL}/ads-consent/yes?t=${token}`,
      unsubscribeUrl: unsub,
      senderName,
      senderAddress,
    });
    let res = { ok: false, id: null as string | null };
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await sendEmailWithId({
        to, subject, html,
        from: "Zyvorah <hello@mail.zyvorah.com>",
        replyTo: "hello@zyvorah.com",
        headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [{ name: "campaign", value: "ads_invite" }],
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
    // A real token, so the test exercises the real button end to end.
    const { data: me } = await admin.from("customers").select("unsubscribe_token").eq("email", to).maybeSingle();
    if (!me?.unsubscribe_token) return NextResponse.json({ ok: false, stage, error: "test_to is not a customer" });
    const { ok } = await send(to, me.unsubscribe_token as string);
    if (ok) await admin.from("ads_invite_settings").update({ test_sent_at: now.toISOString() }).eq("id", true);
    return NextResponse.json({ ok, stage, to });
  }

  // live
  const [{ data: recips, error: recErr }, { data: done, error: doneErr }, { data: consents, error: conErr }] =
    await Promise.all([
      admin
        .from("customers")
        .select("id, email, unsubscribe_token")
        .not("email", "is", null)
        .is("marketing_opt_in", true)
        .is("unsubscribed_at", null)
        .is("email_bounced_at", null)
        .order("created_at")
        .limit(5000),
      admin.from("ads_invite_sends").select("email").limit(10000),
      admin
        .from("marketing_consents")
        .select("customer_id, granted, seq")
        .eq("purpose", "ads_personalisation")
        .order("seq")
        .limit(10000),
    ]);
  const err = recErr || doneErr || conErr;
  if (err) return NextResponse.json({ ok: false, error: err.message }, { status: 500 });

  // Latest decision per customer (rows arrive in seq order, so the last wins).
  const latest = new Map<string, boolean>();
  for (const c of (consents ?? []) as { customer_id: string; granted: boolean }[]) latest.set(c.customer_id, c.granted);
  const asked = new Set((done ?? []).map((r) => (r as { email: string }).email));
  const todo = ((recips ?? []) as { id: string; email: string; unsubscribe_token: string }[]).filter(
    (r) => !asked.has(r.email.toLowerCase()) && latest.get(r.id) !== true,
  );

  let sent = 0, failed = 0;
  // The cron worker's request to this route is cut at ~100s (6 October: the
  // first live run sent 188 and died at 100s, never recording its finish), so
  // each run stops at 80s and the next hour resumes from the ledger.
  const deadline = Date.now() + 80_000;
  for (const r of todo) {
    if (Date.now() > deadline || !inInviteWindow(new Date())) break;
    const { ok, id } = await send(r.email, r.unsubscribe_token);
    if (ok) {
      sent++;
      await admin.from("ads_invite_sends").insert({ email: r.email.toLowerCase(), resend_id: id });
    } else {
      failed++;
    }
    await pause(250);
  }
  return NextResponse.json({ ok: true, stage, sentThisRun: sent, failedThisRun: failed, remaining: todo.length - sent, sentTotal: asked.size + sent });
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const GET = withCronRun("ads-invite", tick);
