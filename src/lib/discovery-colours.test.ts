import { test } from "node:test";
import assert from "node:assert/strict";
import { discoveryColours } from "./discovery-colours";

test("palette-only classifications cannot strand a design outside named colour pages", () => {
  assert.throws(() => discoveryColours(["Pastel", "Bright", "Bicolor"]), /named artwork colour/);
  assert.throws(() => discoveryColours([]), /named artwork colour/);
});

test("a late named colour survives modifiers and truncation", () => {
  assert.deepEqual(discoveryColours(["Pastel", "Bright", "Bicolor", "Blue And White", "Blue", "White", "Blue"]),
    ["Blue", "White", "Pastel", "Bright"]);
});
