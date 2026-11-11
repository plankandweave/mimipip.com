import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ESTIMATE_HEADING, estimateTemplate, latestEstimate } from "./crm-estimate";

test("unknown inquiry does not acquire a numerical estimate or a default rate", () => {
  const template = estimateTemplate("2026-10-01");
  assert.match(template, /Status: not yet estimated/);
  assert.match(template, /Rate assumption .*unknown/);
  assert.match(template, /Low \/ base \/ high .*not yet estimated/);
  assert.doesNotMatch(template, /300|\b0\b/);
  assert.match(template, /Source:/);
  assert.match(template, /Confidence:/);
  assert.match(template, /Exclusions:/);
});

test("latest estimate is dated, preserves uncertainty and ignores later general notes", () => {
  const notes = [
    { id: "a", happened_at: "2026-09-01", body: `${ESTIMATE_HEADING}\nBase: INR 2400000` },
    { id: "b", happened_at: "2026-10-01", body: `Call recap\n${ESTIMATE_HEADING}\nStatus: not yet estimated — scope changed` },
    { id: "c", happened_at: "2026-10-02", body: "Actual quote INR 2500000" },
  ];
  assert.equal(latestEstimate(notes), `${ESTIMATE_HEADING}\nStatus: not yet estimated — scope changed`);
  assert.equal(notes[0].id, "a");
  assert.equal(latestEstimate([notes[2]]), null);
});
