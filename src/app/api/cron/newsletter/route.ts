import { NextResponse } from "next/server";
import { elevatedKey, intelKeyOk } from "@/lib/elevated-key";
import { withCronRun } from "@/lib/cron-run";
import { supabase } from "@/lib/supabase";
import { sendEmail, sendEmailWithId } from "@/lib/email";
import { SITE_URL } from "@/lib/seo";
import { generateIssue, weekStartOf, galleryHeadingForTheme, type GeneratedIssue } from "@/lib/newsletter";
import { addIstDays } from "@/lib/ist";
import { newsletterEmail } from "@/lib/newsletter-template";
import { inShopperMailWindow } from "@/lib/lead-rules";
import { personalise, sendInBatches, UNSUB_PLACEHOLDER, type Claimed } from "@/lib/newsletter-send";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type StoredIssue = {
  id: string;
  week_start: string;
  subject: string;
  preview_text: string | null;
  theme: string | null;
  kicker: string | null;
  title: string | null;
  intro_html: string | null;
  sections: GeneratedIssue["sections"];
  featured: GeneratedIssue["gallery"]; // the scene gallery is stored in `featured`
  featured_handles: string[];
  hero_image: string | null;
  hero_caption: string | null;
};

function issueFromRow(row: StoredIssue): GeneratedIssue {
  return {
    subject: row.subject,
    previewText: row.preview_text || "",
    title: row.title || row.subject,
    kicker: row.kicker,
    theme: row.theme || "",
    introHtml: row.intro_html || "",
    sections: row.sections ?? [],
    gallery: row.featured ?? [],
    galleryHeading: galleryHeadingForTheme(row.theme),
    featuredHandles: row.featured_handles ?? [],
    heroImage: row.hero_image,
    heroCaption: row.hero_caption,
  };
}

function renderIssue(issue: GeneratedIssue, unsubscribeUrl: string, senderName: string, senderAddress: string | null) {
  return newsletterEmail({
    subject: issue.subject,
    previewText: issue.previewText,
    kicker: issue.kicker,
    title: issue.title,
    heroImage: issue.heroImage,
    heroCaption: issue.heroCaption,
    introHtml: issue.introHtml,
    sections: issue.sections,
    gallery: issue.gallery,
    galleryHeading: issue.galleryHeading,
    unsubscribeUrl,
    siteUrl: SITE_URL,
    senderName,
    senderAddress,
  });
}

