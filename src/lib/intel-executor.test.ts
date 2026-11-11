import test from "node:test";
import assert from "node:assert/strict";
import { EMAIL_BEFORE_CHECK, TOOLS, runTool, type ExecCtx } from "./intel-executor";

// 6 October 2026: the executor emailed a "ready-to-commission" brief for a
// kids' winter-fantasy line that had gone live the day before (Winter Worlds).
// It must look at what the shop already holds before it may email anything.

const ctx = (): ExecCtx => ({ rpcKey: "k", decisionId: "d", recipient: "r@example.com", outcome: null, checkedExisting: false });

test("the executor can see recent collections and designs", () => {
  assert.ok(TOOLS.some((t) => t.name === "check_existing_work"));
});

test("email_founder refuses until check_existing_work has run", async () => {
  const out = await runTool("email_founder", { subject: "Zyvorah Executor: x", body_html: "<p>x</p>" }, ctx());
  assert.deepEqual(out, { sent: false, error: EMAIL_BEFORE_CHECK });
});
