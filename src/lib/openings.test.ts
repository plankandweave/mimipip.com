import assert from "node:assert/strict";
import { test } from "node:test";
import { isFloorAnchored, openingsForEngine, planOpenings } from "./openings";

const WALL = { runWidthCm: 400, wallHeightCm: 270, panelCm: 120, overlapCm: 2 };

test("a floor-anchored door big enough to qualify comes off the print", () => {
  const plan = planOpenings({ ...WALL, doors: [{ widthCm: 90, heightCm: 210, offsetCm: 150 }] });
  assert.deepEqual(plan.qualifyingDoors, [0]);
  assert.ok(plan.excludedSqft > 0);
});

test("the same opening lifted off the floor is a window and never qualifies", () => {
  const plan = planOpenings({ ...WALL, doors: [{ widthCm: 90, heightCm: 210, offsetCm: 150, sillCm: 30 }] });
  assert.deepEqual(plan.qualifyingDoors, []);
  assert.deepEqual(plan.disqualifiedDoors, []);
  assert.equal(plan.excludedSqft, 0);
  assert.deepEqual(openingsForEngine(plan, [{ widthCm: 90, heightCm: 210, offsetCm: 150, sillCm: 30 }]), []);
});

test("a sill of zero (a French window) is a door", () => {
  assert.equal(isFloorAnchored({ sillCm: 0 }), true);
  assert.equal(isFloorAnchored({}), true);
  assert.equal(isFloorAnchored({ sillCm: 90 }), false);
});
