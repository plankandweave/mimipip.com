// These flags decide whether money is spent and whether customer email leaves
// the building, and they are set by piping a value into `wrangler secret put`.
// The newline `echo` adds is the whole reason this helper exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { envFlag } from "./env-flag";

test("the shapes a person actually types all mean on", () => {
  for (const v of ["true", "TRUE", " true ", "true\n", "1", "yes", "on", "On"]) {
    assert.equal(envFlag(v), true, `${JSON.stringify(v)} should read as on`);
  }
});

test("absent, empty and anything else mean off — never on by accident", () => {
  for (const v of [undefined, null, "", "  ", "false", "0", "no", "off", "tru", "truthy"]) {
    assert.equal(envFlag(v), false, `${JSON.stringify(v)} should read as off`);
  }
});

test("a trailing newline no longer reads as off — the bug this replaces", () => {
  // `echo true | wrangler secret put META_LAUNCH_ACTIVE` stores "true\n", and
  // the old `process.env.X === "true"` read that as OFF, silently.
  const stored: string = "true\n";
  assert.equal(stored === "true", false, "strict equality is what used to fail");
  assert.equal(envFlag(stored), true);
});
