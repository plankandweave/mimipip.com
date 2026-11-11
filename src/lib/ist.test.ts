// The shop's clock, pinned.
//
// Every case here is an instant where the UTC day and the Indian day disagree
// — that is the only interesting case, and the one the whole site used to get
// wrong. 18:30 UTC is midnight IST.
//
// House convention: node:test, like launch.test.ts. Run with
//   pnpm exec tsx --test src/lib/ist.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  istDateKey,
  istDayNumber,
  istParts,
  istWeekday,
  istMidnight,
  addIstDays,
  formatIstDate,
} from "./ist";

const LATE_EVENING_IST = new Date("2026-09-07T19:00:00Z"); // 8 Sep, 00:30 IST

test("istDateKey reports the Indian day, not the UTC one", () => {
  // The bug this replaces, stated outright:
  assert.equal(LATE_EVENING_IST.toISOString().slice(0, 10), "2026-09-07");
  assert.equal(istDateKey(LATE_EVENING_IST), "2026-09-08");
  // And it still agrees with UTC in the middle of the Indian day.
  assert.equal(istDateKey(new Date("2026-09-08T02:00:00Z")), "2026-09-08");
});

test("istDayNumber separates the two sides of IST midnight", () => {
  const before = new Date("2026-09-07T18:29:00Z");
  assert.equal(istDayNumber(LATE_EVENING_IST) - istDayNumber(before), 1);
  assert.equal(istDayNumber(before), istDayNumber(new Date("2026-09-07T12:00:00Z")));
});

test("istParts rolls the financial year at IST midnight", () => {
  // 1 April, 00:30 IST. On the server clock this was still March, and the FY
  // it produced went into an invoice serial.
  assert.deepEqual(istParts(new Date("2026-03-31T19:00:00Z")), {
    year: 2026,
    month: 3, // April
    day: 1,
  });
});

test("istWeekday is Sunday while UTC still says Saturday", () => {
  assert.equal(istWeekday(new Date("2026-09-12T19:00:00Z")), 0); // 13 Sep IST
});

test("istMidnight starts a bare date at 00:00 IST, not 05:30", () => {
  assert.equal(istMidnight("2026-09-24").toISOString(), "2026-09-23T18:30:00.000Z");
  assert.equal(
    new Date("2026-09-24").getTime() - istMidnight("2026-09-24").getTime(),
    5.5 * 60 * 60 * 1000,
  );
});

test("addIstDays walks the Indian calendar across boundaries", () => {
  assert.equal(addIstDays("2026-09-30", 1), "2026-10-01");
  assert.equal(addIstDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addIstDays("2028-02-28", 1), "2028-02-29"); // leap year
});

test("formatIstDate prints the shop's day to a reader anywhere", () => {
  assert.equal(formatIstDate(LATE_EVENING_IST, { day: "numeric", month: "long" }), "8 September");
  // A bare date string is an Indian calendar day, not a UTC instant.
  assert.equal(formatIstDate("2026-09-24", { day: "numeric", month: "long" }), "24 September");
  // Nothing is empty, never the string "Invalid Date".
  assert.equal(formatIstDate(null), "");
  assert.equal(formatIstDate("not a date"), "");
});
