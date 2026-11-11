import { test } from "node:test";
import assert from "node:assert/strict";
import { arrivalNoticeEmail, inArrivalWindow, parseArrivalNotice, ARRIVAL_FROM } from "./arrival-notice";

const fields = {
  firstName: "Priya",
  orderNumber: "ZVY-20512",
  dispatchDate: "5 October 2026",
  courier: "SM Courier",
  trackingUrl: "https://smexpresslogistics.com/order-tracking/",
  awb: "SM123456",
};

test("the owner's wording, word for word", () => {
  const m = arrivalNoticeEmail(fields);
  assert.equal(m.subject, "Your Zyvorah order ZVY-20512 should have reached you");
  assert.equal(
    m.text,
    "Dear Priya,\n\n" +
      "Your order ZVY-20512 left our studio on 5 October 2026 with SM Courier. You can follow it here: https://smexpresslogistics.com/order-tracking/ (tracking number SM123456).\n\n" +
      "By now it should have reached you, and we hope you love it. If anything has not arrived, or has arrived damaged, simply reply to this email and we will set it right straight away.\n\n" +
      "If we do not hear from you, we will take it that your order reached you safely.\n\n" +
      "Warm regards,\nTeam Zyvorah",
  );
  assert.ok(m.html.includes('href="https://smexpresslogistics.com/order-tracking/"'));
  assert.ok(!/[\u{1F300}-\u{1FAFF}✦]/u.test(m.text + m.html), "no emoji");
});

test("it goes from Team Zyvorah", () => {
  assert.equal(ARRIVAL_FROM, "Team Zyvorah <hello@mail.zyvorah.com>");
});

test("the HTML escapes what the OS sends", () => {
  const m = arrivalNoticeEmail({ ...fields, firstName: "<b>x</b>" });
  assert.ok(m.html.includes("&lt;b&gt;x&lt;/b&gt;"));
});

test("only Monday to Saturday, 9 am to 7 pm IST", () => {
  const ist = (s: string) => new Date(`${s}+05:30`);
  assert.equal(inArrivalWindow(ist("2026-10-10T09:00:00")), true); // Saturday
  assert.equal(inArrivalWindow(ist("2026-10-10T18:59:00")), true);
  assert.equal(inArrivalWindow(ist("2026-10-10T19:00:00")), false);
  assert.equal(inArrivalWindow(ist("2026-10-12T08:59:00")), false); // Monday early
  assert.equal(inArrivalWindow(ist("2026-10-11T11:00:00")), false); // Sunday
});

test("a payload missing a field, or with a non-https link, is refused", () => {
  assert.equal(parseArrivalNotice({ ...fields, to: "a@b.co" }).ok, true);
  assert.deepEqual(parseArrivalNotice({ ...fields, to: "nope" }), { ok: false, error: "invalid_to" });
  assert.deepEqual(parseArrivalNotice({ ...fields, to: "a@b.co", awb: "" }), { ok: false, error: "missing_awb" });
  assert.deepEqual(parseArrivalNotice({ ...fields, to: "a@b.co", trackingUrl: "javascript:x" }), { ok: false, error: "invalid_trackingUrl" });
});
