import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  clampDays, closedWalkMessage, looksLikeUuid, looksLikeWalkToken, prospectWalkPath, readMintAsk,
  readSince, REF_ALPHABET, walkAudioExt, walkLinkState, walkUrl, walkVideoExt,
} from "./prospect-walk";
import { hashWalkToken, newWalkRef, newWalkToken, walkDoorOk } from "./prospect-walk-token";

const WALK = "0f8fad5b-d9cb-469f-a165-70867728950e";

test("a token is 32 random bytes in base64url, passes the shape check, and is stored only as its sha256", () => {
  const t = newWalkToken();
  assert.equal(t.length, 43);
  assert.ok(looksLikeWalkToken(t));
  assert.notEqual(newWalkToken(), t);
  assert.match(hashWalkToken(t), /^[0-9a-f]{64}$/);
  assert.equal(hashWalkToken(t), hashWalkToken(t));
  for (const bad of ["", "short", "a".repeat(39), "a".repeat(65), `${"a".repeat(42)}/`, "../../etc/passwd-and-more-chars-to-make-it-long"]) {
    assert.equal(looksLikeWalkToken(bad), false, bad);
  }
});

test("a ref is ZYV-W- and six characters from the measure-link alphabet, with no look-alikes", () => {
  for (let i = 0; i < 200; i++) {
    const ref = newWalkRef();
    assert.match(ref, /^ZYV-W-[A-Z0-9]{6}$/);
    for (const c of ref.slice(6)) assert.ok(REF_ALPHABET.includes(c), c);
  }
  assert.equal(REF_ALPHABET, "ABCDEFGHJKMNPQRSTUVWXYZ23456789");
  for (const c of "IL01O") assert.equal(REF_ALPHABET.includes(c), false);
});

test("a link lives 30 days by default and never more than 60", () => {
  assert.equal(clampDays(undefined), 30);
  assert.equal(clampDays(null), 30);
  assert.equal(clampDays("x"), 30);
  assert.equal(clampDays(7), 7);
  assert.equal(clampDays(0), 1);
  assert.equal(clampDays(-4), 1);
  assert.equal(clampDays(90), 60);
  assert.equal(clampDays(14.6), 15);
});

test("state: revoked beats sent beats expired", () => {
  const now = Date.parse("2026-10-28T10:00:00Z");
  const future = "2026-11-27T10:00:00Z", past = "2026-10-01T10:00:00Z";
  assert.equal(walkLinkState({ revoked_at: null, submitted_at: null, expires_at: future }, now), "open");
  assert.equal(walkLinkState({ revoked_at: null, submitted_at: null, expires_at: past }, now), "expired");
  assert.equal(walkLinkState({ revoked_at: null, submitted_at: past, expires_at: past }, now), "submitted");
  assert.equal(walkLinkState({ revoked_at: past, submitted_at: past, expires_at: future }, now), "revoked");
  assert.equal(closedWalkMessage("open"), null);
  for (const s of ["expired", "revoked", "submitted", "unknown"] as const) assert.ok(closedWalkMessage(s));
});

test("files live under prospect-walks/<ref>/<walkId>/ and paths are built from ids only", () => {
  assert.equal(prospectWalkPath.video("ZYV-W-ABC234", WALK, "webm"), `prospect-walks/ZYV-W-ABC234/${WALK}/walk.webm`);
  assert.equal(prospectWalkPath.audio("ZYV-W-ABC234", WALK, "m4a"), `prospect-walks/ZYV-W-ABC234/${WALK}/narration.m4a`);
  assert.equal(prospectWalkPath.still("ZYV-W-ABC234", WALK, 3), `prospect-walks/ZYV-W-ABC234/${WALK}/mark-03.jpg`);
  assert.throws(() => prospectWalkPath.video("../x", WALK, "webm"));
  assert.throws(() => prospectWalkPath.video("ZYV-W-ABC234", "../../walkthroughs", "webm"));
  assert.throws(() => prospectWalkPath.video("ZYV-W-ABC234", WALK, "webm/../x"));
  assert.throws(() => prospectWalkPath.still("ZYV-W-ABC234", WALK, 0));
  assert.throws(() => prospectWalkPath.still("ZYV-W-ABC234", WALK, 1.5));
  assert.equal(walkVideoExt("video/webm;codecs=vp8,opus"), "webm");
  assert.equal(walkVideoExt("video/mp4"), "mp4");
  assert.equal(walkVideoExt("text/html"), null);
  assert.equal(walkAudioExt("audio/mp4"), "m4a");
  assert.equal(walkAudioExt("audio/../../x"), null);
  assert.ok(looksLikeUuid(WALK));
  assert.equal(looksLikeUuid("x"), false);
  assert.equal(looksLikeUuid(42), false);
});

test("the OS door opens only on the exact shared secret, and never when none is configured", () => {
  assert.equal(walkDoorOk("s3cret", "s3cret"), true);
  assert.equal(walkDoorOk("s3cre", "s3cret"), false);
  assert.equal(walkDoorOk("S3CRET", "s3cret"), false);
  assert.equal(walkDoorOk("", "s3cret"), false);
  assert.equal(walkDoorOk(null, "s3cret"), false);
  assert.equal(walkDoorOk("", ""), false);
  assert.equal(walkDoorOk("anything", undefined), false);
});

test("a mint needs a company and a recipient email; the rest is trimmed, capped and defaulted", () => {
  assert.deepEqual(readMintAsk({ recipientEmail: "a@b.co" }), { ok: false, error: "company is required" });
  assert.equal(readMintAsk({ company: "Orange Health Labs", recipientEmail: "not-an-email" }).ok, false);
  assert.equal(readMintAsk({ company: "X", recipientEmail: "a@b.co", osConversationId: -3 }).ok, false);
  assert.equal(readMintAsk(null).ok, false);
  const r = readMintAsk({
    company: "  Orange Health Labs ", recipientEmail: " Basavaraj@OrangeHealth.in ", recipientName: "Basavaraj",
    brief: "Reception and the patient corridors", osConversationId: 412, days: 90, by: "OS design agent",
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.ask, {
    company: "Orange Health Labs", recipientEmail: "basavaraj@orangehealth.in", recipientName: "Basavaraj",
    brief: "Reception and the patient corridors", osConversationId: 412, days: 60, by: "OS design agent",
  });
  const d = readMintAsk({ company: "X", recipientEmail: "a@b.co" });
  assert.ok(d.ok && d.ask.days === 30 && d.ask.by === "OS" && d.ask.osConversationId === null && d.ask.brief === null);
});

test("the url is the site's /walk/<token>, and submittedSince must be a real time", () => {
  assert.equal(walkUrl("https://zyvorah.com", "tok"), "https://zyvorah.com/walk/tok");
  assert.equal(readSince(null), null);
  assert.equal(readSince("yesterday-ish"), null);
  assert.equal(readSince("2026-10-28T00:00:00+05:30"), "2026-10-27T18:30:00.000Z");
});
