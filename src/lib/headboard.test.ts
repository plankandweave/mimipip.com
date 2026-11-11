import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dragOffsetCm,
  HEADBOARD_DEFAULT_HEIGHT_CM,
  HEADBOARD_DEFAULT_WIDTH_CM,
  isFloorAnchored,
  newHeadboard,
  openingsForEngine,
  placeHeadboard,
  placeMarks,
  planOpenings,
  type Door,
} from "./openings";
import { areaSqFt, billedSqFt } from "./pricing";

const FT = 30.48;
const WALL = { runWidthCm: 12 * FT, wallHeightCm: 9 * FT, panelCm: 120, overlapCm: 2 };

test("a new headboard sits on the floor, centred, at a bed's size", () => {
  const h = newHeadboard(WALL.runWidthCm, WALL.wallHeightCm);
  assert.equal(h.kind, "headboard");
  assert.equal(h.sillCm, undefined);
  assert.ok(isFloorAnchored(h));
  assert.equal(h.widthCm, HEADBOARD_DEFAULT_WIDTH_CM);
  assert.equal(h.heightCm, HEADBOARD_DEFAULT_HEIGHT_CM);
  assert.ok(Math.abs(h.offsetCm + h.widthCm / 2 - WALL.runWidthCm / 2) < 1e-9);
});

test("on a wall narrower than a bed the headboard shrinks to the wall", () => {
  const h = newHeadboard(4 * FT, 8 * FT);
  assert.equal(h.widthCm, 4 * FT);
  assert.equal(h.offsetCm, 0);
});

test("a headboard can never float — a sill is dropped", () => {
  const [h] = placeMarks([{ widthCm: 150, heightCm: 100, offsetCm: 50, sillCm: 40, kind: "headboard" } as Door], 400, 270);
  assert.equal(h.sillCm, undefined);
  assert.ok(isFloorAnchored(h));
});

test("placeMarks leaves doors and windows exactly as they were", () => {
  const window: Door = { widthCm: 120, heightCm: 120, offsetCm: 900, sillCm: 90 };
  assert.deepEqual(placeMarks([window], 400, 270), [window]);
});

test("a headboard is clamped inside the wall on every side", () => {
  assert.deepEqual(placeHeadboard({ widthCm: 150, heightCm: 100, offsetCm: -30, kind: "headboard" }, 400, 270).offsetCm, 0);
  assert.deepEqual(placeHeadboard({ widthCm: 150, heightCm: 100, offsetCm: 380, kind: "headboard" }, 400, 270).offsetCm, 250);
  const big = placeHeadboard({ widthCm: 900, heightCm: 900, offsetCm: 10, kind: "headboard" }, 400, 270);
  assert.deepEqual([big.widthCm, big.heightCm, big.offsetCm], [400, 270, 0]);
});

test("dragging moves the distance from the left and stops at the walls", () => {
  // Preview drawn at 2 px per cm: 100 px right is 50 cm.
  assert.equal(dragOffsetCm(100, 100, 2, 150, 400), 150);
  assert.equal(dragOffsetCm(100, -1000, 2, 150, 400), 0);
  assert.equal(dragOffsetCm(100, 1000, 2, 150, 400), 250);
  assert.equal(dragOffsetCm(100, 50, 0, 150, 400), 100); // preview not laid out yet
});

test("distance from the left round-trips through the feet input", () => {
  const typedFt = 3.4;
  const h = placeHeadboard({ ...newHeadboard(WALL.runWidthCm, WALL.wallHeightCm), offsetCm: typedFt * FT }, WALL.runWidthCm, WALL.wallHeightCm);
  assert.equal(Number((h.offsetCm / FT).toFixed(1)), typedFt);
  // …and a drag lands back in the same box the input reads from.
  const dragged = dragOffsetCm(h.offsetCm, 61, 2, h.widthCm, WALL.runWidthCm);
  assert.equal(Number((dragged / FT).toFixed(1)), 4.4);
});

test("a bed-height headboard is a planning mark: full area printed and priced, like a short door", () => {
  const h = newHeadboard(WALL.runWidthCm, WALL.wallHeightCm);
  const plan = planOpenings({ ...WALL, doors: [h] });
  assert.deepEqual(plan.qualifyingDoors, []);
  assert.equal(plan.excludedSqft, 0);
  assert.equal(plan.chargeableSqft, areaSqFt(WALL.runWidthCm, WALL.wallHeightCm));
  assert.equal(billedSqFt(WALL.runWidthCm, WALL.wallHeightCm, plan.chargeableSqft), billedSqFt(WALL.runWidthCm, WALL.wallHeightCm));
  assert.deepEqual(openingsForEngine(plan, [h]), []);
});

test("a headboard is priced exactly as a door of the same size and place", () => {
  const tall = { widthCm: 180, heightCm: 0.8 * WALL.wallHeightCm, offsetCm: 100 };
  const asDoor = planOpenings({ ...WALL, doors: [tall] });
  const asHeadboard = planOpenings({ ...WALL, doors: [{ ...tall, kind: "headboard" }] });
  assert.deepEqual(asHeadboard, asDoor);
  assert.ok(asHeadboard.excludedSqft > 0);
  assert.equal(
    billedSqFt(WALL.runWidthCm, WALL.wallHeightCm, asHeadboard.chargeableSqft),
    billedSqFt(WALL.runWidthCm, WALL.wallHeightCm, asDoor.chargeableSqft),
  );
  // and it reaches the print engine on the floor, like a door
  assert.deepEqual(openingsForEngine(asHeadboard, [{ ...tall, kind: "headboard" }]), [
    { xMm: 1000, yMm: 0, widthMm: 1800, heightMm: Math.round(tall.heightCm * 10) },
  ]);
});

test("a configuration stored before headboards existed plans unchanged", () => {
  const legacy = [{ widthCm: 90, heightCm: 210, offsetCm: 150 }];
  assert.deepEqual(placeMarks(legacy, 400, 270), legacy);
  assert.deepEqual(planOpenings({ ...WALL, doors: placeMarks(legacy, WALL.runWidthCm, WALL.wallHeightCm) }), planOpenings({ ...WALL, doors: legacy }));
  assert.deepEqual(placeMarks([], 400, 270), []);
});
