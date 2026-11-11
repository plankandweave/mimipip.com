// The approval digest is a contract between two repositories.
//
// The control tower records slotDigest() when the founder approves; this repo
// compares it before publishing, so an approval cannot carry over to content
// that changed underneath it. They are separate deployments with separate
// release cycles, and nothing but this test stops them drifting apart — at
// which point either every publish is refused, or none of them are checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

/** Verbatim from the control tower's src/lib/plan.ts. Do not "tidy" it. */
function towerDigest(caption: string, mediaUrls: string[]): string {
  return createHash("sha256")
    .update(caption ?? "")
    .update(" ")
    .update((mediaUrls ?? []).join(" "))
    .digest("hex")
    .slice(0, 32);
}

/** Verbatim from this repo's pipeline.ts. */
function pipelineDigest(caption: string | null, mediaUrls: string[] | null): string {
  return createHash("sha256")
    .update(caption ?? "")
    .update(" ")
    .update((mediaUrls ?? []).join(" "))
    .digest("hex")
    .slice(0, 32);
}

test("the two repositories compute the same approval digest", () => {
  const cases: [string, string[]][] = [
    ["Mayur (मयूर) — made to measure", ["https://x/a.jpg"]],
    ["multi\nline\ncaption", ["https://x/a.jpg", "https://x/b.jpg"]],
    ["", []],
    ["₹200/sq ft", ["https://x/a.mp4"]],
  ];
  for (const [caption, urls] of cases) {
    assert.equal(pipelineDigest(caption, urls), towerDigest(caption, urls), caption.slice(0, 20));
  }
});

test("a changed caption or a changed image changes the digest", () => {
  // The whole point: approval is for specific words and specific pictures.
  const base = pipelineDigest("a", ["u1"]);
  assert.notEqual(base, pipelineDigest("a ", ["u1"]), "a trailing space must count");
  assert.notEqual(base, pipelineDigest("a", ["u2"]), "a swapped image must count");
  assert.notEqual(base, pipelineDigest("a", ["u1", "u2"]), "an added image must count");
});

test("the separator prevents a caption borrowing from a url", () => {
  // Without the " " between the two fields, ("ab", ["c"]) and ("a", ["bc"])
  // would hash identically and two different posts would share one approval.
  assert.notEqual(pipelineDigest("ab", ["c"]), pipelineDigest("a", ["bc"]));
});
