import assert from "node:assert/strict";
import test from "node:test";
import {
  HOMECOMING_END_AT,
  HOMECOMING_ORDER_CODE,
  homecomingOfferActive,
} from "./homecoming-offer";

test("homecoming closes after 8 November in India", () => {
  assert.equal(homecomingOfferActive(new Date("2026-11-08T18:29:59.999Z")), true);
  assert.equal(homecomingOfferActive(new Date("2026-11-08T18:30:00.000Z")), false);
  assert.equal(HOMECOMING_END_AT, "2026-11-08T18:29:59.999Z");
});

test("the order records both independently named automatic codes", () => {
  assert.equal(HOMECOMING_ORDER_CODE, "Newly25 + Express8");
});

