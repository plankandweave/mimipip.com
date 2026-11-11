import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ART_PART_BYTES, LARGE_ART_FROM, MAX_ART_BYTES, artContentType, artPathBelongsTo,
  largeArtRejection, partCount, validPart,
} from "./large-art-upload-rules";

const MB = 1024 * 1024;

test("a 250 MB print master goes in 20 MB parts, each under Cloudflare's 100 MB request cap", () => {
  assert.equal(partCount(250 * MB), 13);
  assert.ok(ART_PART_BYTES < 100 * MB);
  assert.ok(LARGE_ART_FROM < 60 * MB, "the one-request route must never see a file over its own cap");
});

test("only JPG, PNG and TIFF are artwork, by extension", () => {
  assert.equal(artContentType("Kitchen band.TIF"), "image/tiff");
  assert.equal(artContentType("wall.jpeg"), "image/jpeg");
  assert.equal(artContentType("wall.psd"), null);
  assert.equal(largeArtRejection("wall.psd", 80 * MB), "Send the artwork as JPG, PNG or TIFF.");
  assert.equal(largeArtRejection("wall.png", 80 * MB), null);
  assert.match(largeArtRejection("wall.tif", MAX_ART_BYTES + 1) ?? "", /over 2 GB/);
});

test("part numbers stay inside the file", () => {
  assert.equal(validPart(1, 45 * MB), true);
  assert.equal(validPart(3, 45 * MB), true);
  assert.equal(validPart(4, 45 * MB), false);
  assert.equal(validPart(0, 45 * MB), false);
  assert.equal(validPart(1.5, 45 * MB), false);
});

test("an account can only finish uploads under its own slug", () => {
  assert.equal(artPathBelongsTo("vijay-sales/1729-ab12cd.tif", "vijay-sales"), true);
  assert.equal(artPathBelongsTo("homelane/1729-ab12cd.tif", "vijay-sales"), false);
  assert.equal(artPathBelongsTo("vijay-sales/../homelane/x.tif", "vijay-sales"), false);
  assert.equal(artPathBelongsTo("vijay-sales/sub/x.tif", "vijay-sales"), false);
});
