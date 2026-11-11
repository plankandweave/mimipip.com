import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@/brand/database-types";
import { sweepCronRuns } from "./cron-sweep";

const now = new Date("2026-10-07T12:00:00Z");

test("sweep closes only unfinished runs strictly older than thirty minutes, once", async () => {
  const rows = [
    { started_at: "2026-10-07T11:29:59Z", finished_at: null, ok: null },
    { started_at: "2026-10-07T11:30:00Z", finished_at: null, ok: null },
    { started_at: "2026-10-07T11:40:00Z", finished_at: null, ok: null },
    { started_at: "2026-10-07T10:00:00Z", finished_at: "2026-10-07T10:01:00Z", ok: true },
  ];
  const client = { from(table: string) {
    assert.equal(table, "cron_runs");
    return { update(values: object, options: object) {
      assert.deepEqual(options, { count: "exact" });
      let candidates = [...rows];
      const query = {
        is(key: "finished_at" | "ok", value: null) {
          candidates = candidates.filter(row => row[key] === value);
          return query;
        },
        async lt(key: "started_at", cutoff: string) {
          candidates = candidates.filter(row => new Date(row[key]) < new Date(cutoff));
          candidates.forEach(row => Object.assign(row, values));
          return { count: candidates.length, error: null };
        },
      };
      return query;
    } };
  } } as unknown as SupabaseClient;
  assert.equal(await sweepCronRuns(client, now), 1);
  assert.equal(rows[0].ok, false);
  assert.equal(rows[0].finished_at, now.toISOString());
  assert.equal(rows[1].finished_at, null);
  assert.equal(rows[2].finished_at, null);
  assert.equal(rows[3].ok, true);
  assert.equal(await sweepCronRuns(client, now), 0);
});

test("database failure is visible instead of reporting a successful empty sweep", async () => {
  const query = {
    update() { return query; }, is() { return query; },
    async lt() { return { error: { message: "database unavailable" }, count: null }; },
  };
  const client = { from() { return query; } } as unknown as SupabaseClient;
  await assert.rejects(sweepCronRuns(client, now), /cron sweep failed: database unavailable/);
});
