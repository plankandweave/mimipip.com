import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanProductAttributes } from "./seo";

test("piano-finish compatibility tags stay out of artwork subjects", () => {
  const attrs = cleanProductAttributes({
    subjects: ["Architecture", "Piano Finish: Black", "Piano Finish: Walnut"],
    rooms: ["Piano Rooms"],
  });
  assert.deepEqual(attrs.subjects, ["Architecture"]);
  assert.deepEqual(attrs.rooms, ["Piano Rooms"]);
});
