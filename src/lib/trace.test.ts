import { test } from "node:test";
import assert from "node:assert/strict";
import {
  closedLinkMessage, describeWalk, joinTranscripts, looksLikeTraceToken, mmss,
  pieceAt, PIECE_SECONDS, transcriptCoverage,
} from "./trace";

test("a moment of the walk lands in the right piece", () => {
  assert.deepEqual(pieceAt(0), { seq: 1, atSeconds: 0 });
  assert.deepEqual(pieceAt(179.5), { seq: 1, atSeconds: 179.5 });
  assert.deepEqual(pieceAt(PIECE_SECONDS), { seq: 2, atSeconds: 0 });
  assert.deepEqual(pieceAt(PIECE_SECONDS * 4 + 12), { seq: 5, atSeconds: 12 });
  assert.deepEqual(pieceAt(-3), { seq: 1, atSeconds: 0 });
});

test("a walk is described in one line", () => {
  const pieces = [
    { seq: 1, seconds: 180, hasVideo: true, hasAudio: true, transcribed: true },
    { seq: 2, seconds: 180, hasVideo: true, hasAudio: true, transcribed: false },
    { seq: 3, seconds: 61, hasVideo: true, hasAudio: true, transcribed: true },
  ];
  assert.equal(describeWalk({ pieces, marks: 7 }), "7 min · 3 pieces · 7 walls marked");
  assert.equal(describeWalk({ pieces: [pieces[0]], marks: 1 }), "3 min · 1 piece · 1 wall marked");
  assert.equal(describeWalk({ pieces: [{ ...pieces[2], seconds: 40 }], marks: 0 }), "40 sec · 1 piece · 0 walls marked");
  assert.deepEqual(transcriptCoverage(pieces), { done: 2, total: 3, complete: false });
  assert.equal(transcriptCoverage([]).complete, false);
});

test("tokens are shape-checked before any lookup", () => {
  assert.equal(looksLikeTraceToken("A".repeat(43)), true);
  assert.equal(looksLikeTraceToken("short"), false);
  assert.equal(looksLikeTraceToken("../../etc/passwd" + "A".repeat(40)), false);
});

test("a closed link explains itself without leaking", () => {
  assert.equal(closedLinkMessage("ok"), null);
  assert.match(closedLinkMessage("expired")!, /expired/);
  assert.match(closedLinkMessage("revoked")!, /no longer active/);
  assert.equal(closedLinkMessage("unknown"), "This link is not active.");
});

test("transcripts join in spoken order with gaps visible", () => {
  const joined = joinTranscripts([
    { seq: 2, transcript: "this is the library" },
    { seq: 1, transcript: null },
  ]);
  assert.equal(joined, "[piece 1]\n(no words transcribed yet)\n\n[piece 2]\nthis is the library");
  assert.equal(mmss(125), "2:05");
});
