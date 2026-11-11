import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCollabFields,
  parseDeliverableFields,
  parseHashtags,
  parseHandles,
  instagramHandle,
  isOverdue,
} from "./collab-admin";

test("a new collaboration needs a name and an email, and defaults nothing else", () => {
  assert.deepEqual(parseCollabFields({}, false), { ok: false, error: "A name is needed." });
  assert.equal(parseCollabFields({ name: "Priya" }, false).ok, false);
  const r = parseCollabFields({ name: " Priya Sharma ", email: "Priya@Example.com " }, false);
  assert.deepEqual(r, { ok: true, value: { name: "Priya Sharma", email: "priya@example.com" } });
});

test("an edit sets only what it carries", () => {
  assert.deepEqual(parseCollabFields({ status: "live" }, true), { ok: true, value: { status: "live" } });
  assert.equal(parseCollabFields({ status: "paused" }, true).ok, false);
});

test("the offer: 1–100%, an optional ceiling, designs, an expiry at the end of the day in India", () => {
  const r = parseCollabFields(
    { discount_pct: "100", max_value_inr: "₹25,000", allowed_handles: "https://zyvorah.com/products/Wildflower-Reverie, chateau-village", code_expires_at: "2026-11-15", free_shipping: true },
    true,
  );
  assert.ok(r.ok);
  assert.deepEqual(r.value, {
    discount_pct: 100,
    max_value_inr: 25000,
    allowed_handles: ["wildflower-reverie", "chateau-village"],
    code_expires_at: "2026-11-15T23:59:59+05:30",
    free_shipping: true,
  });
  assert.equal(parseCollabFields({ discount_pct: 0 }, true).ok, false);
  assert.equal(parseCollabFields({ discount_pct: 101 }, true).ok, false);
  assert.equal(parseCollabFields({ max_value_inr: "-5" }, true).ok, false);
  assert.deepEqual(parseCollabFields({ allowed_handles: "" }, true), { ok: true, value: { allowed_handles: null } });
});

test("codes, link names and landing pages fit what the database and the link accept", () => {
  assert.deepEqual(parseCollabFields({ code: "zyv-priya-7k2q" }, true), { ok: true, value: { code: "ZYV-PRIYA-7K2Q" } });
  assert.equal(parseCollabFields({ code: "no spaces" }, true).ok, false);
  assert.equal(parseCollabFields({ slug: "Priya Sharma" }, true).ok, false);
  assert.equal(parseCollabFields({ landing_path: "https://evil.com" }, true).ok, false);
  assert.deepEqual(parseCollabFields({ landing_path: "/collections/kids-room" }, true), { ok: true, value: { landing_path: "/collections/kids-room" } });
});

test("hashtags and handles are tidied the way they are typed", () => {
  assert.deepEqual(parseHashtags("#ZyvorahWalls, zyvorahxpriya  #zyvorahwalls #Home!"), ["ZyvorahWalls", "zyvorahxpriya", "Home"]);
  assert.deepEqual(parseHandles(["a-b", "A-B", "ok handle!"]), ["a-b", "ok"], "repeats and junk fall away");
  assert.equal(instagramHandle("https://www.instagram.com/priya.sharma/?hl=en"), "priya.sharma");
  assert.equal(instagramHandle("@priya_s"), "priya_s");
  assert.equal(instagramHandle("not a handle!"), null);
});

test("a link pasted on a deliverable marks it posted, today", () => {
  const now = new Date("2026-10-07T08:00:00Z");
  const r = parseDeliverableFields({ url: "https://www.instagram.com/reel/abc" }, now);
  assert.deepEqual(r, { ok: true, value: { url: "https://www.instagram.com/reel/abc", status: "posted", posted_at: now.toISOString() } });
  assert.equal(parseDeliverableFields({ url: "instagram.com/reel/abc" }, now).ok, false);
});

test("insight numbers are whole, non-negative and dated", () => {
  const now = new Date("2026-10-07T08:00:00Z");
  const r = parseDeliverableFields({ views: "12,400", saves: 310 }, now);
  assert.deepEqual(r, { ok: true, value: { views: 12400, saves: 310, metrics_at: now.toISOString() } });
  assert.equal(parseDeliverableFields({ likes: -1 }, now).ok, false);
});

test("overdue means pending past its date", () => {
  assert.equal(isOverdue({ status: "pending", due_on: "2026-10-06" }, "2026-10-07"), true);
  assert.equal(isOverdue({ status: "pending", due_on: "2026-10-07" }, "2026-10-07"), false);
  assert.equal(isOverdue({ status: "posted", due_on: "2026-10-01" }, "2026-10-07"), false);
  assert.equal(isOverdue({ status: "pending", due_on: null }, "2026-10-07"), false);
});
