import { istMidnight } from "@/lib/ist";
import { NextResponse } from "next/server";
import { launchCopyFor } from "@/lib/launch-copy";
import { intelKeyOk } from "@/lib/elevated-key";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail, sendEmailWithId } from "@/lib/email";
import { SITE_URL } from "@/lib/seo";
import { newsletterEmail } from "@/lib/newsletter-template";
import { getLaunches, getLaunchCollection, getTeaserImages } from "@/lib/launch-queries";
import { composeLaunchMail, launchMailDue, type LaunchMailKind } from "@/lib/launch-mail";
import { getProductsByTag } from "@/lib/queries";
import { formatINR } from "@/lib/pricing";
import { withCronRun } from "@/lib/cron-run";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * THE LAUNCH: PUBLISH, THEN ANNOUNCE.
 *
 * Runs hourly in working hours (09:30–18:30 IST) and does nothing on all but
 * two days per launch: the day the
 * teaser opens, and the day the collection lands. On launch morning it opens
 * the gate and then writes to the list, in that order and in one run —
 * publishing and announcing must not be able to disagree with each other, and
 * a collection announced but not published is the worst outcome available.
 *
 * Two guards, because this is the one part of the launch that reaches real
 * people and cannot be taken back:
 *
 *  1. DEFAULT IS PREVIEW. A run sends only with `?send=1`. Every other
 *     invocation — including a mistaken one — composes the mail and returns it
 *     as JSON. The cost of a launch mail going out an hour early is a
 *     collection announced before it exists; the cost of a preview is nothing.
 *  2. THE LEDGER ROW IS CLAIMED BEFORE THE FIRST MESSAGE. Not a flag set
 *     afterwards: a check-then-set has a gap, and two overlapping runs both
 *     read "not sent" and both mail the list. Losing a unique insert has no
 *     gap.
 *
 * SCHEDULE: registered in vercel.json as `/api/cron/launch-mail?send=1` —
 * ARMED. Roheena reviewed the composed teaser and the live page and said
 * "send the teaser" (5 September, ~14:30 IST); she had separately answered
 * "auto" when asked auto-vs-manual directly. The claim on
 * collection_launch_mails is what makes an hourly armed cron safe: each mail
 * of each launch can be sent exactly once, ever. Removing `?send=1` from the
 * cron path is all it takes to return to preview-only, and either change
 * should only ever be made deliberately.
 *
 * Do NOT try to explain that inside vercel.json: Vercel validates crons[]
 * strictly and rejects any key other than `path` and `schedule`. An extra
 * `_comment` there does not fail the build — it kills the DEPLOYMENT in about
 * three seconds, before any build runs, so the failure reads like a broken
 * build and is not one. That is why this note lives here.
 *
 * Auth matches the weekly letter: Bearer CRON_SECRET, or an x-intel-key
 * compared against the key the database accepts.
 *
 * Query params:
 *   ?send=1            actually send. Without it, preview only.
 *   ?test=you@x.com    send one copy to one address; never touches the ledger.
 *   ?at=ISO            pretend it is another instant, to rehearse a launch.
 *                      Refused together with send=1 — rehearsing and mailing
 *                      the list must never be the same command.
 */
