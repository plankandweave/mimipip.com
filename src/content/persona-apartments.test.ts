import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PERSONA_APARTMENTS } from "./persona-apartments";
import { homeBedroomCount, shopConceptsForSegment } from "../lib/shop-concepts";

test("approved persona homes are discoverable as two-bedroom homes with six purchasable rooms", () => {
  const homes = shopConceptsForSegment("homes");
  assert.equal(PERSONA_APARTMENTS.length, 5);
  const handles = PERSONA_APARTMENTS.flatMap(home => {
    assert.ok(homes.some(item => item.slug === home.slug));
    assert.equal(homeBedroomCount(home.slug), 2);
    assert.equal(home.rooms.length, 6);
    assert.equal(home.rooms.filter(room => room.wipeable).length, 1);
    assert.equal(home.rooms.find(room => room.wipeable)?.key, "bathroom");
    return home.rooms.map(room => room.handle);
  });
  assert.equal(new Set(handles).size, 30);
  const seed = readFileSync("supabase/seed/persona-apartments.sql", "utf8");
  for (const handle of handles) assert.ok(seed.includes(handle));
  assert.match(seed, /case when item.wipeable then 250 else standard_rate end/);
  assert.match(seed, /item.n,false,true/);
});
