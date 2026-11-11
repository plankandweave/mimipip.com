import { test } from "node:test";
import assert from "node:assert/strict";
import { adsInviteEmail, inInviteWindow } from "./ads-invite";

// Customer mail goes Mon–Sat, 10:00–18:00 IST — never on a Sunday.
test("send window: weekday business hours in IST only", () => {
  assert.equal(inInviteWindow(new Date("2026-10-05T05:30:00Z")), true); // Mon 11:00 IST
  assert.equal(inInviteWindow(new Date("2026-10-05T03:00:00Z")), false); // Mon 08:30 IST
  assert.equal(inInviteWindow(new Date("2026-10-05T12:30:00Z")), false); // Mon 18:00 IST
  assert.equal(inInviteWindow(new Date("2026-10-10T12:00:00Z")), true); // Sat 17:30 IST
  assert.equal(inInviteWindow(new Date("2026-10-11T06:00:00Z")), false); // Sun 11:30 IST
});

test("the button opens the confirmation page, never a URL that grants on open", () => {
  const { html } = adsInviteEmail({
    siteUrl: "https://zyvorah.com",
    yesUrl: "https://zyvorah.com/ads-consent/yes?t=00000000-0000-0000-0000-000000000000",
    unsubscribeUrl: "https://zyvorah.com/api/newsletter/unsubscribe?token=x",
    senderName: "Zyvorah",
  });
  assert.match(html, /\/ads-consent\/yes\?t=/);
  assert.doesNotMatch(html, /\/api\/consent\/ads\/grant/);
});
