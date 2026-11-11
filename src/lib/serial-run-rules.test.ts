import { test } from "node:test";
import assert from "node:assert/strict";
import { planSerialRuns, startTrim, wallRuns, type RunDesign, type RunWall } from "./serial-run-rules";

// EBD Gurgaon, 25 October 2026: three walls 3 ft 6 in high, wall 1 turning
// into wall 2 and wall 2 into wall 3; every design 4352 × 1088 px.
const W1 = ["XFE46V", "ARKETN", "D9SKGX", "KV4L5D"];
const W2 = ["KXKTNP", "MMG3DR", "AVT36C", "EYA7C8"];
const W3 = ["WQZ2G8", "HHXYD4", "LDXW39", "ASS6ZA"];
const gurgaon = (turns: boolean): RunWall[] => [
  { seq: 1, widthMm: 15545, heightMm: 1067, turnsIntoNext: turns, designIds: W1 },
  { seq: 2, widthMm: 14783, heightMm: 1067, turnsIntoNext: turns, designIds: W2 },
  { seq: 3, widthMm: 2591, heightMm: 1067, turnsIntoNext: false, designIds: W3 },
];
const subjects: Record<string, { x0: number; x1: number }[]> = {
  // Measured objects of the run's two end designs (corporate_designs.subjects).
  XFE46V: [[0.027, 0.106], [0.145, 0.256], [0.291, 0.378], [0.4, 0.591], [0.623, 0.696], [0.727, 0.806], [0.818, 0.869], [0.899, 0.974]].map(([x0, x1]) => ({ x0: x0!, x1: x1! })),
  EYA7C8: [[0.038, 0.11], [0.153, 0.292], [0.335, 0.406], [0.457, 0.56], [0.566, 0.769], [0.797, 0.861], [0.893, 0.97]].map(([x0, x1]) => ({ x0: x0!, x1: x1! })),
};
const design = (id: string): RunDesign => ({ aspect: 4352 / 1088, subjects: subjects[id] ?? [], code: id });
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

test("Gurgaon as one run round two corners: whole designs, cut only at the two free ends", () => {
  const plan = planSerialRuns(gurgaon(true), design);
  assert.equal(plan.errors.size, 0);
  const all = [1, 2, 3].flatMap((seq) => plan.strips.get(seq)!.map((s) => ({ seq, ...s })));
  // Eight designs laid whole, in the walls' order; wall 3's own are not needed.
  assert.deepEqual([...new Set(all.map((s) => s.id))], [...W1, ...W2]);
  // Each wall is covered exactly, edge to edge, with no gap or overlap.
  for (const [seq, width] of [[1, 15545], [2, 14783], [3, 2591]] as const) {
    const ss = plan.strips.get(seq)!;
    assert.ok(near(ss[0]!.atMm, 0));
    for (let i = 1; i < ss.length; i++) assert.ok(near(ss[i]!.atMm, ss[i - 1]!.atMm + ss[i - 1]!.lenMm));
    assert.ok(near(ss.at(-1)!.atMm + ss.at(-1)!.lenMm, width));
  }
  // No design is cut inside the run: every piece runs to its design's own
  // edge, except at a corner, where the same design carries on round it.
  const pieces = new Map<string, typeof all>();
  for (const s of all) pieces.set(s.id, [...(pieces.get(s.id) ?? []), s]);
  for (const [id, ps] of pieces) {
    const from = Math.min(...ps.map((p) => p.from)), to = Math.max(...ps.map((p) => p.to));
    if (id !== "XFE46V") assert.ok(near(from, 0, 1e-6), `${id} starts whole`);
    if (id !== "EYA7C8") assert.ok(near(to, 1, 1e-6), `${id} ends whole`);
    for (let i = 1; i < ps.length; i++) {
      assert.equal(ps[i]!.seq, ps[i - 1]!.seq + 1, `${id} only continues onto the next wall`);
      assert.ok(near(ps[i]!.from, ps[i - 1]!.to, 1e-6), `${id} turns the corner unbroken`);
    }
  }
  // KV4L5D turns the first corner; AVT36C… the second is wherever it falls.
  assert.equal(pieces.get("KV4L5D")!.map((p) => p.seq).join(), "1,2");
  // What comes off the two free ends misses every object (a clear split exists).
  const first = plan.strips.get(1)![0]!, lastPiece = plan.strips.get(3)!.at(-1)!;
  const cutIn = first.from * 4268, cutOut = lastPiece.to * 4268;
  assert.ok(!subjects.XFE46V!.some((s) => cutIn > s.x0 * 4268 && cutIn < s.x1 * 4268), "start cut misses a gadget");
  assert.ok(!subjects.EYA7C8!.some((s) => cutOut > s.x0 * 4268 && cutOut < s.x1 * 4268), "end cut misses a gadget");
});

test("without the turns each wall is a run of one, both its ends free", () => {
  const plan = planSerialRuns(gurgaon(false), design);
  assert.equal(plan.errors.size, 0);
  assert.deepEqual(plan.strips.get(3)!.map((s) => s.id), ["WQZ2G8"]);
  const s = plan.strips.get(3)![0]!;
  assert.ok(near(s.from, 1 - s.to, 1e-6), "one design alone is cut evenly off both ends");
  assert.deepEqual(wallRuns(gurgaon(false)).map((r) => r.length), [1, 1, 1]);
  assert.deepEqual(wallRuns(gurgaon(true)).map((r) => r.length), [3]);
});

test("a run its designs cannot cover, or of two heights, fails with the reason", () => {
  const short = planSerialRuns([{ seq: 1, widthMm: 9000, heightMm: 1067, turnsIntoNext: false, designIds: ["A", "B"] }], design);
  assert.match(short.errors.get(1)!, /cover 8\.54 m of 9\.00 m — it needs another design/);
  const odd = gurgaon(true).map((w) => (w.seq === 2 ? { ...w, heightMm: 1200 } : w));
  const plan = planSerialRuns(odd, design);
  assert.match(plan.errors.get(1)!, /wall 2 is 1200 mm high/);
  assert.equal(plan.errors.size, 3, "every wall of the run fails together");
  const blind = planSerialRuns([{ seq: 1, widthMm: 2000, heightMm: 1000, turnsIntoNext: false, designIds: ["Z"] }], () => ({ aspect: null, code: "ZYVS-Z" }));
  assert.match(blind.errors.get(1)!, /pixel size of ZYVS-Z/);
});

test("an end never loses more than half its design", () => {
  // 1 m to take off, end designs 1.2 m wide: at most 0.6 m from each.
  const d = { widthMm: 1200, subjects: [] };
  const t = startTrim(1000, d, d)!;
  assert.ok(t >= 400 && t <= 600);
  assert.equal(startTrim(1500, d, d), null);
});
