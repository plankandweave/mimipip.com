import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import {
  canAdministerAccount, currentCorporateSession, normaliseEmail, recordAudit,
} from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import {
  mintMeasureLink, revokeMeasureLink, DEFAULT_LINK_DAYS, MAX_LINK_DAYS,
  type MeasureLinkRow, type StoreRow,
} from "@/lib/measure-link";

export const dynamic = "force-dynamic";

/**
 * HQ mints a measurement link for one store and sends it to whoever is going
 * to walk that store with a phone.
 *
 * Admin-only on every verb, including the list — unlike the team page, which
 * the whole account may read. A live link is a bearer credential, and the
 * list carries who holds each one.
 *
 * THE TOKEN IS RETURNED EXACTLY ONCE, by mint, and is never stored in a form
 * that can be read back. So there is no "show me that link again": the answer
 * to "I've lost it" and to "I sent it to the wrong person" is the same one —
 * mint a fresh link, which revokes the old.
 *
 * recipient_email is NOT domain-locked. The person measuring a Vijay Sales
 * store is often a contractor or a shopfitter on a personal address, and a
 * link grants one store's measurement form and nothing else. Do not "unify"
 * this with /api/corporate/members, which is domain-locked because it hands
 * out a portal login that can spend money.
 */

/** 'Vijay Sales' → 'VS'. Only ever seen inside a ref like VS-M-7QK4NB. */
function refPrefix(name: string): string {
  const letters = name.replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (letters || "ZYV").slice(0, 4);
}

type LinkStatus = "live" | "opened" | "submitted" | "revoked" | "expired";

function statusOf(l: MeasureLinkRow): LinkStatus {
  if (l.revoked_at) return "revoked";
  if (l.submitted_at) return "submitted";
  if (new Date(l.expires_at).getTime() <= Date.now()) return "expired";
  return l.opened_at ? "opened" : "live";
}

export async function GET() {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  if (!canAdministerAccount(session)) {
    return NextResponse.json({ error: "Only an account admin can see measurement links." }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { data, error } = await sb.from("corporate_measure_links")
    .select("*").eq("account_id", session.account.id)
    .order("created_at", { ascending: false }).limit(200);
  if (error) {
    console.error("[measure-links] list failed:", error.message);
    return NextResponse.json({ error: "Could not load the links." }, { status: 500 });
  }
  const links = (data ?? []) as MeasureLinkRow[];

  // Store names in one query rather than one per row.
  const storeIds = [...new Set(links.map((l) => l.store_id))];
  const { data: stores } = storeIds.length
    ? await sb.from("corporate_stores").select("id, name").in("id", storeIds)
    : { data: [] };
  const nameById = new Map((stores ?? []).map((s) => [s.id as string, s.name as string]));

  return NextResponse.json({
    ok: true,
    links: links.map((l) => ({
      id: l.id,
      ref: l.ref,
      storeId: l.store_id,
      storeName: nameById.get(l.store_id) ?? "—",
      recipientEmail: l.recipient_email,
      recipientName: l.recipient_name,
      brief: l.brief,
      status: statusOf(l),
      createdBy: l.created_by_email,
      createdAt: l.created_at,
      expiresAt: l.expires_at,
      openedAt: l.opened_at,
      lastSeenAt: l.last_seen_at,
      submittedAt: l.submitted_at,
      batchId: l.batch_id,
    })),
  });
}

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  if (!canAdministerAccount(session)) {
    return NextResponse.json({
      error: "Only an account admin can send someone out to measure a store.",
    }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let b: {
    action?: string; id?: string; storeId?: string;
    email?: string; name?: string; brief?: string; days?: number;
    seriesNames?: string[]; send?: boolean;
  };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  // ── Revoke ───────────────────────────────────────────────────────────────
  if (b.action === "revoke") {
    const id = String(b.id ?? "");
    // Scoped to the account before revoking, so an id from another tenant
    // cannot be killed by guessing it.
    const { data: own } = await sb.from("corporate_measure_links")
      .select("id, ref").eq("id", id).eq("account_id", session.account.id).maybeSingle();
    if (!own) return NextResponse.json({ error: "That link isn't on your account." }, { status: 404 });
    const done = await revokeMeasureLink(id, session.email);
    await recordAudit(session, "measure_link.revoke", { type: "measure_link", id }, { ref: own.ref });
    return NextResponse.json({ ok: true, revoked: done });
  }

  // ── Mint ─────────────────────────────────────────────────────────────────
  const storeId = String(b.storeId ?? "");
  const { data: store } = await sb.from("corporate_stores")
    .select("*").eq("id", storeId).eq("account_id", session.account.id)
    .eq("active", true).maybeSingle();
  if (!store) return NextResponse.json({ error: "Pick a store first." }, { status: 400 });

  const email = normaliseEmail(String(b.email ?? ""));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter the email address of the person measuring." }, { status: 400 });
  }
  const days = Math.min(MAX_LINK_DAYS, Math.max(1, Math.round(Number(b.days) || DEFAULT_LINK_DAYS)));

  const minted = await mintMeasureLink({
    accountId: session.account.id,
    storeId: (store as StoreRow).id,
    refPrefix: refPrefix(session.account.name),
    recipientEmail: email,
    recipientName: b.name,
    brief: b.brief,
    seriesNames: b.seriesNames,
    days,
    byEmail: session.email,
  });
  if (!minted) {
    return NextResponse.json({ error: "Could not create that link." }, { status: 500 });
  }

  await recordAudit(session, "measure_link.mint",
    { type: "measure_link", id: minted.id },
    { ref: minted.ref, store: (store as StoreRow).name, to: email, days });

  // The link is the whole product, so it goes to the recipient by email as
  // well as being shown to the admin — a link an admin has to copy out and
  // paste into WhatsApp is a link that reaches the wrong person eventually.
  //
  // The admin's copy still matters: plenty of shopfitters are reached on
  // WhatsApp and not on email, and the admin has it in front of them right now.
  let emailed = false;
  if (b.send !== false) {
    try {
      emailed = await sendEmail({
        to: email,
        subject: `Measure ${(store as StoreRow).name} for ${session.account.name}`,
        html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px">
  <p style="font-size:15px;color:#0f172a">${session.email} has asked you to measure
    <b>${(store as StoreRow).name}</b>${(store as StoreRow).city ? ` (${(store as StoreRow).city})` : ""}.</p>
  ${b.brief ? `<p style="font-size:14px;color:#334155">${String(b.brief).slice(0, 2000)}</p>` : ""}
  <p style="font-size:14px;color:#334155">Open this on the phone you'll carry round the store. Walk it
    <b>clockwise</b>, add each wall as you go with a photo and its width and height. You can stop and come
    back — nothing is lost.</p>
  <p style="margin:18px 0"><a href="${minted.url}" style="background:#0f172a;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Start measuring</a></p>
  <p style="font-size:12px;color:#94a3b8">This link is personal to you and stops working on
    ${new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}.</p>
  <p style="font-size:12px;color:#94a3b8;margin-top:22px">Zyvorah · made-to-order wallpaper</p>
</div>`,
      });
    } catch (e) {
      // Not fatal: the admin has the link on screen and can send it themselves.
      console.error("[measure-links] invite email failed:", minted.ref, e);
    }
  }

  return NextResponse.json({
    ok: true, emailed,
    link: {
      id: minted.id, ref: minted.ref, url: minted.url,
      storeName: (store as StoreRow).name, recipientEmail: email, days,
    },
  });
}
