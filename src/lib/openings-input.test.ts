import assert from "node:assert/strict";
import { test } from "node:test";
import { openingQualifies, parseOpenings } from "./openings-input";

test("a window carries its sill through in centimetres", () => {
  const r = parseOpenings([{ widthMm: 1200, heightMm: 1200, offsetMm: 800, sillMm: 900 }], 4000, 2700);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.doors, [{ widthCm: 120, heightCm: 120, offsetCm: 80, sillCm: 90 }]);
  assert.equal(openingQualifies(r.doors[0], 270), false);
});

test("a door carries no sill and still qualifies", () => {
  const r = parseOpenings([{ widthMm: 900, heightMm: 2100, offsetMm: 0 }], 4000, 2700);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.doors, [{ widthCm: 90, heightCm: 210, offsetCm: 0 }]);
  assert.equal(openingQualifies(r.doors[0], 270), true);
});

test("a window reaching above the wall's top is a survey error", () => {
  const r = parseOpenings([{ widthMm: 1200, heightMm: 1200, offsetMm: 800, sillMm: 1600 }], 4000, 2700);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /above the top of the wall/);
});

test("a sill below the floor is refused", () => {
  const r = parseOpenings([{ widthMm: 1200, heightMm: 1200, offsetMm: 800, sillMm: -5 }], 4000, 2700);
  assert.equal(r.ok, false);
});
