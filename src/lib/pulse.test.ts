import { test } from "node:test";
import assert from "node:assert/strict";
import { blueprintReadiness, confirmSize, pulseStatus, wallReadiness, type WallFacts } from "./pulse";

const wall = (over: Partial<WallFacts> = {}): WallFacts => ({
  id: "w", name: "Entrance", photo: true, widthMm: 6000, heightMm: 3000, sizeSource: "measured",
  plan: true, brief: "The first thing a visitor sees: who we are.", dropped: false, ...over,
});

test("a wall is ready only with all four facts, and a spoken size never counts", () => {
  assert.equal(wallReadiness(wall()).ready, true);
  assert.deepEqual(wallReadiness(wall({ sizeSource: "spoken" })).missing, ["size"]);
  assert.deepEqual(wallReadiness(wall({ widthMm: null, heightMm: null, sizeSource: null })).missing, ["size"]);
  assert.deepEqual(wallReadiness(wall({ photo: false, plan: false })).missing, ["photo", "plan"]);
  assert.deepEqual(wallReadiness(wall({ brief: "ok" })).missing, ["brief"]);
  assert.equal(wallReadiness(wall({ sizeSource: "plan" })).measured, true);
});

test("Prism can start only when every live wall is ready", () => {
  const none = blueprintReadiness([]);
  assert.equal(none.canStart, false);
  assert.match(none.headline, /No walls yet/);
  assert.equal(none.ask, null);

  const mixed = blueprintReadiness([
    wall({ id: "a" }),
    wall({ id: "b", sizeSource: "spoken", plan: false }),
    wall({ id: "c", brief: null }),
    wall({ id: "d", dropped: true, photo: false }),
  ]);
  assert.equal(mixed.total, 3);
  assert.equal(mixed.ready, 1);
  assert.equal(mixed.dropped, 1);
  assert.equal(mixed.canStart, false);
  assert.deepEqual(mixed.gaps, { photo: 0, size: 1, plan: 1, brief: 1 });
  assert.equal(mixed.headline, "1 of 3 walls ready.");
  assert.equal(mixed.ask, "Still needed: sizes for 1 wall, the plan each of 1 wall sits on, a line on what 1 wall should do.");

  const all = blueprintReadiness([wall({ id: "a" }), wall({ id: "b" })]);
  assert.equal(all.canStart, true);
  assert.match(all.headline, /Prism can start/);
  assert.equal(all.ask, null);
});

test("the status moves to ready on its own and never resets a design in progress", () => {
  assert.equal(pulseStatus("collecting", { canStart: true }), "ready");
  assert.equal(pulseStatus("ready", { canStart: false }), "collecting");
  assert.equal(pulseStatus("designing", { canStart: false }), "designing");
  assert.equal(pulseStatus("presented", { canStart: true }), "presented");
});

test("confirming a spoken size makes it a fact; confirming nothing changes nothing", () => {
  const spoken = wall({ sizeSource: "spoken" });
  assert.equal(wallReadiness(confirmSize(spoken, "measured")).measured, true);
  const empty = wall({ widthMm: null, heightMm: null, sizeSource: null });
  assert.equal(confirmSize(empty, "plan").sizeSource, null);
});
