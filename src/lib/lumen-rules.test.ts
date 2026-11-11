import { test } from "node:test";
import assert from "node:assert/strict";
import { cutReady, fillNarration, pictureFor, runningTime, sceneSeconds, sceneSkeleton, scriptReady } from "./lumen-rules";

const walls = [
  { id: "b", seq: 2, name: "Library", location: "Block A, first floor", title: "A quiet shelf of rivers" },
  { id: "a", seq: 1, name: "Entrance", location: null, title: "Where it begins" },
];

test("the skeleton opens, walks every wall in seq order, and closes", () => {
  const s = sceneSkeleton("Rivers of the Deccan", "Presidency University", walls);
  assert.deepEqual(s.map((x) => x.key), ["opening", "wall:1", "wall:2", "closing"]);
  assert.equal(s[1]!.caption, "Entrance");
  assert.equal(s[2]!.caption, "Library · Block A, first floor");
  assert.equal(s[0]!.heading, "Rivers of the Deccan");
});

test("narration is filled by key, trimmed and capped; unknown keys are dropped", () => {
  const s = sceneSkeleton("D", "C", walls);
  const filled = fillNarration(s, [{ key: "wall:1", narration: "  Hello.  " }, { key: "wall:9", narration: "x" }]);
  assert.equal(filled[1]!.narration, "Hello.");
  assert.equal(filled.length, 4);
  assert.equal(scriptReady({ title: "t", scenes: filled }).ok, false);
  const all = fillNarration(s, s.map((x) => ({ key: x.key, narration: "Words." })));
  assert.equal(scriptReady({ title: "t", scenes: all }).ok, true);
});

test("a scene lasts its narration plus a breath, never under five seconds", () => {
  assert.equal(sceneSeconds(null), 6);
  assert.equal(sceneSeconds(2), 5);
  assert.equal(sceneSeconds(12.5), 13.7);
});

test("the picture is the mockup, then the photograph, then the art", () => {
  assert.equal(pictureFor({ renderUrl: "r", photoUrl: "p", artUrl: "a" })?.kind, "render");
  assert.equal(pictureFor({ renderUrl: null, photoUrl: "p", artUrl: "a" })?.kind, "photo");
  assert.equal(pictureFor({ renderUrl: null, photoUrl: null, artUrl: "a" })?.kind, "art");
  assert.equal(pictureFor({ renderUrl: null, photoUrl: null, artUrl: null }), null);
});

test("the cut waits for every recording and every wall's picture", () => {
  const s = sceneSkeleton("D", "C", walls).map((x) => ({ ...x, narration: "Words." }));
  const script = { title: "t", scenes: s };
  const pics = new Map([["a", { url: "x" }], ["b", { url: "y" }]]);
  const r1 = cutReady(script, [{ key: "opening", path: "o" }], pics);
  assert.equal(r1.ok, false);
  assert.match((r1 as { reason: string }).reason, /Not yet recorded/);
  const rec = s.map((x) => ({ key: x.key, path: x.key }));
  const r2 = cutReady(script, rec, new Map([["a", { url: "x" }], ["b", null]]));
  assert.match((r2 as { reason: string }).reason, /No picture for: Library/);
  assert.equal(cutReady(script, rec, pics).ok, true);
});

test("running time reads as minutes and seconds", () => {
  assert.equal(runningTime([30, 30, 5]), "1 min 05 s");
  assert.equal(runningTime([12]), "12 s");
});
