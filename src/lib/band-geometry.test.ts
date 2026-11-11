// The composition rules a store's bands are built by, pinned so a composer
// refactor cannot quietly let a floor drift or a cut land on an appliance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { colourBoundaries, edgePaints, geometryIsCurrent, wholeSubjectWindow, holdsFloorLine, MAX_FLOOR_SCALE, cutOnPatch, fitToFloor, medianFloor, minSubjectsFor, safeCut, sameLanguage, standsInBand, standingOrAll, bandOutcome, panelBoundaries, wantsDenseComposition } from "./band-geometry";

test("the store floor is the median of its designs' floors", () => {
  assert.equal(medianFloor([0.80, 0.70, 0.90]), 0.80);
  assert.equal(medianFloor([0.80, 0.70]), 0.75);
  assert.equal(medianFloor([null, 0.82, undefined]), 0.82);
  assert.equal(medianFloor([null, undefined]), null);
});

test("a design whose floor sits higher than the band's is scaled so the floor lands on the line", () => {
  // Design floor at 70% of its height; store floor line at 80% of the band.
  const fit = fitToFloor({ w: 2000, h: 1000, floorY: 0.70 }, 0.80, 1000);
  // Needs 0.8/0.7 = 1.143× to reach the band's floor; the top overflows.
  assert.ok(fit.scaleUp > 1.14 && fit.scaleUp < 1.15);
  assert.equal(fit.height, 1143);
  // floor: 0.70 × 1143 = 800 from the design's top; band floor at 800 → top = 0.
  assert.equal(fit.top, 0);
  assert.equal(Math.round(0.70 * fit.height + fit.top), 800);
});

test("a design whose floor sits lower than the band's is scaled and cropped from the top", () => {
  const fit = fitToFloor({ w: 2000, h: 1000, floorY: 0.90 }, 0.80, 1000);
  // Below the floor: (1−0.8)/(1−0.9) = 2× needed so the band's bottom is covered.
  assert.equal(fit.scaleUp, 2);
  assert.equal(fit.height, 2000);
  // Design floor at 1800 must sit at 800 → top = −1000; design still covers the band.
  assert.equal(fit.top, -1000);
  assert.ok(fit.top + fit.height >= 1000);
});

test("no floor on either side means the plain height fit the composer always did", () => {
  assert.deepEqual(fitToFloor({ w: 3000, h: 1500, floorY: null }, 0.8, 1000), { height: 1000, width: 2000, top: 0, scaleUp: 1 });
  assert.deepEqual(fitToFloor({ w: 3000, h: 1500, floorY: 0.8 }, null, 1000), { height: 1000, width: 2000, top: 0, scaleUp: 1 });
});

test("a run that would end on an appliance is cut in the gap before it", () => {
  // Three appliances across a 3000 px design; the band ends at 2200, inside the third.
  const subjects = [
    { x0: 0.05, x1: 0.30, y0: 0.2, y1: 0.9 },
    { x0: 0.38, x1: 0.62, y0: 0.2, y1: 0.9 },
    { x0: 0.70, x1: 0.95, y0: 0.2, y1: 0.9 },
  ];
  const c = safeCut(2200, 3000, subjects);
  assert.equal(c.movedForSubject, true);
  // Cut lands before the third subject (0.70 × 3000 = 2100, less the margin).
  assert.ok(c.cutX < 2100 && c.cutX > 1900, `cut at ${c.cutX}`);
  assert.equal(c.fill, 2200 - c.cutX);
  // The gap starts after the second subject ends (0.62 × 3000 = 1860 plus margin).
  assert.ok(c.gapStart >= 1860 && c.gapStart < c.cutX);
});

