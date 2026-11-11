import { test } from "node:test";
import assert from "node:assert/strict";
import { alignWalls, dedupeLeads, nextRevision, presentable, proposalHeadline, type Narrative } from "./prism-rules";

test("a proposal is presentable only when every wall is ready", () => {
  assert.deepEqual(presentable({ canStart: true, ask: null }), { ok: true, reason: null });
  assert.deepEqual(presentable({ canStart: false, ask: "Still needed: sizes for 2 walls." }), { ok: false, reason: "Still needed: sizes for 2 walls." });
  assert.equal(presentable({ canStart: false, ask: null }).reason, "Add at least one wall before presenting.");
  assert.equal(nextRevision(null), 1);
  assert.equal(nextRevision(3), 4);
});

test("no design leads two walls; later walls promote their next candidate", () => {
  const c = (handle: string) => ({ handle, title: handle, image: null, flat: null, why: "" });
  const out = dedupeLeads([
    { seq: 2, candidates: [c("fern"), c("map")] },
    { seq: 1, candidates: [c("fern"), c("sky")] },
    { seq: 3, candidates: [c("fern")] },
  ]);
  assert.deepEqual(out.map((w) => [w.seq, w.candidates[0].handle]), [[1, "fern"], [2, "map"], [3, "fern"]]);
  assert.deepEqual(out[1].candidates.map((x) => x.handle), ["map", "fern"]);
});

test("the board decides how many walls a revision has", () => {
  const live = [{ seq: 1, name: "Entrance" }, { seq: 2, name: "Library" }];
  const walls = alignWalls([
    { seq: 2, title: "The quiet", rationale: "r", concept: "c", mood: "m", scale: "panel", voiceLine: "v", searchPhrases: ["a"], commissioned: false, commissionNote: null },
    { seq: 9, title: "Invented", rationale: "", concept: "", mood: "", scale: "mural", voiceLine: "", searchPhrases: [], commissioned: false, commissionNote: null },
  ], live);
  assert.deepEqual(walls.map((w) => [w.seq, w.title]), [[1, "Entrance"], [2, "The quiet"]]);
  const n: Narrative = { direction: "The first sound", standfirst: "", theme: "", palette: [], motifs: [], journeys: [], walls, summary: "" };
  assert.equal(proposalHeadline(n, 2), "Rev. 2 · The first sound · 2 walls");
});
