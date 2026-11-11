// The 25 September 2026 grid: a chapter called "The Puja Room" whose pictures
// were home offices, a chapter called "The Welcome" whose pictures were
// boardrooms and hotel lobbies, and devotional designs shown as framed canvas
// prints inside a wallpaper campaign. Nothing threw. The captions and the
// pictures simply disagreed, and only a person looking at the grid could tell.
//
// sceneMatchesRoom is what a plan slot's art.scene is checked against, so these
// cases are the failure itself, pinned. Run with the repo's tsx:
//   npx tsx --test src/lib/marketing/scene-room.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { sceneMatchesRoom, directivesFromNotes } from "./pipeline";

const LOTUS_INDIGO_FEATURED =
  "https://zyvorah.com/media/product-images/lotus-indigo/Zyvorah-Lotus-Indigo-Home-office.png";
const GOLDEN_SURGE_FEATURED =
  "https://zyvorah.com/media/product-images/golden-surge/Zyvorah-Golden-Surge-Boardroom-cabins.png";
const MAHARAJ_FEATURED =
  "https://zyvorah.com/media/product-images/maharaj-s-banner/Zyvorah-Maharaj-s-Banner-Hotel-lobby.png";
const KRISHNA_POOJA =
  "https://zyvorah.com/media/product-images/vishnu-s-grace/Zyvorah-Vishnu-s-Grace-Pooja-room.png";
const GOLDEN_SURGE_ENTRY =
  "https://zyvorah.com/media/product-images/golden-surge/scene-entryway.png";

test("the exact renders that produced the bad grid are refused by their chapter", () => {
  // These three were composed under puja/entrance captions on 25 Sep 2026.
  assert.equal(sceneMatchesRoom(LOTUS_INDIGO_FEATURED, "pooja"), false);
  assert.equal(sceneMatchesRoom(GOLDEN_SURGE_FEATURED, "entrance"), false);
  assert.equal(sceneMatchesRoom(MAHARAJ_FEATURED, "entrance"), false);
});

test("the right render of the same design is accepted", () => {
  assert.equal(sceneMatchesRoom(KRISHNA_POOJA, "pooja"), true);
  assert.equal(sceneMatchesRoom(GOLDEN_SURGE_ENTRY, "entrance"), true);
});

test("a commercial reception never satisfies a domestic entrance", () => {
  // The politer version of the same mistake: a reception lobby under a caption
  // about welcoming guests into a home.
  assert.equal(
    sceneMatchesRoom(
      "https://zyvorah.com/media/product-images/dual-momentum/Zyvorah-Dual-Momentum-Reception-lobby.png",
      "entrance",
    ),
    false,
  );
});

test("an unknown room name matches nothing rather than everything", () => {
  assert.equal(sceneMatchesRoom(KRISHNA_POOJA, "crockery"), false);
});

test("a kids' play space is not a spa", () => {
  assert.equal(sceneMatchesRoom("https://x/zyvorah-3d-paper-floral-wall-kids-play-space.png", "spa"), false);
  assert.equal(sceneMatchesRoom("https://x/Zyvorah-Classic-Maritime-Sailing-Ships-Wellness-spa.png", "spa"), true);
  assert.equal(sceneMatchesRoom("https://x/scene-spa@1200.webp", "spa"), true);
});

test("a workplace is a corporate floor, never a study at home (LinkedIn, 26 Sep 2026)", () => {
  assert.equal(sceneMatchesRoom("https://x/zyvorah-gujarat-gateway-home-office.png", "workplace"), false);
  assert.equal(sceneMatchesRoom("https://x/scene-boardroom.png", "workplace"), true);
  // "office" is unchanged, so slots already naming it compose as before.
  assert.equal(sceneMatchesRoom("https://x/zyvorah-gujarat-gateway-home-office.png", "office"), true);
});

test("a note naming the spa still asks for the spa; 'span' does not", () => {
  assert.equal(directivesFromNotes(["show it in the spa."]).scene, "spa");
  assert.notEqual(directivesFromNotes(["show a wider span of the wall"]).scene, "spa");
});
