import { strict as assert } from "node:assert";
import { test } from "node:test";
import { preparedHtml } from "./crm-prepared";

const stored = { subject: "A winter world", body: "Hello,\n\nThe letter.", html: "<p>The letter, with pictures</p>" };

test("an untouched prepared email goes as its stored HTML", () => {
  assert.equal(preparedHtml(stored, { subject: "A winter world", body: "Hello,\n\nThe letter.\n" }), stored.html);
});

test("editing the words sends what was written, not the stale HTML", () => {
  assert.equal(preparedHtml(stored, { subject: "A winter world", body: "Hello,\n\nA changed letter." }), null);
  assert.equal(preparedHtml(stored, { subject: "A new subject", body: stored.body }), null);
});

test("a drafter email without HTML falls back to plain text", () => {
  assert.equal(preparedHtml({ subject: "s", body: "b" }, { subject: "s", body: "b" }), null);
  assert.equal(preparedHtml(undefined, { subject: "s", body: "b" }), null);
});