// The weekly newsletter run ("The Zyvorah Letter"). Generates one issue per
// week (idempotent on week_start), then sends it to every opted-in customer in
// the central DB who hasn't already received it. Sending is claimed, batched
// and time-boxed (src/lib/newsletter-send.ts): a Thursday run that cannot
// finish leaves the issue 'sending', and the hourly working-hours `?resume=1` tick
// continues it inside working hours — nobody twice, nobody dropped.
//
// Auth, either of:
//   - Authorization: Bearer <CRON_SECRET>   (Vercel cron) — then INTEL_RPC_KEY
//     is used as the elevated DB key that unlocks the recipient list
//   - x-intel-key: <key>                    (manual run) — compared against
//     the key admin_config holds, before an issue can be generated
//
// Query params:
//   ?send=0            generate/preview the issue only; send to no one
//   ?test=you@x.com    send just this issue to one address (does not touch the
//                      audience or the send ledger) — for previews
//   ?week=YYYY-MM-DD   override the target week (defaults to this week)
//   ?resume=1          continue the letter currently 'sending' (cron, hourly 09:30–18:30 IST)
async function tick(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const viaCron = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const manualKey = req.headers.get("x-intel-key");
  // The key the DATABASE accepts, not a second copy of it in the environment.
  // The two drifted and silently 401'd this job on every run — see
  // lib/elevated-key.
  if (!viaCron && !(await intelKeyOk(manualKey))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Narrows to string, and covers the one case the gate above cannot: a cron
  // run on a deployment where no elevated key is configured at all.
  const rpcKey = viaCron ? await elevatedKey() : manualKey;
  if (!rpcKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const weekStart = url.searchParams.get("week") || weekStartOf(new Date());
  const test = url.searchParams.get("test");
  const wantSend = url.searchParams.get("send") !== "0" && !test;

  const senderName = process.env.SELLER_LEGAL_NAME || "Zyvorah";
  const senderAddress = process.env.SELLER_ADDRESS || null;

  // 1. Get-or-create this week's issue. Generate content only if it's new.
  const { data: existingRows, error: getErr } = await supabase.rpc("newsletter_get_issue", {
    p_key: rpcKey,
    p_week_start: weekStart,
  });
  if (getErr) {
    const status = getErr.message?.includes("unauthorized") ? 401 : 500;
    return NextResponse.json({ error: getErr.message }, { status });
  }

  let issueId: string;
  let issue: GeneratedIssue;
  const existing = (existingRows as StoredIssue[] | null)?.[0];

  if (existing) {
    // Stored issue → render straight from the DB. No regeneration, no drift.
    issueId = existing.id;
    issue = issueFromRow(existing);
  } else {
    // First time this week → generate (Claude) and persist the whole issue.
    // Use stored editions, not today's room ranking, as the repeat exclusion.
    // Fail closed if history cannot be read; never silently send the old picks.
    const history = await Promise.all(Array.from({ length: 4 }, (_, i) =>
      supabase.rpc("newsletter_get_issue", {
        p_key: rpcKey, p_week_start: addIstDays(weekStart, -7 * (i + 1)),
      }),
    ));
    if (history.some(r => r.error)) {
      return NextResponse.json({ error: "newsletter_history_unavailable" }, { status: 503 });
    }
    const handles = [...new Set(history.flatMap(r =>
      ((r.data ?? []) as StoredIssue[]).flatMap(row => row.featured_handles ?? []),
    ))];
    const { data: pastDesigns, error: pastError } = handles.length
      ? await supabase.from("products").select("handle, product_tags(tag)").in("handle", handles)
      : { data: [], error: null };
    if (pastError) return NextResponse.json({ error: "newsletter_history_unavailable" }, { status: 503 });
    const tagsByHandle = new Map((pastDesigns ?? []).map(p => [p.handle, p.product_tags.map(t => t.tag)]));
    let gen: GeneratedIssue;
    try {
      gen = await generateIssue(weekStart, handles.map(handle => ({ handle, tags: tagsByHandle.get(handle) ?? [] })));
    } catch (error) {
      console.error("[newsletter] selection held", error);
      return NextResponse.json({ error: "newsletter_no_fresh_room_study" }, { status: 503 });
    }
    issue = gen;
    const { data: up, error: upErr } = await supabase.rpc("newsletter_upsert_issue", {
      p_key: rpcKey,
      p_week_start: weekStart,
      p_subject: gen.subject,
      p_preview: gen.previewText,
      p_theme: gen.theme,
      p_kicker: gen.kicker,
      p_title: gen.title,
      p_intro_html: gen.introHtml,
      p_sections: gen.sections,
      p_featured: gen.gallery,
      p_hero_image: gen.heroImage,
      p_hero_caption: gen.heroCaption,
      p_featured_handles: gen.featuredHandles,
    });
    if (upErr || !up) {
      return NextResponse.json({ error: upErr?.message ?? "issue_upsert_failed" }, { status: 500 });
    }
    issueId = (up as { id: string; created: boolean }[])[0].id;
  }

  const buildHtml = (unsubscribeUrl: string) => renderIssue(issue, unsubscribeUrl, senderName, senderAddress);

  // Preview / test paths — no audience, no ledger writes.
  if (!wantSend) {
    if (test) {
      const unsub = `${SITE_URL}/api/newsletter/unsubscribe?token=preview`;
      const { subject, html } = buildHtml(unsub);
      const ok = await sendEmail({
        to: test,
        subject,
        html,
        from: "The Zyvorah Letter <hello@mail.zyvorah.com>",
        replyTo: "hello@zyvorah.com",
        headers: { "List-Unsubscribe": `<${unsub}>` },
      });
      return NextResponse.json({ ok, mode: "test", to: test, weekStart, issueId, subject });
    }
    return NextResponse.json({ ok: true, mode: "preview", weekStart, issueId, issue });
  }

  // 2. Send — in bounded, claimed batches (src/lib/newsletter-send.ts). What
  // this request does not reach, the ten-minute `?resume=1` tick continues.
  await supabase.rpc("newsletter_begin_sending", { p_key: rpcKey, p_issue_id: issueId });
  return sendIssue(rpcKey, issueId, buildHtml, { weekStart, mode: "send" });
}

type BuildHtml = (unsubscribeUrl: string) => { subject: string; html: string };

async function sendIssue(
  rpcKey: string,
  issueId: string,
  buildHtml: BuildHtml,
  meta: Record<string, unknown>,
): Promise<Response> {
  // Rendered once; each person's unsubscribe token is stamped in.
  const unsubTemplate = `${SITE_URL}/api/newsletter/unsubscribe?token=${UNSUB_PLACEHOLDER}`;
  const { subject, html: rendered } = buildHtml(unsubTemplate);

  const result = await sendInBatches(
    {
      claim: async (limit) => {
        const { data, error } = await supabase.rpc("newsletter_claim_batch", {
          p_key: rpcKey,
          p_issue_id: issueId,
          p_limit: limit,
        });
        if (error) throw new Error(`newsletter_claim_batch: ${error.message}`);
        return (data as Claimed[] | null) ?? [];
      },
      send: (r, idempotencyKey) => {
        const unsub = personalise(unsubTemplate, r.unsubscribe_token);
        // Tag the send with the issue id and keep the Resend email id —
        // together they join engagement events back to this issue.
        return sendEmailWithId({
          to: r.email,
          subject,
          html: personalise(rendered, r.unsubscribe_token),
          from: "The Zyvorah Letter <hello@mail.zyvorah.com>",
          replyTo: "hello@zyvorah.com",
          headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          tags: [
            { name: "issue_id", value: issueId },
            { name: "kind", value: "newsletter" },
          ],
          idempotencyKey,
        });
      },
      record: async (email, ok, resendId) => {
        await supabase.rpc("newsletter_record_send", {
          p_key: rpcKey,
          p_issue_id: issueId,
          p_email: email,
          p_status: ok ? "sent" : "failed",
          p_resend_id: resendId,
        });
      },
    },
    { issueId },
  );

  // Finished only when nobody is left AND no claim is still unconfirmed.
  const { data: prog } = await supabase.rpc("newsletter_issue_progress", { p_key: rpcKey, p_issue_id: issueId });
  const p = (prog as { sent: number; failed: number; sending: number; remaining: number }[] | null)?.[0];
  const complete = !!p && p.remaining === 0 && p.sending === 0;
  if (complete) {
    await supabase.rpc("newsletter_mark_sent", { p_key: rpcKey, p_issue_id: issueId, p_count: p.sent });
  }

  return NextResponse.json({
    ok: true,
    ...meta,
    issueId,
    thisRun: result,
    progress: p ?? null,
    complete,
  });
}

// The working-hours tick (hourly 09:30–18:30 IST): continue an issue a Thursday run left in 'sending'.
// Generates nothing; idle (one query) when no letter is mid-send.
async function resumeTick(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const viaCron = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const manualKey = req.headers.get("x-intel-key");
  if (!viaCron && !(await intelKeyOk(manualKey))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rpcKey = viaCron ? await elevatedKey() : manualKey;
  if (!rpcKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!inShopperMailWindow(new Date())) return NextResponse.json({ ok: true, mode: "resume", idle: "outside_mail_window" });

  const { data, error } = await supabase.rpc("newsletter_resumable_issue", { p_key: rpcKey });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = (data as StoredIssue[] | null)?.[0];
  if (!row) return NextResponse.json({ ok: true, mode: "resume", idle: "nothing_to_send" });

  const issue = issueFromRow(row);
  const senderName = process.env.SELLER_LEGAL_NAME || "Zyvorah";
  const senderAddress = process.env.SELLER_ADDRESS || null;
  return sendIssue(rpcKey, row.id, (u) => renderIssue(issue, u, senderName, senderAddress), {
    mode: "resume",
    weekStart: row.week_start,
  });
}

const sendTick = withCronRun("newsletter", tick);
const resumeRun = withCronRun("newsletter-resume", resumeTick);

export const GET = (req: Request) =>
  new URL(req.url).searchParams.get("resume") === "1" ? resumeRun(req) : sendTick(req);
