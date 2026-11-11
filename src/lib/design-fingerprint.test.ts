import { test } from "node:test";
import assert from "node:assert/strict";
import { duplicateMessage, onePerArtwork, sha256Hex } from "./design-fingerprint-rules";

test("sha256Hex is the standard SHA-256 of the exact bytes", async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.notEqual(await sha256Hex(new Uint8Array([1, 2, 3])), await sha256Hex(new Uint8Array([1, 2, 4])));
});

test("onePerArtwork keeps the first row of each fingerprint — the EBD Gurgaon 5–12 pairs", () => {
  const rows = [
    { id: "ARKETN", content_sha256: "9d80" },
    { id: "ASS6ZA", content_sha256: "04a6" },
    { id: "QE9F6C", content_sha256: "9d80" },
    { id: "old-1", content_sha256: null },
    { id: "old-2" },
    { id: "DYEAE5", content_sha256: "04a6" },
  ];
  assert.deepEqual(onePerArtwork(rows).map((r) => r.id), ["ARKETN", "ASS6ZA", "old-1", "old-2"]);
});

test("a refused file names the design already in the library", () => {
  assert.match(duplicateMessage({ code: "ZYVS-ARKETN", title: "5" }), /already in the library as ZYVS-ARKETN/);
  assert.match(duplicateMessage({ code: null, title: "Lobby" }), /"Lobby"/);
});
