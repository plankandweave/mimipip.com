// A room tile's picture is the room its words name.
//
// 30 September 2026: the homepage showed "Shop by room · Powder Bathroom"
// over a toddler's playroom. The collection had been created in the database
// with no ROOM_SCENE_KEY entry, and every room surface read "no key" as "any
// render will do". These pin both halves of the fix: an unlisted room still
// resolves to its own scene, and a picture of any OTHER room is refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { roomKeyForQuery, sceneKeyForCollection, sceneKeyForRoom, showsRoom } from "./rooms";

const card = (imageScene: string | null, imageIsFlat = false) => ({ image: "x.jpg", imageIsFlat, imageScene });

test("an unlisted room collection resolves from its own handle", () => {
  assert.equal(sceneKeyForRoom("powder-bathroom"), "powder");
  assert.equal(sceneKeyForRoom("powder-room-wallpaper"), "powder");
  assert.equal(sceneKeyForRoom("some-handle", "Powder Bathroom"), "powder");
  assert.equal(sceneKeyForRoom("bathroom-wallpaper"), "bathroom");
});

test("listed rooms keep their explicit scene", () => {
  assert.equal(sceneKeyForRoom("kids-wallpapers"), "playroom");
  assert.equal(sceneKeyForRoom("hotels"), "reception");
  assert.equal(sceneKeyForRoom("piano-rooms"), "pianoroom");
  assert.equal(roomKeyForQuery("piano wall mural"), "pianoroom");
  assert.equal(showsRoom(card("pianoroom"), "pianoroom"), true);
  assert.equal(showsRoom(card("living"), "pianoroom"), false);
});

test("the Powder Bathroom tile refuses a toddler's room", () => {
  const key = sceneKeyForRoom("powder-bathroom");
  assert.equal(showsRoom(card("toddler"), key), false);
  assert.equal(showsRoom(card("powder"), key), true);
});

test("a room nobody can name shows nothing, never any render", () => {
  assert.equal(sceneKeyForRoom("zen-den"), undefined);
  assert.equal(showsRoom(card("bedroom"), undefined), false);
});

test("the flat and a variant scene never pass for the room", () => {
  assert.equal(showsRoom(card("bedroom", true), "bedroom"), false);
  assert.equal(showsRoom(card("bedroomduo"), "bedroom"), false);
});

test("a colour is not a room", () => {
  assert.equal(roomKeyForQuery("powder blue wallpaper"), undefined);
  assert.equal(sceneKeyForCollection({ handle: "powder-blue", kind: "color" }), undefined);
});

// 4 October 2026: a parent who types "children" rather than "kids" is asking
// for the same room, and must get the Kids-room boost and its pictures.
test("children's searches name the kids' room", () => {
  assert.equal(roomKeyForQuery("children's wallpaper"), "playroom");
  assert.equal(roomKeyForQuery("wallpaper for children"), "playroom");
  assert.equal(roomKeyForQuery("child's room"), "playroom");
  assert.equal(roomKeyForQuery("kids wallpaper"), "playroom");
});

test("a Ganesha is held off children's and bedroom pages, not the pooja room or foyer", async () => {
  const { heldOutOfRoom } = await import("./room-suitability");
  assert.equal(heldOutOfRoom("dwadasha-ganapati", "playroom"), true);
  assert.equal(heldOutOfRoom("dwadasha-ganapati-canvas", "nursery"), true);
  assert.equal(heldOutOfRoom("dwadasha-vinayaka", "bedroom"), true);
  assert.equal(heldOutOfRoom("dwadasha-ganapati", "pooja"), false);
  assert.equal(heldOutOfRoom("dwadasha-ganapati", "entryway"), false);
  assert.equal(heldOutOfRoom("dwadasha-ganapati", undefined), false);
  assert.equal(heldOutOfRoom("room-for-ideas-04", "playroom"), false);
});


test("every shoppable room has an explicit canonical render key", async () => {
  const { SCENARIOS } = await import("./studio-scenes");
  const { ROOM_SCENE_KEY } = await import("./rooms");
  for (const scenario of SCENARIOS) {
    if (scenario.collection) assert.ok(ROOM_SCENE_KEY[scenario.collection], `${scenario.collection} needs its room render key`);
  }
  assert.equal(sceneKeyForRoom("clubhouse-entrance"), "clubentrance");
  assert.equal(sceneKeyForRoom("residents-lounge"), "clublounge");
  assert.equal(sceneKeyForRoom("rooftop-sky-lounge"), "rooftoplounge");
});
