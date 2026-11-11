import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chatMessageId, confirmedWrite } from "./concierge-records";
import { clientEvent, UUID } from "./concierge-events";
import { sendConciergeEvent } from "./concierge-tracking";

const sessionId = "11111111-2222-4333-8444-555555555555";
const turnId = "22222222-2222-4333-8444-555555555555";
test("a lost write response can retry without duplicating or crossing customer identities", async () => {
  const rows = new Set<string>();
  let calls = 0;
  const id = chatMessageId("customer-a", sessionId, turnId, "user");
  assert.match(id, UUID);
  assert.notEqual(id, chatMessageId("customer-b", sessionId, turnId, "user"));
  assert.notEqual(id, chatMessageId("customer-a", sessionId, turnId, "assistant"));
  const saved = await confirmedWrite(async () => {
    rows.add(id);
    if (++calls === 1) throw new Error("response lost after commit");
    return { error: null };
  }, () => assert.fail("retry should recover"));
  assert.equal(saved, true);
  assert.equal(calls, 2);
  assert.equal(rows.size, 1);
});
test("returned database errors are failures, with a bounded retry and visible terminal failure", async () => {
  let calls = 0, failures = 0;
  assert.equal(await confirmedWrite(async () => { calls++; return { error: { message: "unavailable" } }; }, () => failures++), false);
  assert.equal(calls, 2);
  assert.equal(failures, 1);
});
test("public events cannot forge server outcomes or smuggle private content", () => {
  const value = { id: turnId, sessionId, event: "opened", email: "private@example.com", code: "secret", content: "private", url: "private", isTest: true };
  assert.deepEqual(clientEvent(value), { id: turnId, sessionId, event: "opened", isTest: true });
  assert.equal(clientEvent({ ...value, event: "reply_saved" }), null);
  assert.equal(clientEvent({ ...value, sessionId: "not-a-uuid" }), null);
  assert.equal(clientEvent(null), null);
});
test("a browser beacon retries the same event id and never loops on rejection", async () => {
  const bodies: string[] = [];
  const ok = await sendConciergeEvent({ sessionId }, "opened", {}, async body => {
    bodies.push(body);
    return new Response(null, { status: bodies.length === 1 ? 503 : 204 });
  });
  assert.equal(ok, true);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  let attempts = 0;
  assert.equal(await sendConciergeEvent({ sessionId }, "opened", {}, async () => { attempts++; return new Response(null, { status: 400 }); }), false);
  assert.equal(attempts, 1);
});
test("the verified gate precedes transcript/model work and every completed reply awaits storage", () => {
  const route = readFileSync("src/app/api/concierge/route.ts", "utf8");
  assert.ok(route.indexOf("if (!gate.ok)") < route.indexOf("const userSaved = await saveConciergeMessage"));
  assert.ok(route.indexOf("const userSaved = await saveConciergeMessage") < route.indexOf("new Anthropic("));
  assert.equal((route.match(/await saveReply\(/g) ?? []).length, 3);
  assert.doesNotMatch(route, /after\(/);
  const ui = readFileSync("src/components/Concierge.tsx", "utf8");
  assert.match(ui, /STORAGE_KEY}:diagnostic/);
});
