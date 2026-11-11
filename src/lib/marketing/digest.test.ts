// The approval digest now has two implementations — one for the server, one for
// the browser, because the approval board signs in the browser what the founder
// is looking at. Two implementations of a security check is exactly the shape of
// bug that passes review and then quietly stops checking: if they disagree,
// every approval is refused at publish time, or (worse, if someone "fixes" it by
// dropping the comparison) none of them are checked at all.
//
// This also pins the refactor. pipeline.ts used to hash with three update()
// calls; digest.ts hashes one concatenated string. Those are byte-identical to
// SHA-256 — but "obviously equivalent" is how the tower and this repo would
// drift apart, so it is asserted rather than assumed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { slotDigest } from "./digest";
import { slotDigestWeb } from "./digest-web";

/** Verbatim from pipeline.ts before digest.ts existed. Do not "tidy" it. */
function legacyDigest(caption: string | null, mediaUrls: string[] | null): string {
  return createHash("sha256")
    .update(caption ?? "")
    .update(" ")
    .update((mediaUrls ?? []).join(" "))
    .digest("hex")
    .slice(0, 32);
}

const CASES: [string | null, string[] | null][] = [
  ["Mayur (मयूर) — made to measure", ["https://x/a.jpg"]],
  ["multi\nline\ncaption", ["https://x/a.jpg", "https://x/b.jpg"]],
  ["", []],
  [null, null],
  ["₹200/sq ft", ["https://x/a.mp4"]],
  ["emoji ✨ and a tab\t", ["https://x/a.jpg"]],
];

test("the extracted digest still equals the one publishing has always compared", () => {
  for (const [caption, urls] of CASES) {
    assert.equal(slotDigest(caption, urls), legacyDigest(caption, urls), String(caption).slice(0, 20));
  }
});

test("the browser digest equals the server digest", async () => {
  for (const [caption, urls] of CASES) {
    assert.equal(await slotDigestWeb(caption, urls), slotDigest(caption, urls), String(caption).slice(0, 20));
  }
});

test("a changed caption or a changed image changes both digests", async () => {
  // The whole point: an approval is for specific words and specific pictures.
  const base = slotDigest("a", ["u1"]);
  assert.notEqual(base, slotDigest("a ", ["u1"]), "a trailing space must count");
  assert.notEqual(base, slotDigest("a", ["u2"]), "a swapped image must count");
  assert.notEqual(base, slotDigest("a", ["u1", "u2"]), "an added image must count");
  assert.notEqual(base, await slotDigestWeb("a", ["u2"]), "and in the browser too");
});

test("the separator prevents a caption borrowing from a url", () => {
  assert.notEqual(slotDigest("ab", ["c"]), slotDigest("a", ["bc"]));
});
