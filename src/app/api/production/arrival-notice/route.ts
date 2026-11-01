import { NextResponse } from "next/server";
import { sendEmailWithId } from "@/lib/email";
import { ARRIVAL_FROM, ARRIVAL_REPLY_TO, arrivalNoticeEmail, inArrivalWindow, parseArrivalNotice } from "@/lib/arrival-notice";

export const runtime = "nodejs";

// The OS asks the store to send the working-day-4 "should have reached you"
// email (Roheena, 9 October 2026). The OS decides WHO (courier parcels only,
// no returns/NDR/lost/damaged, nobody who has already written to us) and
// records the send; this route only renders the fixed wording and sends it
// from Team Zyvorah. Authenticated by the token the two systems already
// share (ZYVORAH_WEBHOOK_TOKEN), like /api/production/event.
//
// POST { secret, to, firstName, orderNumber, dispatchDate, courier, trackingUrl?, awb, idempotencyKey }
export async function POST(req: Request) {
  const osToken = process.env.ZYVORAH_WEBHOOK_TOKEN;
  if (!osToken) return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => null);
  if (typeof body?.secret !== "string" || body.secret !== osToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!inArrivalWindow(new Date())) {
    return NextResponse.json({ error: "outside_send_window" }, { status: 409 });
  }
  const parsed = parseArrivalNotice(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey.slice(0, 200) : "";
  if (!key) return NextResponse.json({ error: "missing_idempotencyKey" }, { status: 400 });

  const mail = arrivalNoticeEmail(parsed.fields);
  const sent = await sendEmailWithId({
    from: ARRIVAL_FROM,
    replyTo: ARRIVAL_REPLY_TO,
    to: parsed.to,
    subject: mail.subject,
    html: mail.html,
    idempotencyKey: key,
    tags: [{ name: "kind", value: "arrival_notice" }],
  });
  if (!sent.ok) return NextResponse.json({ error: "send_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, id: sent.id, subject: mail.subject, text: mail.text });
}
