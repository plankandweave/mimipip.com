import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inMailWindow, optinNoticeEmail, pickNoticeHero } from "./optin-notice";

// Emails go out only between 9 am and 7 pm IST, and never on a Sunday.
test("send window: Monday to Saturday, 09:00–19:00 IST", () => {
  assert.equal(inMailWindow(new Date("2026-10-05T03:30:00Z")), true); // Mon 09:00 IST
  assert.equal(inMailWindow(new Date("2026-10-05T03:29:00Z")), false); // Mon 08:59 IST
  assert.equal(inMailWindow(new Date("2026-10-05T13:29:00Z")), true); // Mon 18:59 IST
  assert.equal(inMailWindow(new Date("2026-10-05T13:30:00Z")), false); // Mon 19:00 IST
  assert.equal(inMailWindow(new Date("2026-10-10T08:00:00Z")), true); // Sat 13:30 IST
  assert.equal(inMailWindow(new Date("2026-10-11T06:00:00Z")), false); // Sun 11:30 IST
  assert.equal(inMailWindow(new Date("2026-10-10T20:00:00Z")), false); // Sun 01:30 IST (Sat in UTC)
});

test("the notice carries a working one-click unsubscribe link", () => {
  const unsub = "https://zyvorah.com/api/newsletter/unsubscribe?token=abc";
  const { subject, html } = optinNoticeEmail({ siteUrl: "https://zyvorah.com", unsubscribeUrl: unsub, senderName: "Zyvorah" });
  assert.ok(subject.length > 0);
  assert.ok(html.includes(unsub));
  assert.doesNotMatch(html, /[\u{1F300}-\u{1FAFF}]/u, "no emoji in customer mail");
});

test("the sender is held off by default, checks the window per send, and marks people only after delivery", () => {
  const src = readFileSync("src/app/api/cron/optin-notice/route.ts", "utf8");
  assert.match(src, /stage === "off"/);
  assert.match(src, /for \(const r of todo\) \{\s*if \(Date\.now\(\) > deadline \|\| !inMailWindow\(new Date\(\)\)\) break;/);
  assert.match(src, /List-Unsubscribe-Post/);
  const sendAt = src.indexOf("await send(r.email");
  const markAt = src.indexOf(`rpc("optin_notice_mark_sent"`);
  assert.ok(sendAt > 0 && markAt > sendAt && src.slice(sendAt, markAt).includes("if (ok)"));
});

test("the notice leads with a room picture, never the flat swatch", () => {
  const hero = pickNoticeHero([
    { title: "Flat only", images: [{ url: "https://x/flat.jpg", is_flat: true, width: 2000, height: 1000 }] },
    {
      title: "Bloom",
      images: [
        { url: "https://x/bloom-flat.jpg", is_flat: true, width: 2000, height: 1000 },
        { url: "https://x/bloom-tall.jpg", is_flat: false, width: 800, height: 1200 },
        { url: "https://x/bloom-room.jpg", is_flat: false, width: 1600, height: 1000 },
      ],
    },
  ]);
  assert.deepEqual(hero, { image: "https://x/bloom-room.jpg", caption: "Bloom" });
  const { html } = optinNoticeEmail({ siteUrl: "https://zyvorah.com", unsubscribeUrl: "u", senderName: "Zyvorah", hero });
  assert.ok(html.includes("https://x/bloom-room.jpg"));
  assert.equal(pickNoticeHero([{ title: "Flat only", images: [{ url: "f", is_flat: true }] }]), null);
});

test("the unsubscribe note is one short line", () => {
  const { html } = optinNoticeEmail({ siteUrl: "https://zyvorah.com", unsubscribeUrl: "u", senderName: "Zyvorah" });
  assert.match(html, /Prefer not to\? Unsubscribe below in one click\./);
  assert.doesNotMatch(html, /you will not hear from us again unless you ask/);
});
