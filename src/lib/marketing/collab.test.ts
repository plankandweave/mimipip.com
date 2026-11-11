// TAASH is a collaboration, and every Taash post must tag and collab those
// accounts (founder, 26–27 September 2026). The first version read an
// environment variable nobody set, so it silently did nothing: "Marketing
// collab, I don't see it run."
//
//   npx tsx --test src/lib/marketing/collab.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { withMentions } from "./pipeline";

const CAPTION = "Jodi. A heart and a spade sit together in red.\n\nMade to measure · zyvorah.com";

test("a collaborated post names the accounts in its own caption", () => {
  const out = withMentions(CAPTION, ["stylemati", "fatimakpunjaabi"]);
  assert.match(out, /@stylemati/);
  assert.match(out, /@fatimakpunjaabi/);
  // The original copy survives intact — the mention is added, not a rewrite.
  assert.ok(out.startsWith("Jodi. A heart and a spade"));
});

test("a caption that already names them is left alone", () => {
  const already = `${CAPTION}\n\nWith @stylemati and @fatimakpunjaabi.`;
  assert.equal(withMentions(already, ["stylemati", "fatimakpunjaabi"]), already);
});

test("only the missing account is added, never a duplicate", () => {
  const partial = `${CAPTION}\n\nWith @stylemati.`;
  const out = withMentions(partial, ["stylemati", "fatimakpunjaabi"]);
  assert.equal((out.match(/@stylemati/g) ?? []).length, 1, "stylemati was mentioned twice");
  assert.match(out, /@fatimakpunjaabi/);
});

test("a collection with no partner is untouched", () => {
  assert.equal(withMentions(CAPTION, []), CAPTION);
});
