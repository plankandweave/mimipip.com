// The approval rules. These decide whether something goes on Instagram under
// Roheena's name, so each refusal is asserted rather than assumed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canApprove, canRevise, type ReviewableRow } from "./approval";
import { slotDigest } from "./digest";

const row = (over: Partial<ReviewableRow> = {}): ReviewableRow => ({
  id: "r1",
  status: "queued",
  caption: "Mayur (मयूर) — made to measure, from ₹200/sq ft",
  media_urls: ["https://x/a.jpg", "https://x/b.jpg"],
  safety_passed: true,
  ...over,
});

const digestOf = (r: ReviewableRow) => slotDigest(r.caption, r.media_urls);

test("a reviewed, safety-passed post approves against its own digest", () => {
  const r = row();
  const d = canApprove(r, digestOf(r));
  assert.equal(d.ok, true);
  assert.equal(d.ok && d.digest, digestOf(r));
});

test("an approval signed against different content is refused", () => {
  // The caption was rewritten between the page rendering and the click.
  const shown = row();
  const now = row({ caption: shown.caption + " (edited)" });
  const d = canApprove(now, digestOf(shown));
  assert.equal(d.ok, false);
  assert.match(d.ok === false ? d.error : "", /changed since it was displayed/);
});

test("a swapped image is caught even when the caption is identical", () => {
  const shown = row();
  const now = row({ media_urls: ["https://x/a.jpg", "https://x/DIFFERENT.jpg"] });
  assert.equal(canApprove(now, digestOf(shown)).ok, false);
});

test("approving without sending a digest is refused, not defaulted", () => {
  // The failure mode this guards: a caller that omits the field and is treated
  // as "nothing to compare, so fine" — which is how a check stops checking.
  for (const bad of [undefined, null, "", 0, {}]) {
    const d = canApprove(row(), bad);
    assert.equal(d.ok, false, String(bad));
    assert.match(d.ok === false ? d.error : "", /refusing to sign unseen content/);
  }
});

test("the founder cannot wave through a post the safety gate blocked", () => {
  const r = row({ safety_passed: false });
  const d = canApprove(r, digestOf(r));
  assert.equal(d.ok, false);
  assert.match(d.ok === false ? d.error : "", /brand-safety gate/);
});

test("nothing already published can be approved, rejected or regenerated", () => {
  const r = row({ status: "published" });
  assert.equal(canApprove(r, digestOf(r)).ok, false);
  assert.equal(canRevise(r, "reject").ok, false);
  assert.equal(canRevise(r, "regenerate").ok, false);
  const rejected = canRevise(r, "reject");
  assert.match(rejected.ok === false ? rejected.error : "", /cannot be un-posted/);
});

test("a superseded row is not a live decision", () => {
  const r = row({ status: "superseded" });
  assert.equal(canApprove(r, digestOf(r)).ok, false);
  assert.equal(canRevise(r, "regenerate").ok, false);
});

test("reject and regenerate need no digest — they sign nothing", () => {
  assert.equal(canRevise(row(), "reject").ok, true);
  assert.equal(canRevise(row({ safety_passed: false }), "regenerate").ok, true);
});

test("a Story in a retired frame cannot be approved — it comes back redrawn, never as it was", () => {
  // 30 Sep 2026: Tulip Heritage was sent back for being in the old frame and
  // returned to the queue in that same frame. The old frame is refused at the
  // gate, so an approval can never put it on Instagram.
  const old = row({ format: "story", media_urls: ["https://zyvorah.com/media/marketing-media/stories/tulip-heritage/2026-10-13_52_ab12.jpg"] });
  const d = canApprove(old, digestOf(old));
  assert.equal(d.ok, false);
  assert.match(d.ok === false ? d.error : "", /old frame/);

  const current = row({ format: "story", media_urls: ["https://zyvorah.com/media/marketing-media/stories/house-v5/tulip-heritage/2026-10-13_52_cd34.jpg"] });
  assert.equal(canApprove(current, digestOf(current)).ok, true);
});
