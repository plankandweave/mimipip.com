import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOG_ONLY_EVENTS, TASTE_WEIGHTS } from "@/lib/taste";

// Saving a design must cost the shopper one tap and nothing else.
//
// It used to cost an email verification: the heart called useAuthGate(), which
// put a "verify your email" modal in front of the first save on the theory that
// a save is where an anonymous browser becomes a lead. In the two months to
// 26 September 2026 the shop recorded 6,231 design views and 10 saves — 0.16% —
// and the wall collected no addresses either, because nobody fetches a code out
// of their inbox to bookmark a picture thirty seconds into browsing. Worse, the
// refusal was invisible: the only event fired AFTER verification, so the funnel
// showed "0 saves" whether the heart was ignored or pressed and abandoned.
//
// The ask moved rather than vanished — SaveKeeper invites the customer to keep
// their list once it holds a few designs, and the wishlist page asks outright.
// A gate belongs in front of something that costs US money to run (the room
// visualiser, the AI features); a shopper's own shortlist is not that. Putting
// one back here is the regression this file exists to catch.
const BUTTON = readFileSync("src/components/WishlistButton.tsx", "utf8");

test("the heart does not ask anyone to sign in before it will save", () => {
  assert.ok(
    !/useAuthGate|AuthGate/.test(BUTTON),
    "WishlistButton imports the auth gate again — saving must not require an account",
  );
  assert.ok(
    !/\bgate\s*\(/.test(BUTTON),
    "WishlistButton wraps its save in gate() again — the first tap must save",
  );
  assert.ok(
    !/AuthModal/.test(BUTTON),
    "WishlistButton opens a sign-in modal again — the ask belongs in SaveKeeper",
  );
});

test("the heart still records the save, signed in or not", () => {
  assert.ok(
    /toggleWishlist\(handle\)/.test(BUTTON),
    "the heart no longer writes to the saved list",
  );
  assert.ok(
    /sendTasteSignal\(handle, "save"\)/.test(BUTTON),
    "the heart no longer logs the save — a save we cannot count is how this went unnoticed for two months",
  );
});

// The two funnel events measure OUR ask, not the shopper's opinion of a design.
// Give either of them a taste weight and every invitation would drag the
// personalisation model toward whatever happened to be on screen at the time.
test("funnel-only events can never move the taste vector", () => {
  for (const name of LOG_ONLY_EVENTS) {
    assert.equal(
      TASTE_WEIGHTS[name],
      undefined,
      `${name} has a taste weight — it must be logged only, never blended`,
    );
  }
  assert.ok(LOG_ONLY_EVENTS.has("save_prompt"));
  assert.ok(LOG_ONLY_EVENTS.has("save_identify"));
});
