// "Your Zyvorah order should have reached you" — the ONE email a courier
// parcel gets after it is dispatched (Roheena, 9 October 2026).
//
// Parcels close at dispatch; nobody chases them in transit. On working day 4
// after dispatch the OS (lib/zyvorah-arrival-notice.ts in
// magnitude-global-platform) decides who is due — it alone knows every
// channel's parcels, the courier's read-back and whether the customer has
// already written — and asks this store to send, because the mail goes from
// Team Zyvorah on mail.zyvorah.com, this store's verified sending domain.
//
// The wording is the owner's, word for word. Plain, polite, no emoji.

export const ARRIVAL_FROM = "Team Zyvorah <hello@mail.zyvorah.com>";
/** mail.zyvorah.com has no inbox: a reply must reach one somebody reads. */
export const ARRIVAL_REPLY_TO = "hello@zyvorah.com";

export type ArrivalNoticeFields = {
  firstName: string;
  orderNumber: string;
  /** Already formatted for the customer, e.g. "9 October 2026". */
  dispatchDate: string;
  courier: string;
  trackingUrl: string | null;
  awb: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Validate the OS's payload; returns the fields or the first problem. */
export function parseArrivalNotice(body: unknown): { ok: true; to: string; fields: ArrivalNoticeFields } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
  const to = str("to");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, error: "invalid_to" };
  for (const k of ["firstName", "orderNumber", "dispatchDate", "courier", "awb"]) {
    if (!str(k)) return { ok: false, error: `missing_${k}` };
  }
  const tracking = str("trackingUrl");
  if (tracking && !/^https:\/\/[^\s]+$/.test(tracking)) return { ok: false, error: "invalid_trackingUrl" };
  return {
    ok: true,
    to,
    fields: {
      firstName: str("firstName"),
      orderNumber: str("orderNumber"),
      dispatchDate: str("dispatchDate"),
      courier: str("courier"),
      trackingUrl: tracking || null,
      awb: str("awb"),
    },
  };
}

/** Monday to Saturday, 09:00 to 19:00 IST. The OS only asks inside this
 *  window; the store refuses outside it as well, so a clock or queue slip on
 *  either side can never mail a customer on a Sunday or at night. */
export function inArrivalWindow(now: Date): boolean {
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  if (ist.getUTCDay() === 0) return false;
  const h = ist.getUTCHours();
  return h >= 9 && h < 19;
}

export function arrivalNoticeEmail(f: ArrivalNoticeFields): { subject: string; text: string; html: string } {
  const follow = f.trackingUrl
    ? `You can follow it here: ${f.trackingUrl} (tracking number ${f.awb}).`
    : `Its tracking number is ${f.awb}.`;
  const paragraphs = [
    `Dear ${f.firstName},`,
    `Your order ${f.orderNumber} left our studio on ${f.dispatchDate} with ${f.courier}. ${follow}`,
    `By now it should have reached you, and we hope you love it. If anything has not arrived, or has arrived damaged, simply reply to this email and we will set it right straight away.`,
    `If we do not hear from you, we will take it that your order reached you safely.`,
    `Warm regards,\nTeam Zyvorah`,
  ];
  const followHtml = f.trackingUrl
    ? `You can follow it here: <a href="${esc(f.trackingUrl)}" style="color:#2D2D2D;">${esc(f.trackingUrl)}</a> (tracking number ${esc(f.awb)}).`
    : `Its tracking number is ${esc(f.awb)}.`;
  const htmlParas = [
    `Dear ${esc(f.firstName)},`,
    `Your order ${esc(f.orderNumber)} left our studio on ${esc(f.dispatchDate)} with ${esc(f.courier)}. ${followHtml}`,
    esc(paragraphs[2]!),
    esc(paragraphs[3]!),
    `Warm regards,<br>Team Zyvorah`,
  ];
  const html =
    `<!doctype html><html><body style="margin:0;padding:0;background:#FFFFFF;">` +
    `<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.6;color:#2D2D2D;text-align:left;">` +
    htmlParas.map(p => `<p style="margin:0 0 16px;">${p}</p>`).join("") +
    `</div></body></html>`;
  return {
    subject: `Your Zyvorah order ${f.orderNumber} should have reached you`,
    text: paragraphs.join("\n\n"),
    html,
  };
}
