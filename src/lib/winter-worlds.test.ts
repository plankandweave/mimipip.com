import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { winterWorldsSeed } from "./catalogue-seeds-data";
import { WINTER_WORLDS_COLLECTION_HANDLE } from "./winter-worlds";
import { ROOM_RULES } from "./room-suitability";

/**
 * Winter Worlds is the original we show when a parent asks for a licensed
 * character (founder, 5 October 2026). Its own words must never borrow the
 * character's: a title, tag or caption that names the film turns an original
 * design into an imitation in the shopper's eyes and in a rights holder's.
 */
const FORBIDDEN = /\b(disney|frozen|elsa|anna|olaf|arendelle|pixar|princess|inspired)\b/i;

test("no Disney, character or 'inspired' wording anywhere in the collection", () => {
  const c = winterWorldsSeed.collection;
  for (const s of [c.title, c.description, c.rule_tag, c.handle]) assert.doesNotMatch(s, FORBIDDEN, s);
  for (const p of winterWorldsSeed.products) {
    for (const s of [p.handle, p.title, p.description, ...p.tags, ...p.images.map((i) => i.alt)]) {
      assert.doesNotMatch(s, FORBIDDEN, `${p.handle}: ${s}`);
    }
  }
});

// Never claims hand painting, and never talks to the shopper about how the
// pictures were made (founder, 12 October 2026: disclaimers scare buyers).
test("descriptions are honest and free of production disclaimers", () => {
  const DISCLAIMER = /visuali[sz]ation|\bAI\b|colour proof|artwork preparation/i;
  assert.doesNotMatch(winterWorldsSeed.collection.description, /hand.paint/i);
  assert.doesNotMatch(winterWorldsSeed.collection.description, DISCLAIMER);
  for (const product of winterWorldsSeed.products) {
    assert.doesNotMatch(product.description, /hand.paint/i, product.handle);
    assert.doesNotMatch(product.description, DISCLAIMER, product.handle);
  }
});

test("it is the collection the concierge reaches for", () => {
  assert.equal(winterWorldsSeed.collection.handle, WINTER_WORLDS_COLLECTION_HANDLE);
  for (const f of ["src/app/api/concierge/route.ts", "src/lib/voice-concierge.ts"]) {
    assert.ok(readFileSync(f, "utf8").includes(`"${WINTER_WORLDS_COLLECTION_HANDLE}"`), f);
  }
});

test("every design is fit for a child's room", () => {
  // The kids rule names "dark moody adult art" — a Dark colour tag would put a
  // design there by its own description.
  assert.match(ROOM_RULES.kids, /dark/i);
  for (const p of winterWorldsSeed.products) {
    assert.ok(p.tags.includes("Kids"), p.handle);
    assert.ok(!p.tags.includes("Dark"), `${p.handle}: tagged Dark`);
  }
});

test("the lead picture is never the canopy bed, whose posts hide the artwork", () => {
  for (const p of winterWorldsSeed.products) {
    const lead = p.images.find((i) => i.isFeatured)!;
    assert.ok(!lead.file.includes("canopy"), p.handle);
  }
});

test("every design has a playroom picture, so the Kids grid shows it on a wall", () => {
  // ROOM_SCENE_KEY["kids-wallpapers"] is "playroom": without one, the Kids
  // collection page falls back to the flat for that card.
  for (const p of winterWorldsSeed.products) {
    const play = p.images.filter((i) => i.sceneKey === "playroom");
    assert.equal(play.length, 1, p.handle);
    assert.ok(!play[0].isFeatured, `${p.handle}: the playroom never replaces the lead`);
  }
});
