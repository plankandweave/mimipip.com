import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canContinueTour,
  nextTourPage,
  tourCardPosition,
  tourSteps,
  tourStorageKey,
  type TourIdentity,
} from "./partner-tour";
const designer: TourIdentity = {
  memberKey: "member-1",
  canBuild: true,
  canPurchase: false,
  isAdmin: false,
};
const purchaser: TourIdentity = {
  ...designer,
  canBuild: false,
  canPurchase: true,
};
const admin: TourIdentity = { ...designer, isAdmin: true };
test("designer and purchaser tours expose their independent controls", () => {
  const designerSteps = tourSteps("projects", designer),
    purchaseSteps = tourSteps("projects", purchaser);
  assert.ok(
    designerSteps.some((s) => s.target === '[data-portal-tour="save"]'),
  );
  assert.ok(!designerSteps.some((s) => s.target === '[data-portal-tour="po"]'));
  assert.ok(purchaseSteps.some((s) => s.target === '[data-portal-tour="po"]'));
  assert.ok(
    !purchaseSteps.some((s) => s.target === '[data-portal-tour="save"]'),
  );
  assert.ok(
    !tourSteps("projects", admin).some(
      (s) => s.target === '[data-portal-tour="po"]',
    ),
  );
  assert.ok(
    tourSteps("team", admin).some(
      (s) => s.target === '[data-portal-tour="invite"]',
    ),
  );
  assert.ok(
    !tourSteps("team", purchaser).some(
      (s) => s.target === '[data-portal-tour="invite"]',
    ),
  );
});
test("absent conditional controls have a real section fallback and reader navigation remains usable", () => {
  const targets = [
    '[data-portal-tour="wall"]',
    '[aria-label="zoom"]',
    '[data-portal-tour="save"]',
    '[data-portal-tour="po"]',
  ];
  for (const target of targets)
    assert.ok(
      tourSteps("projects", { ...admin, canPurchase: true }).find(
        (s) => s.target === target,
      )?.fallback,
    );
  const reader = { ...designer, canBuild: false };
  assert.equal(tourSteps("projects", reader).length, 3);
  assert.ok(
    tourSteps("documents", reader).some(
      (s) => s.target === '[data-portal-tour="download"]',
    ),
  );
});
test("completion and continuation keys separate accounts, members, effective roles and version", () => {
  const base = tourStorageKey("homelane", designer);
  assert.match(base, /:v1$/);
  assert.notEqual(base, tourStorageKey("other", designer));
  assert.notEqual(
    base,
    tourStorageKey("homelane", { ...designer, memberKey: "member-2" }),
  );
  assert.notEqual(base, tourStorageKey("homelane", purchaser));
  assert.notEqual(base, tourStorageKey("homelane", admin));
  assert.equal(nextTourPage("projects", designer), "documents");
  assert.equal(nextTourPage("projects", admin), "team");
  assert.equal(nextTourPage("team", admin), "documents");
  assert.equal(nextTourPage("documents", admin), null);
});
test("cross-page continuation rejects malformed, expired, future and different-page state", () => {
  const now = 1000000;
  assert.ok(
    canContinueTour(
      JSON.stringify({ page: "team", at: now - 100 }),
      "team",
      now,
    ),
  );
  for (const raw of [
    null,
    "{bad",
    JSON.stringify({ page: "documents", at: now }),
    JSON.stringify({ page: "team", at: now - 120000 }),
    JSON.stringify({ page: "team", at: now + 1 }),
    JSON.stringify({ page: "team", at: "1000000" }),
  ])
    assert.equal(canContinueTour(raw, "team", now), false);
});
test("tour card stays within phone and desktop viewport edges", () => {
  for (const viewport of [
    { width: 375, height: 700 },
    { width: 1440, height: 900 },
  ])
    for (const target of [
      null,
      { left: -200, top: -80, width: 800, height: 100 },
      { left: 1400, top: 880, width: 100, height: 300 },
    ]) {
      const card = tourCardPosition(target, viewport, 280);
      assert.ok(card.left >= 12);
      assert.ok(card.top >= 12);
      assert.ok(card.left + card.width <= viewport.width - 12);
      assert.ok(card.top + 280 <= viewport.height - 12);
    }
});