test("a run that already ends in a gap, or shows the whole design, is left alone", () => {
  const subjects = [{ x0: 0.1, x1: 0.4, y0: 0, y1: 1 }, { x0: 0.6, x1: 0.9, y0: 0, y1: 1 }];
  assert.deepEqual(safeCut(1500, 3000, subjects), { cutX: 1500, fill: 0, gapStart: 1500, movedForSubject: false });
  assert.deepEqual(safeCut(3000, 3000, subjects), { cutX: 3000, fill: 0, gapStart: 3000, movedForSubject: false });
  assert.equal(safeCut(2000, 3000, []).movedForSubject, false);
});

test("a cut is not moved when it would give up most of the visible run", () => {
  // One wide appliance filling nearly the whole design: moving the cut would
  // leave almost nothing — a sliced appliance beats an empty band.
  const subjects = [{ x0: 0.02, x1: 0.98, y0: 0, y1: 1 }];
  assert.equal(safeCut(2000, 3000, subjects).movedForSubject, false);
});

test("a large panel wants a dense composition; a header band does not", () => {
  assert.equal(wantsDenseComposition(2794, 2083), true);   // Narol staircase bay
  assert.equal(wantsDenseComposition(7747, 965), false);   // washing-machine header
  assert.equal(wantsDenseComposition(1143, 965), false);
  assert.ok(minSubjectsFor(2794, 2083) >= 4);
  assert.equal(minSubjectsFor(7747, 965), 1);
});

test("a top-down flat lay never stands in a floor-line band", () => {
  // ZYVS-9E3594, Narol wall 1: cameras and phones at angles, no ground line.
  assert.equal(standsInBand({ floorY: null, subjects: [{ x0: 0, x1: 0.2, y0: 0.4, y1: 0.7, label: "camera" }] }), false);
  // Standing appliances hold the line; a pure pattern fills as background.
  assert.equal(standsInBand({ floorY: 0.74, subjects: [{ x0: 0.1, x1: 0.3, y0: 0.2, y1: 0.7 }] }), true);
  assert.equal(standsInBand({ floorY: null, subjects: [] }), true);
  // Not yet measured: compose as before, measure next time.
  assert.equal(standsInBand(undefined), true);
});

test("a chain that mixes scenes with blocks keeps the blocks; pure chains stay", () => {
  const styles: Record<string, "blocks" | "scene" | null> = { a: "blocks", b: "scene", c: null };
  assert.deepEqual(sameLanguage(["a", "b", "c"], (id) => styles[id]), ["a", "c"]);
  assert.deepEqual(sameLanguage(["b", "b"], (id) => styles[id]), ["b", "b"]);
  assert.deepEqual(sameLanguage(["a", "c"], (id) => styles[id]), ["a", "c"]);
  assert.deepEqual(sameLanguage(["c"], () => undefined), ["c"]);
});

test("colour-block boundaries are read off the column strip", () => {
  const cols: [number, number, number][] = [];
  for (let i = 0; i < 100; i++) cols.push([230, 90, 60]);   // orange patch
  for (let i = 0; i < 100; i++) cols.push([240, 205, 70]);  // yellow patch
  for (let i = 0; i < 100; i++) cols.push([70, 180, 170]);  // teal patch
  const bs = colourBoundaries(cols, 8);
  assert.equal(bs.length, 2, `found ${JSON.stringify(bs)}`);
  assert.ok(Math.abs(bs[0]! - 100) <= 8 && Math.abs(bs[1]! - 200) <= 8, `at ${JSON.stringify(bs)}`);
});

