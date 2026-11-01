import { NextResponse } from "next/server";
import { inviteForToken, issueCode, verifyCode } from "@/lib/presentation";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

// The one-time code path, for a presentation with require_code on.
//
// POST issues a code and emails it to the INVITED address — never to one
// supplied by the caller, which is what makes forwarding the link useless.
// PUT verifies it and mints the session.

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const invite = await inviteForToken(token);
  if (!invite) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const code = await issueCode(invite.recipient.id);
  if (!code) return NextResponse.json({ error: "failed" }, { status: 500 });

  const ok = await sendEmail({
    to: invite.recipient.email,
    subject: `Your code for "${invite.presentation.title}"`,
    html:
      `<p>Your code is <strong style="font-size:20px;letter-spacing:3px">${code}</strong></p>` +
      `<p>It opens the proposal for fifteen minutes. If you didn't ask for this, ignore it — nobody can open the proposal without it.</p>`,
  });
  // A send failure is reported rather than swallowed: silently showing the
  // code box when no email is coming leaves the recipient waiting forever.
  if (!ok) return NextResponse.json({ error: "send_failed" }, { status: 502 });

  return NextResponse.json({ ok: true });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const invite = await inviteForToken(token);
  if (!invite) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const payload = await req.json().catch(() => null);
  const code = typeof payload?.code === "string" ? payload.code.trim() : "";
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "bad_code" }, { status: 400 });

  const ok = await verifyCode(invite.recipient.id, code);
  if (!ok) return NextResponse.json({ error: "bad_code" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
