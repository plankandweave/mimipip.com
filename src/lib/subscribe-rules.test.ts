import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { isSuppressed, mayAutoSubscribe, normaliseEmail } from "./subscribe-rules";
import { SUBSCRIBE_DISCLOSURE } from "./subscribe-disclosure";

// Everyone who gives us an email is subscribed by default (founder, 6 Oct
// 2026) — but never someone who unsubscribed, bounced or is in DoNotContact.

test("a fresh, valid address is subscribed", () => {
  assert.equal(mayAutoSubscribe("Asha@Example.com ", null), true);
  assert.equal(normaliseEmail(" Asha@Example.com "), "asha@example.com");
});

test("an invalid address is never subscribed", () => {
  for (const bad of ["", "asha", "asha@", "a b@c.de", null, 42]) assert.equal(mayAutoSubscribe(bad, null), false);
});

test("never re-subscribes someone who unsubscribed", () => {
  assert.equal(mayAutoSubscribe("a@b.co", { unsubscribedAt: "2026-09-01T00:00:00Z" }), false);
});

test("never re-subscribes a bounced address", () => {
  assert.equal(mayAutoSubscribe("a@b.co", { bouncedAt: new Date() }), false);
});

test("never subscribes anyone in DoNotContact", () => {
  assert.equal(mayAutoSubscribe("a@b.co", { doNotContact: true }), false);
  assert.equal(mayAutoSubscribe("a@b.co", { tradeSuppressed: true }), false);
  assert.equal(isSuppressed({}), false);
});

// The database is the enforcement. Pin the migration that defines it.
const migration = readFileSync(
  "supabase/migrations/20261006090000_newsletter_autosubscribe_concierge_gate.sql",
  "utf8",
);
const fn = (name: string) => {
  const start = migration.indexOf(`function public.${name}(`);
  assert.ok(start > 0, `${name} is defined`);
  return migration.slice(start, migration.indexOf("$$;", migration.indexOf("$$", start) + 2));
};

test("email_suppressed covers unsubscribed, bounced, DoNotContact and trade opt-outs", () => {
  const body = fn("email_suppressed");
  assert.match(body, /unsubscribed_at is not null/);
  assert.match(body, /email_bounced_at is not null/);
  assert.match(body, /"DoNotContact"/);
  assert.match(body, /email_unsubscribed_at is not null/);
});

test("auto_subscribe checks suppression before it turns marketing on, and never clears an unsubscribe", () => {
  const body = fn("auto_subscribe");
  const check = body.indexOf("email_suppressed(v_email)");
  const optIn = body.indexOf("marketing_opt_in = true");
  assert.ok(check > 0 && optIn > check);
  assert.doesNotMatch(body, /unsubscribed_at\s*=\s*null/);
});

test("no subscribe path in this migration clears unsubscribed_at", () => {
  for (const name of ["subscribe_newsletter", "enrol_verified_email", "save_customer_email", "save_customer_phone", "concierge_register_session"]) {
    assert.doesNotMatch(fn(name), /unsubscribed_at\s*=\s*null/, name);
  }
});

test("the weekly letter skips DoNotContact", () => {
  assert.match(fn("newsletter_recipients"), /"DoNotContact"/);
});

test("no later migration reintroduces a subscribe that clears unsubscribed_at", () => {
  const later = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql") && f > "20261006090000");
  for (const f of later) {
    const sql = readFileSync(`supabase/migrations/${f}`, "utf8");
    assert.doesNotMatch(sql, /unsubscribed_at\s*=\s*null/, f);
  }
});

test("the disclosure is the approved wording, word for word", () => {
  assert.equal(
    SUBSCRIBE_DISCLOSURE,
    "By continuing, you agree to receive updates and new collections from Zyvorah. Unsubscribe anytime.",
  );
});

// Every surface that takes an email shows the line under its button.
const SURFACES = [
  "src/components/AuthModal.tsx",
  "src/components/Concierge.tsx",
  "src/app/checkout/page.tsx",
  "src/components/NewsletterForm.tsx",
  "src/components/OrderSample.tsx",
  "src/components/ContactForm.tsx",
  "src/components/EnquiryForm.tsx",
  "src/components/CartContactCapture.tsx",
  "src/app/gift-card/page.tsx",
];
for (const f of SURFACES) {
  test(`${f} shows the subscribe line`, () => {
    assert.match(readFileSync(f, "utf8"), /<SubscribeDisclosure\b/);
  });
}

test("the sign-in modal no longer offers a marketing tick box", () => {
  const src = readFileSync("src/components/AuthModal.tsx", "utf8");
  assert.doesNotMatch(src, /setMarketing/);
});

test("the privacy policy explains the newsletter and that transactional emails are separate", () => {
  const src = readFileSync("src/app/privacy/page.tsx", "utf8");
  assert.match(src, /id="newsletter"/);
  assert.match(src, /concierge/);
  assert.match(src, /Transactional emails are separate/);
});
