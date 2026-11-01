import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { checkGstin, gstinStateMismatch } from "@/lib/gstin";
import { can, currentCorporateSession, recordAudit, sessionActor, shipStateAllowed } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { escapeHtml, priceProjectLines, wireProjectLine } from "@/lib/corporate-project";
import { mintQuoteToken } from "@/lib/corporate-quote";
import { pendingQuotes } from "@/lib/pending-quotes";
import { quotationMessage, waNumber, waShareUrl } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST -> send this project OUT for a purchase order instead of to print.
//
// The partner composing the walls is very often not the person who can commit
// the spend. Today they screenshot the cart and mail it, and the PO comes back
// against a total nobody can tie to the walls. This endpoint takes exactly the
// same lines the batch order route takes, prices them the same way, and parks
// them as a quotation with an unguessable link — which goes out by email here,
// and by WhatsApp from the partner's own phone (the browser opens the returned
// wa.me link).
//
// NOTHING is ordered here. No corporate_orders row exists until the PO raiser
// approves, which is the whole point: the PO number lands ON the order rather
// than being reconciled to it afterwards.
//
// The minimum-order check deliberately does NOT run at this point — quoting is
// free, and the shortfall is enforced when the project is actually placed.

// GET -> the quotations on this account still waiting for a PO. Only someone
// who may place orders sees them: entering the PO is what commits the spend.
export async function GET() {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(session, "order") || session.agreementPending) return NextResponse.json({ ok: true, quotes: [] });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const { data, error } = await sb.from("corporate_quotes")
    .select("token, walls, total_inr, created_by_email, recipient_name, recipient_email, recipient_phone, approved_at, declined_at, group_ref, expires_at, created_at")
    .eq("account_id", session.account.id)
    .is("approved_at", null).is("declined_at", null)
    .order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true, quotes: pendingQuotes((data ?? []) as Record<string, unknown>[], Date.now()) });
}

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  // Sending a quotation commits nothing, but it quotes this account's
  // contracted rates to an outsider — the same permission that lets someone
  // spend the account is the right gate for that.
  if (!can(session, "order")) {
    return NextResponse.json({
      error: "You don't have permission to send quotations. Ask one of your account admins.",
    }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const rawLines = Array.isArray(b.lines) ? b.lines : [];
  if (rawLines.length < 1) return NextResponse.json({ error: "Add at least one wall before sending a quotation." }, { status: 400 });
  const state = str(b.state);
  if (!state) return NextResponse.json({ error: "Choose the dispatch state." }, { status: 400 });

  const acc = session.account;
  if (!shipStateAllowed(acc, state)) {
    return NextResponse.json({ error: `We don't ship to ${state} on this account. Contact us at hello@zyvorah.com to add it.` }, { status: 400 });
  }

  const recipientEmail = str(b.recipientEmail).toLowerCase();
  const recipientPhoneRaw = str(b.recipientPhone);
  const recipientPhone = waNumber(recipientPhoneRaw);
  const recipientName = str(b.recipientName) || null;
  // One channel is enough to send on, but with neither there is nobody to send
  // to — and a quotation nobody receives is a row that rots.
  if (!recipientEmail && !recipientPhone) {
    return NextResponse.json({
      error: "Add an email address or a WhatsApp number for the person raising the PO.",
    }, { status: 400 });
  }
  if (recipientEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
    return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  }
  if (recipientPhoneRaw && !recipientPhone) {
    return NextResponse.json({
      error: "That WhatsApp number doesn't look like a mobile number we can reach.",
    }, { status: 400 });
  }

  const priced = await priceProjectLines(acc, rawLines);
  if (!priced.ok) return NextResponse.json({ error: priced.error }, { status: priced.status });
  const lines = priced.lines;

  const gstinCheck = checkGstin(b.gstin as string | null | undefined);
  if ("error" in gstinCheck) return NextResponse.json({ error: gstinCheck.error }, { status: 400 });
  const stateMismatch = gstinStateMismatch(gstinCheck.value, state);
  if (stateMismatch) return NextResponse.json({ error: stateMismatch }, { status: 400 });

  const totalInr = Math.round(lines.reduce((s, l) => s + l.price.total, 0));
  const totalSqft = Math.round(lines.reduce((s, l) => s + l.price.areaSqft, 0) * 10) / 10;

  const token = mintQuoteToken();
  const { error } = await sb.from("corporate_quotes").insert({
    account_id: acc.id,
    token,
    created_by_email: session.email,
    recipient_name: recipientName,
    recipient_email: recipientEmail || null,
    recipient_phone: recipientPhone,
    // Geometry only. Every rupee on the quote page and on the eventual order is
    // re-derived from the account's rate at read time.
    lines: lines.map(wireProjectLine),
    state,
    gstin: gstinCheck.value,
    ship_address: str(b.shipAddress) || null,
    ship_city: str(b.shipCity) || null,
    ship_pincode: str(b.shipPincode) || null,
    ship_contact_name: str(b.shipContactName) || null,
    ship_contact_phone: str(b.shipContactPhone) || null,
    walls: lines.length,
    total_sqft: totalSqft,
    total_inr: totalInr,
  });
  if (error) {
    console.error("[corporate/quotes] insert failed:", error.message);
    return NextResponse.json({ error: "Could not create the quotation." }, { status: 500 });
  }

  const url = `${SITE_URL}/q/${token}`;
  const actor = sessionActor(session);

  if (recipientEmail) {
    void sendEmail({
      to: recipientEmail,
      // The partner is the one this person expects to hear from, so replies go
      // to them, not to our desk.
      replyTo: session.email,
      cc: session.email,
      subject: `Wallpaper quotation for ${acc.name} — ${lines.length} wall${lines.length === 1 ? "" : "s"}, ₹${totalInr.toLocaleString("en-IN")}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#1c1c1c">
        <p>${recipientName ? `Hi ${escapeHtml(recipientName)},` : "Hello,"}</p>
        <p><strong>${escapeHtml(actor.name)}</strong> has sent you a wallpaper quotation for
        <strong>${escapeHtml(acc.name)}</strong> — ${lines.length} wall${lines.length === 1 ? "" : "s"},
        ${totalSqft} sq ft.</p>
        <table style="border-collapse:collapse;font-size:13px;margin:14px 0">${lines.map((l, i) => `
          <tr>
            <td style="padding:4px 12px 4px 0">${i + 1}</td>
            <td style="padding:4px 12px 4px 0">${escapeHtml(l.printName ?? "Wall")}</td>
            <td style="padding:4px 12px 4px 0">${(l.widthMm / 304.8).toFixed(1)} × ${(l.heightMm / 304.8).toFixed(1)} ft</td>
            <td style="padding:4px 0;text-align:right">₹${Math.round(l.price.total).toLocaleString("en-IN")}</td>
          </tr>`).join("")}
          <tr><td colspan="3" style="padding:8px 12px 0 0;border-top:1px solid #e5e5e5"><strong>Total incl. GST</strong></td>
              <td style="padding:8px 0 0;border-top:1px solid #e5e5e5;text-align:right"><strong>₹${totalInr.toLocaleString("en-IN")}</strong></td></tr>
        </table>
        <p style="margin:20px 0">
          <a href="${url}" style="background:#1c1c1c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block">
            View the quotation &amp; enter your PO
          </a>
        </p>
        <p style="font-size:13px;color:#5b5b5b">Once you raise the purchase order, enter the PO number on that page.
        The walls go to print against it, and the PO number is carried through to your invoice.</p>
        <p style="font-size:12px;color:#8a8a8a">This link is private to you and expires in 30 days.</p>
      </div>`,
    });
  }

  // The WhatsApp half is a deep link the browser opens — the message leaves
  // from the partner's own number, which is the number their client knows.
  const waUrl = waShareUrl(recipientPhone, quotationMessage({
    recipientName, accountName: acc.name, walls: lines.length, totalInr, url,
  }));

  await recordAudit(session, "quote.send", null, {
    walls: lines.length, totalInr,
    to: recipientEmail || recipientPhone,
  });

  return NextResponse.json({
    ok: true, token, url, waUrl,
    emailed: Boolean(recipientEmail),
    walls: lines.length, totalSqft, totalInr,
  });
}
