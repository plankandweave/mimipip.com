// The mail that stands between "a client captured a tower" and "nobody here
// noticed for a week". Read on a phone, in a list, next to forty other things —
// so the subject line carries the whole message or the mail has failed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeDigest, type AlertItem } from "./portfolio-alert";

const SITE = "https://zyvorah.com";

const item = (over: Partial<AlertItem> = {}): AlertItem => ({
  kind: "walls",
  subjectId: "s1",
  accountName: "Knowledge Realty Trust",
  where: "One BKC · Level 12 · Lift lobby",
  detail: "6 walls",
  ...over,
});

test("nothing to say sends nothing at all", () => {
  // A sweep that mails "nothing happened" every fifteen minutes trains the
  // reader to ignore it, and the one that matters lands in a folder nobody opens.
  assert.equal(composeDigest([], SITE), null);
});

test("a single event puts the whole story in the subject", () => {
  const d = composeDigest([item()], SITE)!;
  assert.ok(d.subject.includes("Knowledge Realty Trust"), d.subject);
  assert.ok(d.subject.includes("6 walls"), d.subject);
});

test("what we owe a client outranks what a client has given us", () => {
  const d = composeDigest([
    item({ kind: "walls", subjectId: "a" }),
    item({ kind: "walkthrough", subjectId: "b", detail: "2 minutes, 4 walls marked" }),
    item({ kind: "waiting_library", subjectId: "c", detail: "12 walls captured and their library is still empty" }),
    item({ kind: "approved", subjectId: "d", detail: "Jodi on Facing the entrance" }),
  ], SITE)!;

  // Waiting-on-us is the one that is losing patience, so it leads the subject…
  assert.ok(/waiting on us/i.test(d.subject), d.subject);
  // …and appears before the others in the body. Compared on phrases unique to
  // each line: the waiting line legitimately contains the word "captured" too,
  // so a naive substring search finds the wrong occurrence and passes for the
  // wrong reason.
  const order = (needle: string) => {
    const at = d.text.indexOf(needle);
    assert.notEqual(at, -1, `"${needle}" is missing from the mail`);
    return at;
  };
  assert.ok(order("are waiting on us") < order("approved a design"), "waiting must come first");
  assert.ok(order("approved a design") < order("captured 6 walls"), "a decision outranks new work");
  assert.ok(order("recorded a walkthrough") < order("captured 6 walls"), "a walk outranks a wall count");
});

test("every line says where, because a count alone is not actionable", () => {
  const d = composeDigest([
    item({ subjectId: "a", where: "One BKC · Level 12 · Lift lobby" }),
    item({ subjectId: "b", where: "One BKC · Ground · Main arrival", detail: "3 walls" }),
  ], SITE)!;
  assert.ok(d.text.includes("Level 12 · Lift lobby"));
  assert.ok(d.text.includes("Ground · Main arrival"));
  assert.ok(d.html.includes("Ground · Main arrival"));
});

test("several clients are counted as clients, one client is named", () => {
  const one = composeDigest([item({ subjectId: "a" }), item({ subjectId: "b" })], SITE)!;
  assert.ok(one.subject.includes("Knowledge Realty Trust"), one.subject);

  const many = composeDigest([
    item({ subjectId: "a" }),
    item({ subjectId: "b", accountName: "Vijay Sales" }),
  ], SITE)!;
  assert.ok(/2 clients/.test(many.subject), many.subject);
});

test("the mail carries a way in", () => {
  const d = composeDigest([item()], SITE)!;
  assert.ok(d.html.includes(SITE));
  assert.ok(d.text.includes(SITE));
});

test("a client's own words cannot break the markup", () => {
  // Account and space names are typed by the client. An unescaped one would
  // either break the mail or smuggle markup into our inbox.
  const d = composeDigest([item({
    accountName: '<script>alert(1)</script>',
    where: 'One "BKC" & <b>Level 12</b>',
  })], SITE)!;
  assert.ok(!d.html.includes("<script>"), "raw script tag reached the HTML");
  assert.ok(d.html.includes("&lt;script&gt;"));
  assert.ok(d.html.includes("&amp;"));
});
