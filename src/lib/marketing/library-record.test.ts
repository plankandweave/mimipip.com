import assert from "node:assert/strict";
import { test } from "node:test";
import { clearanceOnApprovedUpload, isCleared } from "./library-record";

const when = "2026-10-12T06:00:00.000Z";
const owner = "roheena@plankandweave.com";

test("the owner's library save records all three approvals with an audit trail", () => {
  const clearance = clearanceOnApprovedUpload(owner, "hindi", when);
  assert.equal(isCleared(clearance), true);
  for (const item of Object.values(clearance)) {
    assert.equal(item.state, "cleared");
    assert.equal(item.cleared_by, owner);
    assert.equal(item.cleared_at, when);
    assert.ok(item.evidence && item.evidence.length >= 8);
  }
});

test("a silent film does not claim a voice licence, and staff cannot approve an upload", () => {
  const clearance = clearanceOnApprovedUpload(owner, "none", when);
  assert.equal(clearance.voice.state, "n/a");
  assert.equal(isCleared(clearance), true);
  assert.throws(() => clearanceOnApprovedUpload("staff@zyvorah.com", "hindi", when), /Only Roheena/);
});
