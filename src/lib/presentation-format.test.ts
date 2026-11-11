import { strict as assert } from "node:assert";
import { test } from "node:test";
import { contentTypeFor, extOf, readFormat, VIDEO_TYPES } from "./presentation-format";

// The regression these exist for: before video, every surface read the stored
// format as `=== "pdf" ? "pdf" : "html"`. Add a third format and that line does
// not fail — it quietly calls a film an HTML deck, serves it as text, and shows
// the client an empty frame.

test("a video is not read as html", () => {
  assert.equal(readFormat("video"), "video");
  assert.equal(readFormat("pdf"), "pdf");
  assert.equal(readFormat("html"), "html");
  // Anything unrecognised still falls back to html, as it always did.
  assert.equal(readFormat(null), "html");
  assert.equal(readFormat("exe"), "html");
});

test("a video is served as its own container, not as html", () => {
  assert.equal(contentTypeFor("c/1.mp4", "video"), "video/mp4");
  assert.equal(contentTypeFor("c/1.webm", "video"), "video/webm");
  assert.equal(contentTypeFor("c/1.MOV", "video"), "video/quicktime");
  assert.equal(contentTypeFor("c/1.m4v", "video"), "video/mp4");
  // An unknown extension on a video row still plays as mp4 rather than
  // downloading as a text file.
  assert.equal(contentTypeFor("c/1.bin", "video"), "video/mp4");
});

test("decks and PDFs are unchanged", () => {
  assert.equal(contentTypeFor("c/1.html", "html"), "text/html; charset=utf-8");
  assert.equal(contentTypeFor("c/1.pdf", "pdf"), "application/pdf");
});

test("extOf reads the last dot, lowercased", () => {
  assert.equal(extOf("a/b.c.MP4"), "mp4");
  assert.equal(extOf("noextension"), "");
});

test("the accepted containers are exactly the ones the UI offers", () => {
  assert.deepEqual(Object.keys(VIDEO_TYPES).sort(), ["m4v", "mov", "mp4", "webm"]);
});
