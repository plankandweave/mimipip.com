// The word plate and the macro crop are pure geometry and pure SVG before
// Sharp touches them, so the rules can be checked without a container: the
// Devanagari name is set in the Devanagari face, the ground is a named mat
// (never an invented tint), and a macro window never leaves the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { plateSvg } from "./plate";
import { cropWindow } from "./image";
import { MAT_BY_COLLECTION, MATS, englishName, matFor } from "./mats";

test("a word plate sets the Devanagari in Noto and the English in Jakarta on the collection's mat", () => {
  const svg = plateSvg({ w: 1080, h: 1350, title: "Mayur", devanagari: "मयूर", meaning: "Peacock — beauty, grace and royalty.", kicker: "Katha", mat: MAT_BY_COLLECTION.Katha, bandUrl: "https://example/flat.png" });
  assert.match(svg, /font-family="Playfair Display, Noto Serif Devanagari"[^>]*>मयूर</);
  assert.match(svg, /font-family="Playfair Display, Noto Serif Devanagari" font-weight="600"[^>]*><tspan[^>]*>Mayur</);
  assert.match(svg, /KATHA</);
  assert.ok(svg.includes(`fill="${MATS.indigo.ground}"`), "Katha closes on the indigo mat");
  // A design band is reserved along the lower edge, with its hairline.
  assert.match(svg, /<rect x="0" y="1132" width="1080" height="2"/);
});

test("a launch plate is one big word on its mat", () => {
  const svg = plateSvg({ w: 1080, h: 1350, word: "TALK", title: "Describe your room and real designs come back.", mat: "rose" });
  assert.match(svg, /text-anchor="middle"[^>]*font-weight="600"[^>]*>TALK</);
  assert.ok(svg.includes(`fill="${MATS.rose.ground}"`));
});

test("every collection in the campaign has a named mat, and an unknown name falls back to ink", () => {
  for (const c of ["Katha", "Stallion Spirit", "TAASH", "Dwadasha", "Maharaja's Court"]) {
    assert.ok(MATS[MAT_BY_COLLECTION[c]], `${c} has no mat`);
  }
  assert.equal(matFor("no-such-mat").ground, MATS.ink.ground);
  assert.equal(matFor("#123456").ground, "#123456");
});

test("the English name drops the bracketed Devanagari", () => {
  assert.equal(englishName("Mayur (मयूर)"), "Mayur");
  assert.equal(englishName("Bisaat — Gehra"), "Bisaat — Gehra");
});

test("a macro window is the cover-fit window shrunk by the zoom, clamped inside the source", () => {
  // 4:5 canvas over a 3000×2000 source: cover-fit window is 1600×2000.
  const w = cropWindow(3000, 2000, 1080, 1350, { zoom: 2.4, x: 0.5, y: 0.45 });
  assert.equal(w.width, Math.round(1600 / 2.4));
  assert.equal(w.height, Math.round(2000 / 2.4));
  assert.ok(w.left >= 0 && w.left + w.width <= 3000);
  assert.ok(w.top >= 0 && w.top + w.height <= 2000);
  // A focal point at the edge is clamped, never a negative offset.
  const edge = cropWindow(3000, 2000, 1080, 1350, { zoom: 3, x: 0, y: 1 });
  assert.equal(edge.left, 0);
  assert.equal(edge.top, 2000 - edge.height);
  // zoom below 1 is treated as 1 — the whole cover window.
  const whole = cropWindow(3000, 2000, 1080, 1350, { zoom: 0.5 });
  assert.equal(whole.width, 1600);
});
