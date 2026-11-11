import assert from "node:assert/strict";
import test from "node:test";
import { createBtSession, verifyBtSession } from "./bt-access";

test("Bhitti session accepts only an untampered current signature", async () => {
  const secret = "a-long-private-test-secret-that-is-never-deployed";
  const session = await createBtSession(secret);
  assert.equal(await verifyBtSession(session, secret), true);
  assert.equal(await verifyBtSession(`${session}x`, secret), false);
  assert.equal(await verifyBtSession(session, `${secret}x`), false);
  assert.equal(await verifyBtSession(undefined, secret), false);
});
