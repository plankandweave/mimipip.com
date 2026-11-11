import { test } from "node:test";
import assert from "node:assert/strict";
import { eligibleShortlist, parseShortlistHandles, SHORTLIST_MAX } from "@/lib/partner-shortlist";

// Design Cafe's strip (15 October 2026): three liked designs, shown in the
// order staff stored them, and a stale handle never breaks the strip.

const ok = (handle: string, extra: Record<string, unknown> = {}) => ({
  handle, status: "active", category: "wallpaper", flat_verified: true, is_service: false, price_tier: "standard", ...extra,
});

test("parseShortlistHandles keeps order, drops junk and duplicates", () => {
  assert.deepEqual(
    parseShortlistHandles(["aa-0070", " Natural-Weave-III ", 7, null, "aa-0070", "bad handle", "", "tex-0016"]),
    ["aa-0070", "natural-weave-iii", "tex-0016"],
  );
});

test("parseShortlistHandles treats a missing column or non-array as empty", () => {
  assert.deepEqual(parseShortlistHandles(undefined), []);
  assert.deepEqual(parseShortlistHandles(null), []);
  assert.deepEqual(parseShortlistHandles({ a: 1 }), []);
  assert.deepEqual(parseShortlistHandles("aa-0070"), []);
});

test("parseShortlistHandles caps the list", () => {
  const many = Array.from({ length: SHORTLIST_MAX + 5 }, (_, i) => `d-${i}`);
  assert.equal(parseShortlistHandles(many).length, SHORTLIST_MAX);
});

test("eligibleShortlist shows the stored order, not the database's", () => {
  const products = [ok("tex-0016"), ok("aa-0070"), ok("natural-weave-iii")];
  assert.deepEqual(
    eligibleShortlist(["aa-0070", "natural-weave-iii", "tex-0016"], products).map((p) => p.handle),
    ["aa-0070", "natural-weave-iii", "tex-0016"],
  );
});

test("eligibleShortlist drops stale handles silently", () => {
  const products = [
    ok("live"),
    ok("archived", { status: "archived" }),
    ok("canvas", { category: "canvas-art" }),
    ok("unverified", { flat_verified: false }),
    ok("unknown-flat", { flat_verified: null }),
    ok("service", { is_service: true }),
  ];
  assert.deepEqual(
    eligibleShortlist(["gone", "archived", "canvas", "unverified", "unknown-flat", "service", "live"], products)
      .map((p) => p.handle),
    ["live"],
  );
});

test("eligibleShortlist keeps exclusives out of an account blocked from them", () => {
  const products = [ok("std"), ok("auto", { price_tier: "autograph" })];
  assert.deepEqual(eligibleShortlist(["auto", "std"], products).map((p) => p.handle), ["auto", "std"]);
  assert.deepEqual(eligibleShortlist(["auto", "std"], products, { excludeExclusive: true }).map((p) => p.handle), ["std"]);
});
