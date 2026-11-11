import test from "node:test";
import assert from "node:assert/strict";
import { INK_DESIGNS, inkImage } from "./ink-collection";

test("Ink launch preserves all twenty-one founder-named places, including Spain and Barcelona separately", () => {
  assert.deepEqual(INK_DESIGNS.map(d => d.place), [
    "Venice", "Amalfi", "Sorrento", "Spain", "Barcelona", "Vietnam", "Delhi", "Bombay",
    "Bangalore", "Hyderabad", "Pune", "Calcutta", "Ahmedabad", "London", "Singapore", "Shanghai", "Manila", "Chennai", "Jodhpur", "Bangkok", "Rome",
  ]);
  assert.equal(new Set(INK_DESIGNS.map(d => d.slug)).size, 21);
  for (const design of INK_DESIGNS) {
    assert.equal(design.settings.length, 3, design.place);
    assert.equal(new Set(design.settings).size, 3, design.place);
    assert.ok(!design.settings.some(s => /primary bedroom|primary room/i.test(s)));
    assert.notEqual(inkImage(design.slug, "flat"), inkImage(design.slug, 1));
  }
});
