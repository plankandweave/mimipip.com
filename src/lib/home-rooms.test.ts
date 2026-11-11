import test from "node:test";
import assert from "node:assert/strict";

import { HOME_ROOM_HANDLES, homeMenuCollections, homeRoomCollectionsFromScenes } from "./home-rooms";

// The header's Homes menu is an allow-list, so a room collection the studio
// renders as a HOME can go live on /rooms and never appear under "By Room".
// Piano Rooms did exactly that (12 October 2026). The studio's scene taxonomy
// already says which rooms are residential; the menu must carry all of them.
test("every residential studio room is on the Homes menu", () => {
  const missing = homeRoomCollectionsFromScenes().filter((h) => !HOME_ROOM_HANDLES.has(h));
  assert.deepEqual(missing, [], `room collections missing from HOME_ROOM_HANDLES: ${missing.join(", ")}`);
});

test("piano rooms and the ceiling range are on the Homes menu", () => {
  assert.ok(HOME_ROOM_HANDLES.has("piano-rooms"));
  assert.ok(HOME_ROOM_HANDLES.has("ceiling-wallpaper"));
});

// Ceiling is a STYLE collection in the database, not a room: a menu that read
// only the room list would drop it however the allow-list was written.
test("the Homes menu finds Ceiling in the style list, after the rooms", () => {
  const rooms = [
    { handle: "living-room-wallpaper" },
    { handle: "hotels" },
    { handle: "piano-rooms" },
  ];
  const styles = [{ handle: "abstract" }, { handle: "ceiling-wallpaper" }];
  assert.deepEqual(
    homeMenuCollections(rooms, styles).map((c) => c.handle),
    ["living-room-wallpaper", "piano-rooms", "ceiling-wallpaper"],
  );
});

test("a home collection listed under two kinds appears once", () => {
  const twice = [{ handle: "ceiling-wallpaper" }];
  assert.equal(homeMenuCollections(twice, twice).length, 1);
});
