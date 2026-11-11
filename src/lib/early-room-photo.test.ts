import { test } from "node:test";
import assert from "node:assert/strict";
import { EARLY_ROOM_PHOTO_SCRIPT, EARLY_ROOM_PHOTO_KEY, ROOM_PHOTO_INPUT_ID } from "./early-room-photo";

test("the pre-hydration script watches the upload input and stashes its file on window", () => {
  assert.ok(EARLY_ROOM_PHOTO_SCRIPT.includes(`"${ROOM_PHOTO_INPUT_ID}"`), "keyed on the input id");
  assert.ok(EARLY_ROOM_PHOTO_SCRIPT.includes(`window.${EARLY_ROOM_PHOTO_KEY}=`), "stashes on window");
  // Listens at the document in the capture phase so it outlives an input that
  // hydration replaces.
  assert.ok(/document\.addEventListener\("change",.*,true\)/.test(EARLY_ROOM_PHOTO_SCRIPT));
  assert.doesNotThrow(() => new Function(EARLY_ROOM_PHOTO_SCRIPT), "parses as JavaScript");
});
