import test from "node:test";
import assert from "node:assert/strict";
import { classifySections, worstStatus, BRIEF_SECTIONS, type RawSectionRow, filingSource, readFilingSource } from "./briefing-rules";

/**
 * These tests exist for one reason: the morning brief must never read calm
 * because an agent died.
 *
 * Before the brief existed, five agents each sent their own mail. A dead agent
 * announced itself by the mail not arriving. Folding them into one brief takes
 * that signal away — silence now looks identical to "nothing to report" — so
 * the missing-section path is not a nicety here, it is the thing that replaces
 * the absent email. Every test below is written so that deleting the code that
 * pushes to `missing` makes it fail.
 */

const BRIEF_DAY = "2026-09-25";
const NOW = new Date("2026-09-25T02:30:00.000Z"); // 08:00 IST
const EVERY_KEY = Object.keys(BRIEF_SECTIONS);

function row(over: Partial<RawSectionRow> & { key: string }): RawSectionRow {
  return {
    title: "A section",
    rank: 10,
    status: "green",
    headline: "all well",
    body_html: "<p>body</p>",
    source: "test",
    filed_for: BRIEF_DAY,
    stale_after_hours: 30,
    updated_at: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
    ...over,
  };
}

test("every expected agent lands in exactly one list, always", () => {
  // The invariant that makes the brief trustworthy. Only one agent filed.
  const { sections, missing } = classifySections([row({ key: "night-patrol" })], BRIEF_DAY, NOW);
  const seen = [...sections.map((s) => s.key), ...missing.map((s) => s.key)].sort();
  assert.deepEqual(seen, [...EVERY_KEY].sort(), "an agent fell out of both lists");
  assert.equal(new Set(seen).size, seen.length, "an agent appeared in both lists");
});

test("an agent that never filed is reported missing, not omitted", () => {
  const { sections, missing } = classifySections([], BRIEF_DAY, NOW);
  assert.equal(sections.length, 0);
  assert.equal(missing.length, EVERY_KEY.length);
  assert.ok(
    missing.every((m) => /never filed/.test(m.reason)),
    "the reason must say the agent never filed",
  );
});

test("a section older than its own freshness is reported missing, not printed stale", () => {
  // 40 hours old against a 30-hour promise. A two-day-old ads number read as
  // this morning's is worse than no number.
  const stale = row({
    key: "google-ads",
    filed_for: BRIEF_DAY,
    stale_after_hours: 30,
    updated_at: new Date(NOW.getTime() - 40 * 60 * 60 * 1000).toISOString(),
  });
  const { sections, missing } = classifySections([stale], BRIEF_DAY, NOW);
  assert.ok(!sections.some((s) => s.key === "google-ads"), "a stale section must not be printed");
  const gap = missing.find((m) => m.key === "google-ads");
  assert.ok(gap, "a stale section must be reported missing");
  assert.match(gap.reason, /40 hours ago/);
});

test("a section describing an older day does not ride along in today's brief", () => {
  const old = row({ key: "crm", filed_for: "2026-09-21" });
  const { sections, missing } = classifySections([old], BRIEF_DAY, NOW);
  assert.ok(!sections.some((s) => s.key === "crm"));
  assert.match(missing.find((m) => m.key === "crm")!.reason, /2026-09-21/);
});

test("yesterday's afternoon watch is carried by this morning's brief", () => {
  // The one legitimate cross-day case: the 2 PM watch runs after yesterday's
  // brief and before today's. It must be printed, not reported missing.
  const watch = row({
    key: "day-watch",
    filed_for: "2026-09-24",
    updated_at: new Date(NOW.getTime() - 18 * 60 * 60 * 1000).toISOString(),
  });
  const { sections } = classifySections([watch], BRIEF_DAY, NOW);
  assert.ok(
    sections.some((s) => s.key === "day-watch"),
    "the previous afternoon's watch belongs in this brief",
  );
});

test("an empty section is a gap, not a green tick", () => {
  const hollow = row({ key: "night-patrol", body_html: null, headline: null });
  const { sections, missing } = classifySections([hollow], BRIEF_DAY, NOW);
  assert.ok(!sections.some((s) => s.key === "night-patrol"));
  assert.match(missing.find((m) => m.key === "night-patrol")!.reason, /empty/);
});

test("an unreadable timestamp is treated as stale, never as fresh", () => {
  // Fail closed. A row whose clock we cannot read must not be printed as if it
  // arrived this morning.
  const broken = row({ key: "night-patrol", updated_at: "not-a-date" });
  const { sections, missing } = classifySections([broken], BRIEF_DAY, NOW);
  assert.ok(!sections.some((s) => s.key === "night-patrol"));
  assert.ok(missing.some((m) => m.key === "night-patrol"));
});

