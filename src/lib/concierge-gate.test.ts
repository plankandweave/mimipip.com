import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { conciergeGate, type ConciergeGateDeps } from "./concierge-gate";

// No concierge conversation starts without a VERIFIED email (founder,
// 6 Oct 2026). The API must refuse BEFORE any model call, and a typed-in,
// unproved address must never be enough.

const SESSION = "11111111-2222-4333-8444-555555555555";

function deps(verified: string | null) {
  const linked: [string, string][] = [];
  const d: ConciergeGateDeps = {
    verifiedEmail: async () => verified,
    linkSession: async (id, email) => {
      linked.push([id, email]);
    },
  };
  return { d, linked };
}

test("refuses a caller with no verified email, with or without a session id", async () => {
  for (const sid of [SESSION, null]) {
    const { d, linked } = deps(null);
    const r = await conciergeGate(sid, d);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.status, 401);
      assert.equal(r.body.code, "email_required");
    }
    assert.deepEqual(linked, []);
  }
});

test("a verified customer is let through and the chat is linked to their address", async () => {
  const { d, linked } = deps("asha@example.com");
  const r = await conciergeGate(SESSION, d);
  assert.deepEqual(r, { ok: true, email: "asha@example.com" });
  assert.deepEqual(linked, [[SESSION, "asha@example.com"]]);
});

const route = readFileSync("src/app/api/concierge/route.ts", "utf8");
const post = route.slice(route.indexOf("export async function POST"));

test("the API route asks the gate before it builds a model client", () => {
  const gateAt = post.indexOf("await conciergeGate(");
  const refuseAt = post.indexOf("if (!gate.ok)");
  const modelAt = post.indexOf("new Anthropic(");
  assert.ok(gateAt > 0, "POST must call conciergeGate");
  assert.ok(refuseAt > gateAt, "POST must return when the gate refuses");
  assert.ok(modelAt > refuseAt, "no model client may exist before the gate has passed");
});

test("the only proof the route accepts is a confirmed-email sign-in", () => {
  const gate = post.slice(0, post.indexOf("if (!gate.ok)"));
  assert.match(gate, /getGatedUser\(\)/);
  assert.match(gate, /verifiedEmail: async \(\) => user\?\.email/);
  // The unverified "type an email and chat" door must not come back.
  assert.doesNotMatch(gate, /concierge_session_status|concierge_register_session/);
  assert.equal(existsSync("src/app/api/concierge/session/route.ts"), false);
});

test("linking a chat never subscribes, and partners are not linked", () => {
  const link = post.slice(post.indexOf("linkSession:"), post.indexOf("if (!gate.ok)"));
  assert.match(link, /concierge_link_session/);
  assert.doesNotMatch(link, /auto_subscribe|concierge_register_session/);
  assert.match(link, /startsWith\("partner:"\)\) return/);
});

test("the concierge's email step verifies a code before the chat opens", () => {
  const ui = readFileSync("src/components/Concierge.tsx", "utf8");
  assert.match(ui, /requestEmailCode\(/);
  assert.match(ui, /verifyEmailCode\(/);
  assert.match(ui, /if \(!signedIn \|\| serverRefused\) return;/);
  assert.doesNotMatch(ui, /\/api\/concierge\/session/);
});