async function tick(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const viaCron = !!cronSecret && auth === `Bearer ${cronSecret}`;
  // Authenticates the CALLER, and this is the ONLY thing that does. The key
  // does not travel to an RPC — the recipient list is read with the service
  // role below — so unlike the other cron routes there is no intel_key_ok()
  // waiting downstream to reject a wrong one. It was checked for presence
  // alone, which meant `x-intel-key: x` could publish a collection and mail
  // the entire subscriber list. It is now compared against the key the
  // database accepts.
  const manualKey = req.headers.get("x-intel-key");
  if (!viaCron && !(await intelKeyOk(manualKey))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const test = url.searchParams.get("test");
  const at = url.searchParams.get("at");
  const wantSend = url.searchParams.get("send") === "1" && !test;

  // A rehearsal must never be able to mail the list. If `at` were honoured
  // alongside send=1, one stray parameter would announce a January collection
  // in September.
  if (at && wantSend) {
    return NextResponse.json(
      { error: "refusing_to_send_at_a_pretend_time", hint: "drop ?at= to send, or ?send=1 to rehearse" },
      { status: 400 },
    );
  }
  // A bare ?at=YYYY-MM-DD names an Indian calendar day, not midnight UTC —
  // rehearsing "the 24th" must start at 00:00 IST, not 05:30 IST.
  const now = at
    ? (/^\d{4}-\d{2}-\d{2}$/.test(at) ? istMidnight(at) : new Date(at))
    : new Date();
  if (isNaN(now.getTime())) return NextResponse.json({ error: "bad_at" }, { status: 400 });

  const launches = await getLaunches();
  const due = launches
    .map((l) => ({ launch: l, kind: launchMailDue(l, now) }))
    .filter((d): d is { launch: (typeof launches)[number]; kind: LaunchMailKind } => d.kind !== null);

  if (due.length === 0) {
    return NextResponse.json({ ok: true, due: 0, at: now.toISOString() });
  }

  const senderName = process.env.SELLER_LEGAL_NAME || "Zyvorah";
  const senderAddress = process.env.SELLER_ADDRESS || null;
  const results: unknown[] = [];

  for (const { launch, kind } of due) {
    const coll = await getLaunchCollection(launch.collectionHandle);
    if (!coll) {
      results.push({ handle: launch.collectionHandle, skipped: "collection_missing" });
      continue;
    }

    // ---- OPEN THE GATE -----------------------------------------------------
    // Launch morning publishes the collection, and it happens HERE rather than
    // in a cron of its own: publishing and announcing must not be able to
    // disagree with each other. One run, in order — the collection goes live,
    // and only then does anyone get told.
    //
    // activate_collection_launch() is idempotent (it only touches drafts) and
    // refuses when the collection is not ready, so calling it hourly is
    // harmless. If it refuses, the refusal is carried into the result and the
    // mail is abandoned: announcing a collection that did not publish is the
    // one outcome worse than a late launch.
    let activation: { published?: number; refused?: string } | null = null;
    if (kind === "launch" && wantSend && !launch.activatedAt) {
      const admin = supabaseAdmin();
      if (!admin) {
        results.push({ handle: coll.handle, kind, error: "service_role_not_configured" });
        continue;
      }
      const { data, error } = await admin.rpc("activate_collection_launch", {
        p_handle: coll.handle,
        p_min_designs: 1,
      });
      if (error) {
        // The gate said no. Nothing is published, so nothing is announced.
        results.push({ handle: coll.handle, kind, skipped: "gate_refused", reason: error.message });
        continue;
      }
      activation = { published: Number(data ?? 0) };
    }

    // Only PUBLISHED designs, always. On teaser day this is correctly empty
    // and the teaser has no gallery by design; on launch morning an empty list
    // means the gate has not opened yet, and a "it's here" mail pointing at
    // nothing is the worst possible send.
    const designs = (await getProductsByTag(coll.ruleTag, 12)).filter((d) => d.image);

    // The teaser goes out BEFORE the collection is published, so the ordinary
    // catalogue query returns nothing for it. Read the drafts directly, taking
    // only flat artwork that is already on a public URL — a teaser with no
    // picture is barely a teaser, and one with a broken picture is worse.
    const teaserPics = kind === "teaser" ? await getTeaserImages(coll.ruleTag, 3) : [];
    if (kind === "teaser" && teaserPics.length === 0) {
      results.push({ handle: coll.handle, kind, skipped: "no_public_images_to_tease_with" });
      continue;
    }

    if (kind === "launch" && designs.length === 0) {
      results.push({ handle: coll.handle, kind, skipped: "nothing_published_yet", activation });
      continue;
    }

    // A published design whose images never left someone's laptop is worse
    // than an unpublished one: the mail drives the most traffic this
    // collection will ever get, straight at broken pictures. The gate checks
    // this before publishing; checked again here because the mail is the
    // irreversible half and must not rely on the other half having run.
    const unreachable = designs.filter((d) => !d.image?.startsWith("http")).length;
    if (kind === "launch" && unreachable > 0) {
      results.push({ handle: coll.handle, kind, skipped: "images_not_public", unreachable, activation });
      continue;
    }

    const build = (unsubscribeUrl: string) =>
      newsletterEmail(
        composeLaunchMail(kind, {
          launch,
          collectionTitle: coll.title,
          kicker: "A new collection",
          blurb: coll.description ?? `${coll.title}, from Zyvorah.`,
          href: `${SITE_URL}/collections/${coll.handle}`,
          heroImage: kind === "teaser"
            ? teaserPics[0]?.image ?? null
            : (launch.heroHandles
                .map((h) => designs.find((d) => d.handle === h))
                .find(Boolean)?.image ?? designs[0]?.image) ?? null,
          gallery: designs.slice(0, 6).map((d) => ({
            title: d.title,
            handle: d.handle,
            image: d.image,
            priceFrom: d.fromPricePerSqft ? `${formatINR(d.fromPricePerSqft)}/sq ft` : null,
          })),
          siteUrl: SITE_URL,
          senderName,
          senderAddress,
          unsubscribeUrl,
          // The collection's own copy, where it has any. Falls through to the
          // generic name-and-date wording for a launch that has none.
          ...(() => {
            const c = launchCopyFor(coll.handle);
            return {
              ...c,
              shopfrontHref: c.shopfrontPath ? `${SITE_URL}${c.shopfrontPath}` : null,
            };
          })(),
        }),
      );

    // One copy to one address. Never touches the ledger, so a test does not
    // consume the real send.
    if (test) {
      const unsub = `${SITE_URL}/api/newsletter/unsubscribe?token=preview`;
      const { subject, html } = build(unsub);
      const ok = await sendEmail({
        to: test, subject, html,
        from: "Zyvorah <hello@mail.zyvorah.com>",
        replyTo: "hello@zyvorah.com",
        headers: { "List-Unsubscribe": `<${unsub}>` },
      });
      results.push({ handle: coll.handle, kind, mode: "test", to: test, subject, ok });
      continue;
    }

    if (!wantSend) {
      const { subject, html } = build(`${SITE_URL}/api/newsletter/unsubscribe?token=preview`);
      results.push({ handle: coll.handle, kind, mode: "preview", subject, designs: designs.length, htmlBytes: html.length });
      continue;
    }

    const admin = supabaseAdmin();
    if (!admin) {
      results.push({ handle: coll.handle, kind, error: "service_role_not_configured" });
      continue;
    }

    // The claim marks that this mail has STARTED. It is no longer the thing
    // that prevents a second delivery — the per-recipient table below is, and
    // it is a stronger guarantee: a primary key cannot be lost to a race, and
    // it survives a run that dies halfway.
    //
    // This matters because the old claim was also what made a partial send
    // permanent. On 5 September the teaser reached 468 of 569, wrote
    // finished_at, and stopped; the remaining 103 could never be retried
    // because the row said the mail had been sent. A run now resumes.
    await admin
      .from("collection_launch_mails")
      .insert({ collection_handle: coll.handle, kind });

    // The list, read with the service role we already hold.
    //
    // This used to go through newsletter_recipients(), whose first act is
    // intel_key_ok(p_key) — a gate that exists so a BROWSER can call it. This
    // route is server-only and already holds the service role, so the key check
    // bought nothing and cost everything: on 5 September the teaser claimed its
    // row, the RPC rejected the key, the route hit `continue`, and 571 people
    // got nothing while the ledger recorded the mail as taken. Verified after
    // the fact: the same RPC returns all 571 rows when handed a key the
    // database accepts, so the function was never the problem — only the
    // indirection was. Same filters, no second credential.
    const { data: recips, error: recErr } = await admin
      .from("customers")
      .select("email, unsubscribe_token")
      .not("email", "is", null)
      .is("marketing_opt_in", true)
      .is("unsubscribed_at", null)
      .is("email_bounced_at", null)
      .order("created_at")
      .limit(5000);
    if (recErr) {
      // RELEASE THE CLAIM. Claim-before-send is right — it is what stops two
      // overlapping runs mailing the list twice — but a claim that outlives a
      // failed run is worse than no claim at all: the mail can never be
      // retried, and the only symptom is a row that says it was sent. Nothing
      // has gone out at this point, so the row must go.
      await admin
        .from("collection_launch_mails")
        .delete()
        .eq("collection_handle", coll.handle).eq("kind", kind);
      results.push({ handle: coll.handle, kind, error: recErr.message, claim: "released" });
      continue;
    }

    const recipients = (recips as { email: string; unsubscribe_token: string }[] | null) ?? [];

    // An empty list is a failure, not a send. Releasing here means a launch
    // whose list momentarily read as empty can still be mailed once it does not.
    if (recipients.length === 0) {
      await admin
        .from("collection_launch_mails")
        .delete()
        .eq("collection_handle", coll.handle).eq("kind", kind);
      results.push({ handle: coll.handle, kind, error: "no_recipients", claim: "released" });
      continue;
    }

    // Who already has it. This is the real double-send guard.
    const { data: doneRows, error: doneErr } = await admin
      .from("collection_launch_mail_sends")
      .select("email")
      .eq("collection_handle", coll.handle).eq("kind", kind);
    if (doneErr) {
      results.push({ handle: coll.handle, kind, error: doneErr.message });
      continue;
    }
    const alreadySent = new Set((doneRows ?? []).map((r) => (r as { email: string }).email));
    const todo = recipients.filter((r) => !alreadySent.has(r.email));

    // Everyone on the list has it: this is the ordinary "nothing to do" path
    // that used to be a claim collision.
    if (todo.length === 0) {
      results.push({ handle: coll.handle, kind, skipped: "already_sent", had: alreadySent.size });
      continue;
    }
    // Paced and retried. The 5 September teaser pushed 571 messages in 56
    // seconds — about ten a second — and Resend's rate limiter rejected 103 of
    // them. There was no retry, so a transient 429 dropped a real customer for
    // good. A gap between sends costs a minute of function time; not having one
    // cost eighteen per cent of the list.
    // 250ms is ~4/sec. The failed run managed about 10/sec and lost 18% of the
    // list; 130ms is 7-8/sec, only a quarter slower than the rate that broke,
    // and we do not actually know where Resend's limit sits — only that it is
    // somewhere below ten. Four a second is a real margin rather than a
    // shaving, and it costs nothing that matters: 570 recipients take about
    // two and a half minutes, well inside this route's 300-second ceiling
    // (and a run that did time out resumes from the per-recipient ledger on
    // the next working-hours tick, so the cost of being slow is bounded and the cost
    // of being fast is a customer who never hears from us).
    const GAP_MS = 250;
    const ATTEMPTS = 3;   // a 429 is transient; give it room to clear
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

    let sent = 0, failed = 0, subject = "";
    for (const r of todo) {
      const unsub = `${SITE_URL}/api/newsletter/unsubscribe?token=${r.unsubscribe_token}`;
      const built = build(unsub);
      subject = built.subject;

      let ok = false;
      let id: string | null = null;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        ({ ok, id } = await sendEmailWithId({
          to: r.email, subject: built.subject, html: built.html,
          from: "Zyvorah <hello@mail.zyvorah.com>",
          replyTo: "hello@zyvorah.com",
          headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          tags: [
            { name: "launch", value: coll.handle },
            { name: "launch_mail", value: kind },
          ],
        }));
        if (ok) break;
        await pause(GAP_MS * 4 * attempt); // back off before trying again
      }

      if (ok) {
        sent++;
        // Recorded per recipient, so a later run skips them. Written straight
        // after the send: a crash between the two costs one duplicate, which is
        // the right way round — a duplicate is a nuisance, a silent omission is
        // a customer who never heard from us.
        await admin.from("collection_launch_mail_sends").insert({
          collection_handle: coll.handle, kind, email: r.email, resend_id: id,
        });
      } else {
        failed++;
      }
      await pause(GAP_MS);
    }

    // `sent` is the running total across every run of this mail, not just this
    // one — otherwise a resume would report 103 and read like the whole send.
    await admin
      .from("collection_launch_mails")
      .update({
        finished_at: new Date().toISOString(),
        sent: alreadySent.size + sent,
        failed,
        subject,
      })
      .eq("collection_handle", coll.handle).eq("kind", kind);

    results.push({
      handle: coll.handle, kind, mode: "sent",
      sentThisRun: sent, failedThisRun: failed,
      sentTotal: alreadySent.size + sent, subject, activation,
    });
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), results });
}

export const GET = withCronRun("launch-mail", tick);
