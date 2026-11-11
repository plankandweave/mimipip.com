// A collaboration code is personal and specific. The rows here are the cases
// that have to stay refused: the code typed by the wrong person, used on a
// design it does not cover, used twice, used after it lapsed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collabRefusalFor,
  emailHint,
  suggestCode,
  suggestSlug,
  SLUG_RE,
  CODE_RE,
  type CollabCodeRow,
} from "./collab-codes";

const row: CollabCodeRow = {
  id: "c1",
  slug: "priya-sharma",
  name: "Priya Sharma",
  email: "priya@example.com",
  status: "agreed",
  code: "ZYV-PRIYA-7K2Q",
  discount_pct: 100,
  max_value_inr: null,
  allowed_handles: null,
  free_shipping: true,
  code_expires_at: null,
  order_id: null,
  redeemed_at: null,
};

test("the creator herself, any design, is allowed", () => {
  assert.equal(collabRefusalFor(row, { email: "Priya@Example.com", cartHandles: ["wildflower-reverie"] }), null);
});

test("before an email is typed the code previews as valid — checkout re-checks", () => {
  assert.equal(collabRefusalFor(row, {}), null);
  assert.equal(collabRefusalFor(row, { email: null, cartHandles: null }), null);
});

test("someone else typing the creator's code is refused", () => {
  assert.equal(collabRefusalFor(row, { email: "stranger@example.com" }), "wrong_email");
});

test("a code limited to named designs refuses a cart carrying another", () => {
  const limited = { ...row, allowed_handles: ["wildflower-reverie", "Chateau-Village"] };
  assert.equal(collabRefusalFor(limited, { email: row.email, cartHandles: ["wildflower-reverie"] }), null);
  assert.equal(collabRefusalFor(limited, { email: row.email, cartHandles: ["chateau-village"] }), null, "handles compare case-insensitively");
  assert.equal(collabRefusalFor(limited, { email: row.email, cartHandles: ["wildflower-reverie", "ganesha-dawn"] }), "wrong_design");
});

test("an empty allowed list means any design", () => {
  assert.equal(collabRefusalFor({ ...row, allowed_handles: [] }, { email: row.email, cartHandles: ["anything"] }), null);
});

test("one use: a redeemed code is spent, whoever asks", () => {
  assert.equal(collabRefusalFor({ ...row, order_id: "o1" }, { email: row.email }), "already_redeemed");
  assert.equal(collabRefusalFor({ ...row, redeemed_at: "2026-10-01T00:00:00Z" }, { email: row.email }), "already_redeemed");
});

test("a lapsed code is expired; a cancelled collaboration is not allowed at all", () => {
  const now = new Date("2026-10-07T10:00:00Z");
  assert.equal(collabRefusalFor({ ...row, code_expires_at: "2026-10-07T09:59:59Z" }, { email: row.email }, now), "expired");
  assert.equal(collabRefusalFor({ ...row, code_expires_at: "2026-10-08T00:00:00Z" }, { email: row.email }, now), null);
  assert.equal(collabRefusalFor({ ...row, status: "cancelled" }, { email: row.email }, now), "not_allowed");
});

test("spent beats wrong email: a stranger learns nothing about whose code it was", () => {
  assert.equal(collabRefusalFor({ ...row, order_id: "o1" }, { email: "stranger@example.com" }), "already_redeemed");
});

test("the email hint shows the creator her address and nobody else", () => {
  assert.equal(emailHint("priya@example.com"), "p•••a@example.com");
  assert.equal(emailHint("ab@example.com"), "a@example.com");
  assert.equal(emailHint("nonsense"), "•••");
});

test("suggested codes and slugs fit the database's own checks", () => {
  const code = suggestCode("Priya Sharma", () => 0.5);
  assert.match(code, CODE_RE);
  assert.match(code, /^ZYV-PRIYA-[A-Z2-9]{4}$/);
  assert.match(suggestCode("  "), /^ZYV-CREATOR-/);
  assert.equal(suggestSlug("@priya.sharma_"), "priya-sharma");
  assert.match(suggestSlug("@priya.sharma_"), SLUG_RE);
  assert.match(suggestSlug("ab"), SLUG_RE);
  assert.match(suggestSlug("A very long creator handle that goes on and on and on forever"), SLUG_RE);
});
