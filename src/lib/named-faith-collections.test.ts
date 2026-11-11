import { test } from "node:test";
import assert from "node:assert/strict";
import { getNamedFaithCards, isNamedFaithCollection } from "./named-faith-collections";

test("named collection opt-in refuses general discovery handles without a database read", async () => {
  for (const handle of ["wall-art", "floral-wallpaper", "living-room-wallpaper", "new", "__proto__", "constructor"]) {
    assert.equal(isNamedFaithCollection(handle), false);
    assert.deepEqual(await getNamedFaithCards(handle), []);
  }
});

test("the approved named faith collections can be selected deliberately", () => {
  for (const handle of ["dwadasha", "divine-darshan", "sanatan-dharam", "jain-temples", "jain-temple-walls", "jain-temple-ceilings"]) {
    assert.equal(isNamedFaithCollection(handle), true);
  }
});
