import test from "node:test";
import assert from "node:assert/strict";
import { safely } from "./degrade";

const quiet = () => {};

test("a block that answers in time is used", async () => {
  assert.equal(await safely("ok", 1000, Promise.resolve("real"), "fallback", quiet), "real");
});

test("a block that rejects does not take the brief down", async () => {
  const boom = Promise.reject(new Error("Google said no"));
  assert.equal(await safely("boom", 1000, boom, "fallback", quiet), "fallback");
});

test("a block that hangs is dropped at its budget, not waited on", async () => {
  // The failure this guards: one slow Google call holding the route past its
  // 120s ceiling, so no mail is sent at all.
  const never = new Promise<string>(() => {});
  const started = Date.now();
  assert.equal(await safely("hang", 60, never, "fallback", quiet), "fallback");
  assert.ok(Date.now() - started < 1500, "it waited for a promise that never settles");
});

test("the timer is cleared when the work wins, so the route can exit", async () => {
  // A dangling timer keeps the Node event loop alive after the response.
  // If this leaks, the test run itself will not exit.
  const before = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  await safely("fast", 30_000, Promise.resolve(1), 0, quiet);
  const after = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  assert.equal(after, before, "a 30s timer was left running after the work finished");
});

test("the label and the error reach the log, so a dropped block is traceable", async () => {
  const lines: string[] = [];
  await safely("organic", 10, new Promise<number>(() => {}), -1, (m) => lines.push(m));
  assert.match(lines.join(" "), /organic/);
  assert.match(lines.join(" "), /exceeded/);
});
