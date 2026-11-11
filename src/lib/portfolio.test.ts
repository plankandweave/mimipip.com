// The building → floor tree, pinned.
//
// The grouping matters because a portfolio account's whole dashboard is drawn
// from it: a space attached to the wrong building is a survey sent to the wrong
// address, and a re-sort here would fight the ordering the API already applied.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  areaLabel, groupAreasByStore, nextStep, type AreaRow, type Progress,
} from "./portfolio";

const area = (id: string, storeId: string, floor: string | null, name: string): AreaRow => ({
  id, account_id: "acc", store_id: storeId, code: id, floor, name,
  sort: 0, brief: null, notes: null, active: true,
  created_by_email: null, created_at: "", updated_at: "",
});

test("a floor and a space read as one line; a single-level space stands alone", () => {
  assert.equal(areaLabel({ floor: "Level 12", name: "Lift lobby" }), "Level 12 · Lift lobby");
  assert.equal(areaLabel({ floor: null, name: "Main arrival" }), "Main arrival");
});

test("spaces land under their own building, and a building with none is still shown", () => {
  const stores = [{ id: "one-bkc" }, { id: "bkc-2" }, { id: "empty-tower" }];
  const areas = [
    area("a1", "one-bkc", "Ground", "Main arrival"),
    area("a2", "bkc-2", "Level 3", "Lift lobby"),
    area("a3", "one-bkc", "Level 12", "Lift lobby"),
  ];

  const tree = groupAreasByStore(stores, areas);

  assert.deepEqual(tree.map((t) => t.store.id), ["one-bkc", "bkc-2", "empty-tower"]);
  assert.deepEqual(tree[0].areas.map((a) => a.id), ["a1", "a3"]);
  assert.deepEqual(tree[1].areas.map((a) => a.id), ["a2"]);
  // A building with no spaces yet must survive the grouping — it is the one
  // you have just added and are about to put a floor into.
  assert.deepEqual(tree[2].areas, []);
});

test("the order each list arrived in is preserved, never re-sorted", () => {
  // The API orders by sort, then floor, then name. If this function sorted too,
  // the two would disagree the moment either changed.
  const stores = [{ id: "t" }];
  const areas = [
    area("second", "t", "Level 2", "Zeta"),
    area("first", "t", "Level 1", "Alpha"),
  ];
  assert.deepEqual(
    groupAreasByStore(stores, areas)[0].areas.map((a) => a.id),
    ["second", "first"],
  );
});

test("a space pointing at a building that is not in the list is dropped, not crashed on", () => {
  // Deactivating a building leaves its spaces behind; the tree must not throw
  // on them, and must not invent a card to hold them either.
  const tree = groupAreasByStore([{ id: "live" }], [area("orphan", "gone", null, "Lobby")]);
  assert.equal(tree.length, 1);
  assert.deepEqual(tree[0].areas, []);
});

// ─── The prompt that replaces training ──────────────────────────────────────
//
// Nobody is going to be shown how to use this. The dashboard has to say the one
// thing to do now, in the account's own names, with the button that does it. So
// the ladder is pinned: every rung must be reachable, must name something the
// person recognises, and must never ask for something they cannot press.

const progress = (over: Partial<Progress> = {}): Progress => ({
  buildings: 0, areas: 0, walls: 0, wallsWithPhoto: 0,
  designs: 0, studies: 0, approvedStudies: 0,
  firstBuildingName: null, firstAreaLabel: null, firstAreaId: null,
  ...over,
});

test("an empty account is told to start with the building", () => {
  const s = nextStep(progress());
  assert.equal(s.id, "add-building");
  assert.equal(s.tab, "buildings");
  assert.ok(s.cta, "the first step must be pressable");
});

test("each rung of the ladder is reachable, in order", () => {
  const rungs: [Partial<Progress>, string][] = [
    [{}, "add-building"],
    [{ buildings: 1 }, "add-area"],
    [{ buildings: 1, areas: 1 }, "walk"],
    [{ buildings: 1, areas: 1, walls: 3 }, "photograph"],
    [{ buildings: 1, areas: 1, walls: 3, wallsWithPhoto: 3 }, "await-library"],
    [{ buildings: 1, areas: 1, walls: 3, wallsWithPhoto: 3, designs: 8 }, "study"],
    [{ buildings: 1, areas: 1, walls: 3, wallsWithPhoto: 3, designs: 8, studies: 2 }, "approve"],
    [{ buildings: 1, areas: 1, walls: 3, wallsWithPhoto: 3, designs: 8, studies: 2, approvedStudies: 1 }, "share"],
  ];
  for (const [state, id] of rungs) {
    assert.equal(nextStep(progress(state)).id, id, `expected ${id}`);
  }
});

test("the prompt uses the account's own names, not generic ones", () => {
  const s = nextStep(progress({ buildings: 1, firstBuildingName: "One BKC" }));
  assert.ok(s.title.includes("One BKC"), `"${s.title}" should name the building`);

  const walk = nextStep(progress({
    buildings: 1, areas: 1,
    firstAreaLabel: "Level 12 · Lift lobby", firstAreaId: "area-1",
  }));
  assert.ok(walk.title.includes("Level 12 · Lift lobby"), `"${walk.title}" should name the space`);
  // The button opens THAT space, not merely the tab it lives on — otherwise the
  // person is told where to go and then has to find it themselves.
  assert.equal(walk.openAreaId, "area-1");
});

test("when the next move is ours, it says so and offers nothing to press", () => {
  const s = nextStep(progress({ buildings: 1, areas: 1, walls: 3, wallsWithPhoto: 3 }));
  assert.equal(s.id, "await-library");
  assert.equal(s.waitingOnUs, true);
  // An instruction nobody can act on is worse than silence — they hunt for the
  // control it implies.
  assert.equal(s.cta, null);
  assert.equal(s.tab, null);
});

test("every step says what to do and why, in plain words", () => {
  const states: Partial<Progress>[] = [
    {}, { buildings: 1 }, { buildings: 1, areas: 1 },
    { buildings: 1, areas: 1, walls: 2 },
    { buildings: 1, areas: 1, walls: 2, wallsWithPhoto: 2 },
    { buildings: 1, areas: 1, walls: 2, wallsWithPhoto: 2, designs: 5 },
    { buildings: 1, areas: 1, walls: 2, wallsWithPhoto: 2, designs: 5, studies: 1 },
    { buildings: 1, areas: 1, walls: 2, wallsWithPhoto: 2, designs: 5, studies: 1, approvedStudies: 1 },
  ];
  for (const st of states) {
    const s = nextStep(progress(st));
    assert.ok(s.title.length > 0 && s.title.length < 60, `title off: "${s.title}"`);
    assert.ok(s.body.length > 20, `body too thin for ${s.id}`);
    // No jargon from our side of the fence.
    for (const word of ["batch", "area_id", "quad", "seq", "survey", "allocator"]) {
      assert.ok(!s.body.toLowerCase().includes(word), `"${word}" leaked into ${s.id}`);
      assert.ok(!s.title.toLowerCase().includes(word), `"${word}" leaked into ${s.id}`);
    }
  }
});

test("customer design review opens Proposals", () => {
  for (const approvedStudies of [0, 1]) {
    const next = nextStep(progress({buildings:1, areas:1, walls:1, wallsWithPhoto:1, designs:1, studies:1, approvedStudies}));
    assert.equal(next.tab, "proposals");
    assert.equal(next.cta, "Open Proposals");
  }
});
