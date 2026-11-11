// When the launch mails go out, pinned.
//
// The failure this guards is a mailshot: a cron that runs hourly asks
// launchMailDue() twenty-four times a day for a fortnight, and must answer
// "no" every time but two. An off-by-one here mails the whole list every
// morning of the launch window.
import { test } from "node:test";
import assert from "node:assert/strict";
import { launchMailDue } from "./launch-mail";
import type { CollectionLaunch } from "./launch";

const taash: CollectionLaunch = {
  collectionHandle: "taash",
  launchAt: new Date("2026-09-24T00:00:00+05:30"),
  windowDays: 14,
  teaserDays: 7,
  heroHandles: [],
  teaserHandles: [],
  activatedAt: null,
  cancelledAt: null,
  notes: null,
};
const at = (iso: string) => new Date(iso);

test("exactly two mails, on exactly two mornings", () => {
  // Teaser day.
  assert.equal(launchMailDue(taash, at("2026-09-17T00:00:00+05:30")), "teaser");
  assert.equal(launchMailDue(taash, at("2026-09-17T23:59:00+05:30")), "teaser");
  // The day after the teaser opened — silence, for six more days.
  for (const d of ["18", "19", "20", "21", "22", "23"]) {
    assert.equal(launchMailDue(taash, at(`2026-09-${d}T09:00:00+05:30`)), null, `Sep ${d} must be silent`);
  }
  // Launch morning.
  assert.equal(launchMailDue(taash, at("2026-09-24T00:00:00+05:30")), "launch");
  assert.equal(launchMailDue(taash, at("2026-09-24T23:59:00+05:30")), "launch");
  // Every remaining day of the fortnight — silence.
  for (const d of ["25", "26", "30"]) {
    assert.equal(launchMailDue(taash, at(`2026-09-${d}T09:00:00+05:30`)), null, `Sep ${d} must be silent`);
  }
  assert.equal(launchMailDue(taash, at("2026-10-05T09:00:00+05:30")), null);
});

test("an hourly cron gets exactly two yeses across the whole launch", () => {
  // The real shape of the risk: 28 days of hourly ticks, counted.
  let teaser = 0, launch = 0;
  for (let h = 0; h < 24 * 28; h++) {
    const t = new Date(at("2026-09-14T00:00:00+05:30").getTime() + h * 3_600_000);
    const due = launchMailDue(taash, t);
    if (due === "teaser") teaser++;
    if (due === "launch") launch++;
  }
  // 24 hourly ticks land inside each of the two send DAYS; the ledger row is
  // what collapses those to one send. What matters here is that no OTHER day
  // produces a yes at all.
  assert.equal(teaser, 24);
  assert.equal(launch, 24);
});

test("nothing is due before the teaser, or after the window", () => {
  assert.equal(launchMailDue(taash, at("2026-09-16T23:59:00+05:30")), null);
  assert.equal(launchMailDue(taash, at("2026-10-09T00:00:00+05:30")), null);
});

test("a cancelled launch never mails anyone", () => {
  const pulled = { ...taash, cancelledAt: new Date("2026-09-18T00:00:00+05:30") };
  assert.equal(launchMailDue(pulled, at("2026-09-17T00:00:00+05:30")), null);
  assert.equal(launchMailDue(pulled, at("2026-09-24T00:00:00+05:30")), null);
});

test("no teaser days means no teaser mail, but still a launch mail", () => {
  const sudden = { ...taash, teaserDays: 0 };
  assert.equal(launchMailDue(sudden, at("2026-09-17T00:00:00+05:30")), null);
  assert.equal(launchMailDue(sudden, at("2026-09-24T06:00:00+05:30")), "launch");
});
