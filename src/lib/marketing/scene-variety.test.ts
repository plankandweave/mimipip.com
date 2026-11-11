// A chapter must not show the same kind of room three times, and a design must
// not lead in a room it does not belong in. Both were live on 25 Sep 2026:
// the Calm week composed three living rooms ("all three sofas"), and a
// ceremonial bull mural led on a bedroom ("no one's going to put a wallpaper
// like this in their bedroom ever").
//
//   npx tsx --test src/lib/marketing/scene-variety.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseLeadScene, roomOfScene } from "./pipeline";

const B = "https://zyvorah.com/media/product-images";
// The real render sets, copied from the catalogue.
const AZURE = [
  `${B}/azure-depths/Zyvorah-Azure-Depths-Living-room.png`,
  `${B}/azure-depths/Zyvorah-Azure-Depths-Open-plan-workstations.png`,
  `${B}/azure-depths/Zyvorah-Azure-Depths-Master-bedroom.png`,
  `${B}/azure-depths/Zyvorah-Azure-Depths-Gym.png`,
  `${B}/azure-depths/Zyvorah-Azure-Depths-Cafeteria-pantry.png`,
];
const TRANQUIL = [
  `${B}/tranquil-depths/Zyvorah-Tranquil-Depths-Living-room.png`,
  `${B}/tranquil-depths/Zyvorah-Tranquil-Depths-Master-bedroom.png`,
  `${B}/tranquil-depths/Zyvorah-Tranquil-Depths-Wellness-spa.png`,
];
const CORAL = [
  `${B}/coral-reverie-ii/Zyvorah-Coral-Reverie-II-Living-room.png`,
  `${B}/coral-reverie-ii/Zyvorah-Coral-Reverie-II-Master-bedroom.png`,
];
const SACRED_STEED = [
  `${B}/sacred-steed/scene-pooja.png`,
  `${B}/sacred-steed/scene-bedroom.png`,
  `${B}/sacred-steed/scene-living.png`,
];

test("rooms are read from the filename, longest match winning", () => {
  assert.equal(roomOfScene(`${B}/x/Zyvorah-X-Master-bedroom.png`), "bedroom");
  // A hotel front desk is not an office.
  assert.equal(roomOfScene(`${B}/x/Zyvorah-X-Office-reception.png`), "hotel");
  assert.equal(roomOfScene(`${B}/x/scene-pooja.png`), "pooja");
  assert.equal(roomOfScene(`${B}/x/untitled-abc123.png`), null);
});

test("the Calm week does not compose three living rooms", () => {
  // The three feed slots of one chapter, in order, each told what came before.
  const used: string[] = [];
  const picks: string[] = [];
  for (const [i, scenes] of [AZURE, TRANQUIL, CORAL].entries()) {
    const url = chooseLeadScene(scenes, { chapterIndex: i, usedRooms: [...used] });
    assert.ok(url, "a lead scene must be chosen");
    const room = roomOfScene(url!)!;
    picks.push(room);
    used.push(room);
  }
  assert.equal(new Set(picks).size, 3, `three slots must show three rooms, got ${picks.join(", ")}`);
  // And not three of the same KIND of space either.
  assert.ok(!picks.every((r) => r === "living"), "three sofas is the failure this prevents");
});

test("a devotional design leads in the pooja room, never the bedroom", () => {
  const url = chooseLeadScene(SACRED_STEED, { chapterIndex: 1, usedRooms: ["living"] });
  assert.equal(roomOfScene(url!), "pooja");
});

test("choosing is deterministic — the same plan composes the same way twice", () => {
  const a = chooseLeadScene(AZURE, { chapterIndex: 2, usedRooms: ["living"] });
  const b = chooseLeadScene(AZURE, { chapterIndex: 2, usedRooms: ["living"] });
  assert.equal(a, b);
});

test("a design with no usable renders returns nothing rather than guessing", () => {
  assert.equal(chooseLeadScene([]), null);
});