test("a cut lands on the last patch boundary, never a sliver past it", () => {
  // Subject-safe cut at ~2055 (before the third appliance); the patch
  // boundary sits at 2000, so the band ends on the full previous patch.
  const subjects = [
    { x0: 0.05, x1: 0.30, y0: 0.2, y1: 0.9 },
    { x0: 0.38, x1: 0.62, y0: 0.2, y1: 0.9 },
    { x0: 0.70, x1: 0.95, y0: 0.2, y1: 0.9 },
  ];
  const c = cutOnPatch(2200, 3000, subjects, [1000, 2000, 2900], 400);
  assert.equal(c.snapped, true);
  assert.equal(c.cutX, 2000);
  assert.equal(c.fill, 200);
  // The slab is confined to the final patch (1000–2000), past the gap start.
  assert.ok(c.gapStart >= 1860 && c.gapStart < c.cutX, `slab from ${c.gapStart}`);

  // A natural end just past a boundary is pulled back onto it too.
  const d = cutOnPatch(2950, 3000, [], [2800], 300);
  assert.equal(d.snapped, true);
  assert.equal(d.cutX, 2800);
  assert.equal(d.fill, 150);

  // No boundary within reach: the subject-safe cut stands as it was.
  const e = cutOnPatch(2200, 3000, subjects, [500], 400);
  assert.equal(e.snapped, false);
  assert.deepEqual({ cutX: e.cutX, fill: e.fill }, { cutX: safeCut(2200, 3000, subjects).cutX, fill: safeCut(2200, 3000, subjects).fill });
});

test("geometryIsCurrent: never measured, or measured before style and still unstyled, is not current", () => {
  assert.equal(geometryIsCurrent({ geometry_measured_at: null, composition_style: null }), false);
  assert.equal(geometryIsCurrent({ geometry_measured_at: "2026-10-06T09:00:00Z", composition_style: null }), false);
  assert.equal(geometryIsCurrent({ geometry_measured_at: "2026-10-06T09:00:00Z", composition_style: "blocks" }), true);
  assert.equal(geometryIsCurrent({ geometry_measured_at: "2026-10-06T16:00:00Z", composition_style: null }), true, "a pure pattern has no style and is still current once asked");
});

test("a design is never enlarged past MAX_FLOOR_SCALE to meet the floor line (Narol wall 4)", () => {
  // The speaker triptych: floor drawn at 88%, store line at 78% → 1.83× needed.
  assert.equal(holdsFloorLine({ w: 3000, h: 1000, floorY: 0.88 }, 0.78, 768), false);
  assert.ok(fitToFloor({ w: 3000, h: 1000, floorY: 0.88 }, 0.78, 768).scaleUp > MAX_FLOOR_SCALE);
  // A floor a little high or low is still pinned.
  assert.equal(holdsFloorLine({ w: 2000, h: 1000, floorY: 0.70 }, 0.80, 1000), true);
  assert.equal(holdsFloorLine({ w: 2000, h: 1000, floorY: 0.785 }, 0.78, 768), true);
  // No floor, or no line: nothing to hold, nothing refused.
  assert.equal(holdsFloorLine({ w: 2000, h: 1000, floorY: null }, 0.78, 768), true);
});

test("with maxFill, a sliver of an appliance at the band's end is cut back to its gap (Narol wall 3)", () => {
  const subjects = [
    { x0: 0.05, x1: 0.30, y0: 0.1, y1: 0.9 },
    { x0: 0.38, x1: 0.62, y0: 0.1, y1: 0.9 },
  ];
  // Only 200 px of the next copy fits and the first phone starts at 150: the
  // old fraction rule refused (gives up 75% of a tiny run) and sliced it.
  assert.equal(safeCut(200, 3000, subjects).movedForSubject, false);
  const c = safeCut(200, 3000, subjects, { maxFill: 400 });
  assert.equal(c.movedForSubject, true);
  assert.ok(c.fill <= 400 && c.cutX < 150);
  // But a cut that would paint more of the band than maxFill is refused.
  assert.equal(safeCut(2200, 3000, [{ x0: 0.1, x1: 0.95, y0: 0, y1: 1 }], { maxFill: 400 }).movedForSubject, false);
});

