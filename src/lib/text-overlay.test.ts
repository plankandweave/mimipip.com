import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultTextOverlay, textOverlaySchema, overlayPlacementError, clampOverlayPosition } from "./text-overlay";

test("safe print area uses physical clearance and prevents doorway overlap", () => {
  const o = { ...defaultTextOverlay("cloud"), text: "Aarav", x: .3, y: .2, width: .3 };
  assert.equal(overlayPlacementError(o, 300, 240), null);
  assert.match(overlayPlacementError({ ...o, x: 0 }, 300, 240)!, /2 cm/);
  assert.match(overlayPlacementError(o, 300, 240, [{ offsetCm: 100, widthCm: 80, heightCm: 220 }])!, /door/);
  const moved = clampOverlayPosition(o, 99, -99, 300, 240);
  assert.equal(overlayPlacementError(moved, 300, 240), null);
});
test("name and quote contracts reject invisible, missing, unknown and overflowing content", () => {
  const o = { ...defaultTextOverlay("cloud"), text: "Aarav" };
  assert.equal(textOverlaySchema.safeParse(o).success, true);
  for (const patch of [{text:""}, {text:"a\u202eb"}, {text:"a\nb"}, {version:2}, {width:9}, {x:Infinity}, {text:"a".repeat(25)}]) {
    assert.equal(textOverlaySchema.safeParse({...o,...patch}).success, false);
  }
  const quote = {...defaultTextOverlay("quote"),text:"Create together.\nGrow together."};
  assert.equal(textOverlaySchema.safeParse(quote).success, true);
  assert.equal(textOverlaySchema.safeParse({...quote, text:"a\n".repeat(6)}).success, false);
});
test("a name and companion quote both require valid printable text and placement", () => {
  const companion = { ...defaultTextOverlay("quote"), text: "Dream big", y: .65 };
  const name = { ...defaultTextOverlay("cloud"), text: "Aarav", companion };
  assert.equal(textOverlaySchema.safeParse(name).success, true);
  assert.equal(textOverlaySchema.safeParse({ ...name, background: "none" }).success, true);
  assert.equal(textOverlaySchema.safeParse({ ...name, companion: { ...companion, text: "" } }).success, false);
  assert.equal(textOverlaySchema.safeParse({ ...name, companion: { ...companion, companion } }).success, false);
  assert.match(overlayPlacementError({ ...name, companion: { ...companion, y: .99 } }, 300, 240)!, /2 cm/);
});
