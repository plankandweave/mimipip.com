import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPromotablePage } from "./meta";

// 6 October 2026: the first Meta launch stopped on "META_PAGE_ID not set".
// The Page is now looked up from the ad account — and must never be guessed.
test("one promotable Page is used as is", () => {
  assert.deepEqual(pickPromotablePage([{ id: "1", name: "Zyvorah" }]), { id: "1", name: "Zyvorah" });
});

test("several Pages narrow to the one named Zyvorah", () => {
  const r = pickPromotablePage([{ id: "1", name: "Rvvardé" }, { id: "2", name: "Zyvorah Wallpapers" }, { id: "3", name: "Plank & Weave" }]);
  assert.equal(r.id, "2");
});

test("ambiguous or empty is refused, never guessed", () => {
  assert.equal(pickPromotablePage([{ id: "1", name: "Rvvardé" }, { id: "3", name: "Plank & Weave" }]).id, undefined);
  assert.match(pickPromotablePage([{ id: "1", name: "Rvvardé" }, { id: "3", name: "Plank & Weave" }]).error ?? "", /Rvvardé, Plank & Weave/);
  assert.equal(pickPromotablePage([]).id, undefined);
});
