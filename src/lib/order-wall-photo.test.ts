import { test } from "node:test";
import assert from "node:assert/strict";
import { orderWallPhotoPath, orderWallPhotoUploadPath, sheetPhotoFor } from "./order-wall-photo";

test("the path is derived from the order id alone", () => {
  assert.equal(orderWallPhotoPath("f08dd528-223c-440c-b633-a5390e30cd0e"),
    "orders/f08dd528-223c-440c-b633-a5390e30cd0e/wall.jpg");
});

test("an upload never lands on the recorded photo's key", () => {
  assert.notEqual(orderWallPhotoUploadPath("x"), orderWallPhotoPath("x"));
});

test("the order's own wall photo wins over a survey photo of the same name", () => {
  assert.equal(sheetPhotoFor("own", "survey"), "own");
  assert.equal(sheetPhotoFor(undefined, "survey"), "survey");
  assert.equal(sheetPhotoFor(undefined, undefined), undefined);
});