test("an unknown status is recorded as info, so it cannot fake a green", () => {
  const odd = row({ key: "night-patrol", status: "excellent" });
  const { sections } = classifySections([odd], BRIEF_DAY, NOW);
  assert.equal(sections.find((s) => s.key === "night-patrol")!.status, "info");
});

test("the brief takes the colour of the worst thing reported", () => {
  const mk = (status: string) => ({ status }) as never;
  assert.equal(worstStatus([mk("green"), mk("red"), mk("amber")]), "red");
  assert.equal(worstStatus([mk("green"), mk("amber")]), "amber");
  assert.equal(worstStatus([mk("green"), mk("green")]), "green");
  // Context alone must not colour the brief green — nothing was verified.
  assert.equal(worstStatus([mk("info")]), "info");
  assert.equal(worstStatus([]), "info");
});

test("refiling old Google prose does not establish fresh account evidence", () => {
  const result = classifySections([row({ key: "google-ads", source: "agent" })], BRIEF_DAY, NOW);
  assert.ok(!result.sections.some(s => s.key === "google-ads"));
  assert.match(result.missing.find(s => s.key === "google-ads")!.reason, /observation timestamp/);
});

test("DB status with stale evidence stays missing despite a new filing", () => {
  const result = classifySections([row({ key: "store-db", source: JSON.stringify({ kind: "brief-evidence-v1", source: "patrol", observedAt: "2026-09-23T00:00:00Z" }) })], BRIEF_DAY, NOW);
  assert.ok(!result.sections.some(s => s.key === "store-db"));
});

test("fresh verified Google evidence prints its observation time", () => {
  const observedAt = "2026-09-25T01:00:00Z";
  const result = classifySections([row({ key: "google-ads", source: JSON.stringify({ kind: "brief-evidence-v1", source: "account review", observedAt }) })], BRIEF_DAY, NOW);
  assert.equal(result.sections.find(s => s.key === "google-ads")?.observedAt, observedAt);
  assert.equal(result.sections.find(s => s.key === "google-ads")?.source, "account review");
});

test("row cannot extend the section freshness contract", () => {
  const result = classifySections([row({ key: "night-patrol", stale_after_hours: 999, updated_at: "2026-09-23T10:00:00Z" })], BRIEF_DAY, NOW);
  assert.ok(!result.sections.some(s => s.key === "night-patrol"));
});


test("filing provenance round trips without changing the database schema", () => {
  const observedAt = "2026-09-25T01:00:00Z";
  assert.deepEqual(readFilingSource(filingSource("Google account review", observedAt)), { source: "Google account review", observedAt });
  assert.deepEqual(readFilingSource("legacy agent"), { source: "legacy agent", observedAt: null });
});

test("future account evidence and observation after filing are rejected", () => {
  for (const observedAt of ["2026-09-26T01:00:00Z", "2026-09-25T02:00:00Z"]) {
    const result = classifySections([row({ key: "google-ads", source: filingSource("agent", observedAt) })], BRIEF_DAY, NOW);
    assert.ok(!result.sections.some(s => s.key === "google-ads"));
  }
});


test("missing evidence cannot yield an all-clear brief", () => {
  const missing = [{ key: "google-ads", title: "Google", rank: 60, reason: "no evidence" }] as const;
  assert.equal(worstStatus([{ status: "green" }] as never, [...missing]), "amber");
  assert.equal(worstStatus([{ status: "red" }] as never, [...missing]), "red");
});

test("a properly stamped store-db filing is accepted as the database stores it", () => {
  // The shape the filing gate leaves behind: Postgres's own updated_at text and
  // the observation normalised to UTC — the 3–8 October rows lacked only this.
  const result = classifySections([row({
    key: "store-db",
    updated_at: "2026-09-25 01:30:00.123456+00",
    source: JSON.stringify({ kind: "brief-evidence-v1", source: "store-db", observedAt: "2026-09-25T01:29:10Z" }),
  })], BRIEF_DAY, NOW);
  assert.equal(result.sections.find(s => s.key === "store-db")?.observedAt, "2026-09-25T01:29:10Z");
  assert.ok(!result.missing.some(s => s.key === "store-db"));
});

test("a few seconds of producer clock skew is not an observation after filing", () => {
  const updated = new Date(NOW.getTime() - 60 * 60 * 1000);
  const ahead = new Date(updated.getTime() + 30_000).toISOString();
  const accepted = classifySections([row({ key: "google-ads", source: filingSource("google-ads", ahead) })], BRIEF_DAY, NOW);
  assert.ok(accepted.sections.some(s => s.key === "google-ads"));
  const late = new Date(updated.getTime() + 10 * 60_000).toISOString();
  const held = classifySections([row({ key: "google-ads", source: filingSource("google-ads", late) })], BRIEF_DAY, NOW);
  assert.equal(held.missing.find(s => s.key === "google-ads")?.state, "evidence-held");
});
