import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { CODE_RE, DEMO_PIECE, firstLanguage, looksLikeCode, missingLanguages, newCode, pieceReady, sonarPath, wallLanguages } from "./sonar-rules";

test("a code is ten unambiguous letters and digits, and only that is a code", () => {
  const c = newCode(randomBytes(10));
  assert.match(c, CODE_RE);
  assert.ok(!/[01oli]/.test(c));
  assert.equal(looksLikeCode(c), true);
  assert.equal(looksLikeCode("short"), false);
  assert.equal(looksLikeCode("ABCDEFGHJK"), false);
  assert.equal(sonarPath(c), `/sonar/${c}`);
});

test("a wall speaks English, the campus language, then Hindi", () => {
  assert.deepEqual(wallLanguages("kn"), ["en", "kn", "hi"]);
  assert.deepEqual(wallLanguages(null), ["en", "hi"]);
});

test("the first language is what was asked, else the phone's when the wall speaks it, else English", () => {
  const avail = wallLanguages("ta");
  assert.equal(firstLanguage(avail, "hi", "ta-IN"), "hi");
  assert.equal(firstLanguage(avail, null, "ta-IN"), "ta");
  assert.equal(firstLanguage(avail, null, "kn-IN"), "en");
  assert.equal(firstLanguage(avail, "fr", "en-GB"), "en");
});

test("missing languages are the ones without a spoken line", () => {
  assert.deepEqual(missingLanguages({ en: { text: "x", lineId: "1" } }, ["en", "kn", "hi"]), ["kn", "hi"]);
});

test("the demo piece fits a wall's breath", () => {
  assert.equal(pieceReady(DEMO_PIECE).ok, true);
  assert.equal(pieceReady("").ok, false);
  assert.equal(pieceReady("x".repeat(901)).ok, false);
});
