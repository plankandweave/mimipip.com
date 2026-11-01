import { istDateKey } from "@/lib/ist";
import { NextResponse, after } from "next/server";
import { inviteForToken, hasSession } from "@/lib/presentation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

// A recipient comments, or asks for a call.
//
// The whole reason this route exists rather than a mailto: the response is
// attached to the company and the deal it came from, so it lands on the CRM
// timeline already knowing who said it and about what. A call request also
// raises a to-do, because an ask with nothing chasing it is how a warm lead
// goes cold.

const MAX_BODY = 4000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const invite = await inviteForToken(token);
  if (!invite) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { recipient, presentation } = invite;
  if (presentation.require_code && !(await hasSession(recipient.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const payload = await req.json().catch(() => null);
  const kind = payload?.kind === "call" ? "call" : "comment";
  const body = typeof payload?.body === "string" ? payload.body.trim().slice(0, MAX_BODY) : "";
  const anchor = typeof payload?.anchor === "string" ? payload.anchor.trim().slice(0, 200) : "";
  if (body.length < 2) return NextResponse.json({ error: "empty" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const who = recipient.name || recipient.email;

  const { error } = await sb.from("crm_presentation_comments").insert({
    presentation_id: presentation.id,
    recipient_id: recipient.id,
    anchor: anchor || null,
    body,
    kind,
  });
  if (error) {
    console.error("[presentation] comment insert failed:", error.message);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }

  // Onto the deal's timeline. Written as a note rather than left in the
  // comments table alone so it shows up where Roheena already looks — the
  // company page — instead of only inside the presentation panel.
  await sb.from("crm_notes").insert({
    company_id: presentation.company_id,
    deal_id: presentation.deal_id,
    kind: kind === "call" ? "call" : "note",
    body:
      kind === "call"
        ? `${who} asked for a call from "${presentation.title}": ${body}`
        : `${who} commented on "${presentation.title}"${anchor ? ` (${anchor})` : ""}: ${body}`,
    source: "manual",
  });

  if (kind === "call") {
    await sb.from("crm_tasks").insert({
      company_id: presentation.company_id,
      deal_id: presentation.deal_id,
      title: `Call ${who} — asked from "${presentation.title}"`,
      // Tomorrow, not today: a request that arrives at 11pm should not read as
      // already overdue by morning.
      due_on: istDateKey(new Date(Date.now() + 86_400_000)),
      source: "manual",
    });
  }

  // After the response, so a slow mail provider never delays the recipient's
  // confirmation — the record is already committed either way.
  after(() =>
    sendEmail({
      to: process.env.EMAIL_REPLY_TO || "hello@zyvorah.com",
      subject:
        kind === "call"
          ? `Call requested — ${who} on "${presentation.title}"`
          : `Comment — ${who} on "${presentation.title}"`,
      html: `<p><strong>${escapeHtml(who)}</strong> (${escapeHtml(recipient.email)})${
        anchor ? ` on <em>${escapeHtml(anchor)}</em>` : ""
      }:</p><blockquote>${escapeHtml(body).replace(/\n/g, "<br>")}</blockquote>`,
    }).catch((e) => console.error("[presentation] notify failed:", e)),
  );

  return NextResponse.json({ ok: true });
}

/** The body is text a third party typed. It goes into an email we send
 *  ourselves, so it is escaped rather than trusted. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
