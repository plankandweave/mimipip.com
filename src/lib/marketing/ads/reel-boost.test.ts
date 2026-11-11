// The reel promoter spends money on a neighbourhood. These pin the two ways it
// could spend it somewhere else: a postcode matched loosely, and a geography
// that comes out empty (which Meta reads as all of India).
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOSTS, adSetParams, creativeParams, geoFor, matchPin, targeting, isBoostKey } from "./reel-boost-spec";

const spec = BOOSTS["lives-within-gurgaon"];

test("a postcode matches only the exact code in the expected state", () => {
  const rows = [
    { key: "IN:1220021", name: "1220021", type: "zip", region: "Haryana" },
    { key: "IN:122002x", name: "122002", type: "zip", region: "Punjab" },
    { key: "city:1", name: "122002", type: "city", region: "Haryana" },
    { key: "IN:122002", name: "122002", type: "zip", region: "Haryana" },
  ];
  assert.deepEqual(matchPin(rows, "122002", "Haryana"), { key: "IN:122002" });
  assert.equal(matchPin(rows.slice(0, 3), "122002", "Haryana"), null);
});

test("too few postcodes resolved refuses instead of running thin", () => {
  const pins = spec.pins.map((p, i) => (i < spec.minPins - 1 ? { ...p, key: `IN:${p.code}` } : { ...p, error: "no match" }));
  const g = geoFor(spec, pins);
  assert.equal("error" in g, true);
  const ok = geoFor(spec, spec.pins.map((p) => ({ ...p, key: `IN:${p.code}` })));
  assert.deepEqual(ok, { keys: spec.pins.map((p) => `IN:${p.code}`) });
});

test("targeting is homes in those postcodes, never an empty geography", () => {
  assert.throws(() => targeting(spec, []), /empty geo/);
  const t = targeting(spec, ["IN:122002"]) as { geo_locations: { zips: { key: string }[]; location_types: string[] }; targeting_automation: { advantage_audience: number } };
  assert.deepEqual(t.geo_locations.zips, [{ key: "IN:122002" }]);
  assert.deepEqual(t.geo_locations.location_types, ["home"]);
  assert.equal(t.targeting_automation.advantage_audience, 0);
  assert.equal("cities" in t.geo_locations, false);
});

test("The Lives Within: ₹1,000 a day in paise, created paused, reach with a frequency cap", () => {
  const a = adSetParams(spec, "c1", ["IN:122002"]);
  assert.equal(spec.dailyBudgetInr, 1000);
  assert.equal(a.daily_budget, "100000");
  assert.equal(a.status, "PAUSED");
  assert.equal(a.optimization_goal, "REACH");
  assert.deepEqual(a.frequency_control_specs, [{ event: "IMPRESSIONS", interval_days: 7, max_frequency: 2 }]);
});

test("the creative promotes the existing Instagram post and links to the project", () => {
  const c = creativeParams(spec, "1789", "page1", "ig1") as Record<string, unknown>;
  assert.equal(c.source_instagram_media_id, "1789");
  assert.equal(c.instagram_user_id, "ig1");
  assert.equal(c.object_id, "page1");
  assert.deepEqual(c.call_to_action, { type: "LEARN_MORE", value: { link: "https://zyvorah.com/concepts/the-lives-within" } });
  assert.match(String(c.url_tags), /utm_campaign=\{\{campaign\.name\}\}/);
});

test("only known boosts are accepted", () => {
  assert.equal(isBoostKey("lives-within-gurgaon"), true);
  assert.equal(isBoostKey("constructor"), false);
  assert.equal(isBoostKey(undefined), false);
});
