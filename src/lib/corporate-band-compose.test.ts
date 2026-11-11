import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { equalSlices } from "@/lib/print-limits";

// equalSlices is the single partition used for both the design panels and the
// roll-piece cut. It must tile the run with no gap and no overlap, and the
// widths must sum back to the exact total (billing rides on the mm partition).
test("equalSlices tiles the run gap-free and sums exactly", () => {
  for (const [total, n] of [[10000, 3], [5486, 3], [4001, 2], [1, 1], [40000, 7]] as const) {
    const s = equalSlices(total, n);
    assert.equal(s.length, n);
    assert.equal(s[0]!.left, 0);
    assert.equal(s.reduce((a, x) => a + x.width, 0), total, `widths sum to ${total}`);
    for (let i = 1; i < n; i++) {
      assert.equal(s[i]!.left, s[i - 1]!.left + s[i - 1]!.width, "no gap / no overlap");
    }
    const w = s.map((x) => x.width);
    assert.ok(Math.max(...w) - Math.min(...w) <= 1, "panels within 1px of equal");
  }
});

// Guard the band rule: a multi-design wall is a BAND that adds each design
// ahead of the last at NATURAL height-fit width (A B C A B C …), the floor
// meeting at every join because every design is top-aligned to a common band
// height. It must NOT scale a design to a fixed panel (squash/blow-up) or put a
// seam through an appliance mid-wall — only the LAST copy is cropped, at the
// band's far edge. This mirrors band-compose-interactive.
test("multi-design wall tiles ahead at natural scale, cropping only the last", () => {
  const src = readFileSync(new URL("./corporate-band-compose.ts", import.meta.url), "utf8");
  assert.ok(src.includes("guard % bandIds.length"), "designs follow one another A B C A B C");
  assert.ok(src.includes("standsInBand"), "a flat lay (subjects, no floor) is dropped from the band");
  assert.ok(src.includes("sameLanguage"), "a band speaks one visual language: scenes are dropped when blocks are present");
  assert.ok(src.includes("cutOnPatch"), "a run's end cut snaps onto a colour-block boundary, never a sliver past it");
  assert.ok(src.includes("holdsFloorLine"), "a design that cannot reach the floor line within MAX_FLOOR_SCALE gives up its place");
  assert.ok(src.includes("maxFill: fillCap"), "paint never covers more than a small share of the band");
  assert.ok(!src.includes(".flop()"), "the end fill is a flat per-row colour, never mirrored slabs");
  assert.ok(src.includes("Math.min(r.w, targetW - x)"), "each design keeps its natural width; only the run end is clipped");
  assert.ok(!src.includes("const k = targetW / sumW"), "no uniform panel-scaling (that squashed designs)");
  assert.ok(!/f\.x \* rw|f\.y \* rh/.test(src.split("coverWall")[2] ?? ""), "no focal crop in the multi-design band path");
});

// The container cannot measure (it has no media-worker address), and a failed
// measurement fails open to "unmeasured" without a word. The Worker therefore
// measures before it hands a wall to the composer.
test("the Worker measures a wall's designs before composing it", () => {
  const src = readFileSync(new URL("./site-batch.ts", import.meta.url), "utf8");
  const compose = src.slice(src.indexOf("export async function composeNextWall"));
  const measured = compose.indexOf("ensureDesignGeometry(sb, batchIds)");
  assert.ok(measured > 0, "composeNextWall measures the batch's designs (the run planner reads them)");
  assert.ok(measured < compose.indexOf("bandComposeRemote("), "and does so before the container is called");
});