// BAND_RULES_VERSION is how the site knows the media container composed with
// the current rules. It only works if it changes whenever the rules do, so
// this pins the two rule files' content: change either and this fails until
// BAND_RULES_VERSION is bumped and the fingerprint below updated.
// (band-paint.ts is part of the composition too: it paints the gaps.)
test("BAND_RULES_VERSION moves with the composition rules", async () => {
  const { readFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { BAND_RULES_VERSION } = await import("./band-geometry");
  const strip = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8")
    .split("\n").filter((l) => !l.includes("export const BAND_RULES_VERSION")).join("\n");
  const print = createHash("sha256").update(strip("./band-geometry.ts")).update(strip("./corporate-band-compose.ts")).update(strip("./band-paint.ts")).update(strip("./band-complete.ts")).digest("hex").slice(0, 16);
  assert.deepEqual({ BAND_RULES_VERSION, print }, { BAND_RULES_VERSION: "2026-10-25.4", print: "cc8fe369825826b8" },
    "band rules changed: bump BAND_RULES_VERSION in band-geometry.ts, then put the new version and fingerprint here");
});

test("wholeSubjectWindow keeps objects whole at a crop's edges (Narol walls 2, 6 and 7)", () => {
  // Three televisions across a 2000 px design; a narrow bay shows 1130 px.
  const tvs = [{ a: 100, b: 600 }, { a: 750, b: 1250 }, { a: 1400, b: 1900 }];
  // No 1130 px window holds whole televisions without slicing a neighbour…
  assert.equal(wholeSubjectWindow(2000, 1130, tvs, 1000), null);
  // …so the crop centres on the middle one and paints over the two edges.
  const off = 435;
  const paints = edgePaints(off, 1130, tvs, 20);
  assert.equal(paints.length, 2);
  const [left, right] = paints;
  assert.deepEqual({ from: left!.from, to: left!.to }, { from: 0, to: 600 + 20 - off });
  assert.ok(left!.gapFrom === left!.to && left!.gapTo === 750 - 20 - off, "left paint takes its colour from the gap before the middle tv");
  assert.equal(right!.to, 1130);
  assert.ok(right!.from === 1400 - 20 - off && right!.gapFrom === 1250 + 20 - off);
  // A window that already holds whole objects paints nothing.
  assert.deepEqual(edgePaints(80, 1200, [{ a: 100, b: 600 }, { a: 750, b: 1250 }], 0), []);
  // VS1: three rows of a 3 × 3 grid, 2747 px tall, on a 2048 px panel. No
  // window shows every object whole, so the composer must tile instead.
  const rows = [{ a: 60, b: 820 }, { a: 990, b: 1750 }, { a: 1920, b: 2680 }];
  assert.equal(wholeSubjectWindow(2747, 2048, rows, 1373), null);
  // Nothing to judge by: no opinion.
  assert.equal(wholeSubjectWindow(2000, 1000, [], 1000), null);
});

// The first live run of edgePaints threw on Narol walls 2 and 6: object boxes
// are fractions scaled to pixels, and the image library refuses a fractional
// extract. Wall 2's own geometry (five toasters, 1143 mm bay), at the scale
// the composer works in, must come back on whole pixels inside the window.
test("edgePaints returns whole pixels inside the window (Narol wall 2)", () => {
  const toasters = [[0.04, 0.212], [0.263, 0.483], [0.527, 0.757], [0.763, 0.948], [0.776, 0.952]];
  const rw = 1857.37, win = 1100;
  const xs = toasters.map(([a, b]) => ({ a: a! * rw, b: b! * rw }));
  const m = Math.round(rw * 0.01);
  assert.equal(wholeSubjectWindow(rw, win, xs, rw / 2, m), null);
  const pick = xs[2]!;
  const off = Math.round((pick.a + pick.b) / 2 - win / 2);
  const paints = edgePaints(off, win, xs, m);
  assert.ok(paints.length >= 1);
  for (const p of paints) {
    for (const v of [p.from, p.to, p.gapFrom, p.gapTo]) {
      assert.ok(Number.isInteger(v) && v >= 0 && v <= win, `${v} is a whole pixel in the window`);
    }
    assert.ok(p.to > p.from && p.gapTo > p.gapFrom);
  }
});

test("sliverRuns paints the strip of a neighbouring panel at a band's end and joins (Nelamangala, 13 October 2026)", async () => {
  const { sliverRuns, clearSpans } = await import("./band-geometry");
  // Wall 12: a kettle on a pink panel, then 19 px of cream-and-teal at the edge.
  const clear12 = clearSpans([{ a: 1540, b: 1700 }], 1821);
  assert.deepEqual(sliverRuns([1802], clear12, 1821, 56), [{ from: 1802, to: 1821, gap: { from: 1700, to: 1802 }, side: "left" }]);
  // Wall 5: a fridge panel, 88 px of the next copy's grid column, then the paint.
  const s5 = sliverRuns([4222, 4310], clearSpans([{ a: 3900, b: 4150 }], 4805), 4805, 149, [0, 4805, 4222, 4310]);
  assert.equal(s5.length, 1);
  assert.deepEqual([s5[0]!.from, s5[0]!.to, s5[0]!.side], [4222, 4310, "right"]);
  // The background an object stands on is never a sliver, however narrow…
  assert.deepEqual(sliverRuns([1730], clearSpans([{ a: 1540, b: 1700 }], 1821), 1821, 56), []);
  // …a wide final panel (wall 2's magenta block) is a panel, not a sliver…
  assert.deepEqual(sliverRuns([2271], clearSpans([{ a: 2000, b: 2200 }], 2494), 2494, 56), []);
  // …and a narrow column INSIDE a design, far from any seam, is its artwork.
  assert.deepEqual(sliverRuns([900, 940], clearSpans([{ a: 600, b: 850 }, { a: 1000, b: 1200 }], 3000), 3000, 56, [0, 3000, 2000]), []);
  // Nothing to look at when objects fill the band.
  assert.deepEqual(clearSpans([{ a: -5, b: 400 }, { a: 300, b: 1000 }], 1000), []);
});

test("appliances stand in one line: stacked designs are told apart and never mixed with rows (Nelamangala, 14 October 2026)", async () => {
  const { arrangementOf, oneArrangement } = await import("./band-geometry");
  // PN3UMQ: two rows of tiles (blender over air fryer).
  const grid = { floorY: 0.85, subjects: [
    { x0: 0.04, x1: 0.31, y0: 0.26, y1: 0.45 }, { x0: 0.08, x1: 0.28, y0: 0.57, y1: 0.85 },
    { x0: 0.74, x1: 0.94, y0: 0.12, y1: 0.44 }, { x0: 0.73, x1: 0.92, y0: 0.59, y1: 0.85 },
  ] };
  // MXXPGX: five appliances side by side.
  const row = { floorY: 0.81, subjects: [
    { x0: 0.025, x1: 0.195, y0: 0.105, y1: 0.805 }, { x0: 0.198, x1: 0.335, y0: 0.125, y1: 0.805 },
    { x0: 0.335, x1: 0.552, y0: 0.235, y1: 0.822 },
  ] };
  // 8V7HNV: a cup drawn inside an espresso machine, and a phone on the floor
  // under a TV (VR2FXX), are props, not a second row.
  const props = { floorY: 0.8, subjects: [
    { x0: 0.042, x1: 0.248, y0: 0.168, y1: 0.808 }, { x0: 0.091, x1: 0.228, y0: 0.552, y1: 0.722 },
    { x0: 0.054, x1: 0.328, y0: 0.232, y1: 0.778 }, { x0: 0.04, x1: 0.124, y0: 0.772, y1: 0.912 },
  ] };
  assert.equal(arrangementOf(grid), "stacked");
  assert.equal(arrangementOf(row), "row");
  assert.equal(arrangementOf(props), "row");
  assert.equal(arrangementOf(null), null);
  const arr = (id: string) => ({ g: "stacked", r: "row", r2: "row" } as const)[id as "g" | "r" | "r2"];
  assert.deepEqual(oneArrangement(["r", "g", "r2"], arr), ["r", "r2"]);
  assert.deepEqual(oneArrangement(["g"], arr), ["g"]);
});

test("a run ends on a whole panel and the slack is shared across the joins (Nelamangala walls 7 and 8)", async () => {
  const { panelEnds, panelJoins, spreadSlack } = await import("./band-geometry");
  // Three 100 px panels, one appliance in each, the last panel empty.
  const objs = [{ a: 20, b: 80 }, { a: 120, b: 180 }, { a: 220, b: 280 }];
  const bounds = [100, 200, 300];
  // The design may end after any panel that holds an appliance — never inside
  // one, never on the empty fourth panel.
  assert.deepEqual(panelEnds(400, objs, bounds), [100, 200, 300]);
  assert.deepEqual(panelEnds(300, objs, bounds.slice(0, 2)), [100, 200, 300]);
  // A boundary through an appliance is no end and no join.
  assert.deepEqual(panelEnds(300, [{ a: 20, b: 150 }, { a: 220, b: 280 }], [100, 200]), [200, 300]);
  assert.deepEqual(panelJoins(300, [{ a: 20, b: 150 }, { a: 220, b: 280 }], [100, 200]), [200]);
  assert.deepEqual(spreadSlack(10, 4), [3, 3, 2, 2]);
  assert.equal(spreadSlack(97, 7).reduce((a, b) => a + b, 0), 97);
  assert.deepEqual(spreadSlack(5, 0), []);
});

test("bestFill packs whole panels into what is left of a run (Nelamangala wall 4, 14 October 2026)", async () => {
  const { bestFill } = await import("./band-geometry");
  // 700 px left; A ends after 300 or 600, B after 250 or 500.
  const d = [{ id: "A", ends: [300, 600] }, { id: "B", ends: [250, 500] }];
  const r = bestFill(700, d);
  // A(600) leaves 100; A(300)+B(250) would leave 150.
  assert.equal(r.slack, 100);
  // Never the same design twice in a row, nor right after the design laid last.
  for (let i = 1; i < r.pieces.length; i++) assert.notEqual(r.pieces[i]!.id, r.pieces[i - 1]!.id);
  assert.notEqual(bestFill(300, d, "A").pieces[0]?.id, "A");
  // Nothing fits → nothing laid, all slack.
  assert.deepEqual(bestFill(100, d), { pieces: [], slack: 100 });
});

test("the end of a run never repeats a design already on the wall, and short runs scale rather than spread (14 October 2026)", async () => {
  const { bestFill, scaledWidths } = await import("./band-geometry");
  const d = [{ id: "A", ends: [300, 600] }, { id: "B", ends: [250, 500] }];
  // A already stands whole on the wall: only B may fill, even at a worse fit.
  const r = bestFill(700, d, "A", 3, ["A"]);
  assert.ok(r.pieces.every((p) => p.id === "B"));
  // Not even a single-design chain fills with itself: the same toaster twice
  // on one wall (walls 2 and 5, 14 October 2026). The model completes it.
  assert.deepEqual(bestFill(300, [{ id: "A", ends: [300] }], "A", 3, ["A"]), { pieces: [], slack: 300 });
  assert.equal(bestFill(700, [{ id: "A", ends: [300] }]).pieces.length, 1, "one piece of a design, never two");
  // Scaling: 950 → 1000 is a 5.3% enlargement, whole pixels summing exactly.
  assert.deepEqual(scaledWidths([400, 550], 1000)!.reduce((a, b) => a + b, 0), 1000);
  // A run is enlarged by at most 3.5%: the overflow comes off the top, and
  // the tip of the tallest appliance keeps TIP_MARGIN of headroom.
  const { maxRunScale } = await import("./band-geometry");
  assert.ok(maxRunScale(0.845) > 1.03 && maxRunScale(0.845) < 1.04);
  assert.equal(scaledWidths([450, 450], 1000, maxRunScale(0.845)), null, "an 11% enlargement is refused");
  assert.ok(scaledWidths([970, 20], 1000, maxRunScale(0.845)) !== null, "a 1% enlargement is allowed");
  // Beyond 15% is refused; so is a run already wider than the wall.
  assert.equal(scaledWidths([400, 400], 1000), null);
  assert.equal(scaledWidths([600, 600], 1000), null);
});

// Roheena, 14 October 2026, with a photograph of a finished store: "everything
// needs to be made as big as the height … just keeping the floor line".
// ZYVS-5QAJLE as measured: six appliances standing on a floor at 0.755, the
// tallest reaching 0.308 — half the band empty above them when height-fitted.
test("fillToHeight enlarges a design until its tallest appliance nearly meets the top, floor pinned", async () => {
  const { fillToHeight, FILL_TOP_MARGIN, MAX_FILL_SCALE } = await import("./band-geometry");
  const subjects = [
    { x0: 0.008, x1: 0.196, y0: 0.344, y1: 0.752 }, { x0: 0.238, x1: 0.361, y0: 0.316, y1: 0.73 },
    { x0: 0.373, x1: 0.508, y0: 0.325, y1: 0.752 }, { x0: 0.509, x1: 0.622, y0: 0.308, y1: 0.73 },
    { x0: 0.62, x1: 0.767, y0: 0.37, y1: 0.752 }, { x0: 0.784, x1: 0.977, y0: 0.352, y1: 0.757 },
  ];
  const H = 768;
  const fit = fillToHeight({ w: 1536, h: 768, floorY: 0.755, subjects }, 0.845, H);
  const floorAt = (0.755 * fit.height + fit.top) / H;
  const topAt = (0.308 * fit.height + fit.top) / H;
  assert.ok(Math.abs(floorAt - 0.845) < 0.005, `floor stays on the store's line (${floorAt})`);
  assert.ok(Math.abs(topAt - FILL_TOP_MARGIN) < 0.01, `the tallest appliance reaches just under the top (${topAt})`);
  assert.ok(fit.height + fit.top >= H, "the band is covered to the bottom");
  assert.ok(fit.scaleUp <= MAX_FILL_SCALE);
  // A phone lying in front of the floor line does not set the height.
  const withPhone = fillToHeight({ w: 1536, h: 768, floorY: 0.755, subjects: [...subjects, { x0: 0.04, x1: 0.12, y0: 0.05, y1: 0.95 }] }, 0.845, H);
  assert.equal(withPhone.height, fit.height);
  // No measured subjects: the plain floor fit, unchanged.
  assert.equal(fillToHeight({ w: 1536, h: 768, floorY: 0.755, subjects: [] }, 0.845, H).scaleUp < fit.scaleUp, true);
});

// Roheena, 14 October 2026: "don't cut off the tops of the vacuum cleaners …
// bake these rules — nothing should be cut off". The tip of the tallest
// appliance, placed on the store's floor line at the wall's height, stays
// clear of the top edge; a design that cannot gives its place to ones that can.
test("a design whose tallest appliance would touch the top edge is refused (tipsStayInFrame)", async () => {
  const { tipsStayInFrame, TIP_MARGIN } = await import("./band-geometry");
  const box = (y0: number) => ({ x0: 0.4, x1: 0.5, y0, y1: 0.87 });
  // Floor .87 on a .845 line: the picture shifts up by .025, so a tip at .06 sits at .035.
  assert.equal(tipsStayInFrame({ w: 2000, h: 1000, floorY: 0.87, subjects: [box(0.3), box(0.06)] }, 0.845, 1000), false);
  assert.equal(tipsStayInFrame({ w: 2000, h: 1000, floorY: 0.87, subjects: [box(0.3), box(0.2)] }, 0.845, 1000), true);
  // Unmeasured designs are not judged.
  assert.equal(tipsStayInFrame({ w: 2000, h: 1000, floorY: null, subjects: [] }, 0.845, 1000), true);
  assert.ok(TIP_MARGIN > 0);
});

// EBD Gurgaon, 25 October 2026: one uniform flat-lay electronics set, which
// the measurer gave a floor to on 3 of 10 designs. The floor filter kept only
// those, so wall 1 composed 2 of its 5 designs and wall 2 one of its 5.
test("a floor measured on a few designs of one set does not strip the wall (EBD Gurgaon)", () => {
  const flat = { floorY: null, subjects: [{ x0: 0.05, x1: 0.12, y0: 0.2, y1: 0.8 }], style: "blocks" as const };
  const floor = { ...flat, floorY: 0.81 };
  const wall1: Record<string, typeof flat | typeof floor> = { XFE46V: floor, LDXW39: flat, D9SKGX: flat, ARKETN: floor, ASS6ZA: flat };
  const wall2: Record<string, typeof flat | typeof floor> = { KXKTNP: flat, MMG3DR: flat, AVT36C: floor, KV4L5D: flat, EYA7C8: flat };
  assert.deepEqual(standingOrAll(Object.keys(wall1), (id) => wall1[id]), Object.keys(wall1));
  assert.deepEqual(standingOrAll(Object.keys(wall2), (id) => wall2[id]), Object.keys(wall2));
  // Narol still holds: most of the wall stands, so the odd flat lay goes.
  const narol: Record<string, typeof flat | typeof floor> = { A: floor, B: floor, C: floor, D: flat };
  assert.deepEqual(standingOrAll(Object.keys(narol), (id) => narol[id]), ["A", "B", "C"]);
});

test("a patch the image model could not complete fails the wall, never 'composed'", () => {
  const rejected = bandOutcome({
    notes: ["could not complete the patch at 61%: gpt-image-2 answered 401: Incorrect API key provided: sk-proj-***"],
    incomplete: ["could not complete the patch at 61%: gpt-image-2 answered 401: Incorrect API key provided: sk-proj-***", "could not complete the patch at 68%: gpt-image-2 answered 401"],
  });
  assert.equal(rejected.status, "compose_failed");
  assert.match(rejected.warning ?? "", /2 patches .* OpenAI key was rejected/);
  assert.equal(bandOutcome({ notes: ["one run end moved"], incomplete: [] }).status, "composed");
  assert.equal(bandOutcome({ notes: [], incomplete: [] }).warning, null);
});

// EBD Gurgaon wall 3, 25 October 2026: ZYVS-WQZ2G8's red panel runs into an
// orange one with a jump of only 68 — under the 90 a full-height edge needs —
// so the 8 ft 6 in wall could not end after three whole panels.
test("two warm panels side by side are an edge when the pure top strip says so", () => {
  const panel = (rgb: [number, number, number], n: number) => Array.from({ length: n }, () => rgb);
  const red: [number, number, number] = [236, 84, 80], orange: [number, number, number] = [236, 128, 56];
  // Full height: the same panels, muddied by a dark phone in each.
  const full = [...panel(red, 100), ...panel(orange, 100)].map((c, i) => (i % 100 > 40 && i % 100 < 60 ? [60, 60, 60] as [number, number, number] : c));
  const top = [...panel(red, 100), ...panel(orange, 100)];
  assert.ok(!colourBoundaries(full, 8).some((x) => Math.abs(x - 100) <= 2), "the old reading misses the red→orange edge");
  assert.ok(panelBoundaries(full, top, 8).some((x) => Math.abs(x - 100) <= 2), "the top strip finds it");
  // No top strip (an old caller, a tiny image): exactly the old answer.
  assert.deepEqual(panelBoundaries(full, null, 8), colourBoundaries(full, 8));
  // A gentle gradient in the top strip is not a panel edge.
  const grad = Array.from({ length: 200 }, (_, i) => [200 - i * 0.2, 180, 160] as [number, number, number]);
  assert.deepEqual(panelBoundaries(grad, grad, 8), []);
});
