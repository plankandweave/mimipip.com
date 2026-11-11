import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// Checkout fills city and state from public/pin/<first two digits>.json
// (scripts/gen-pincodes.mjs). A rebuild that drops a shard, or maps a big
// city's district to a name nobody writes, would quietly hand shoppers a
// wrong or empty city — so a few known PINs are pinned here.
const lookup = (pin: string) =>
  (JSON.parse(readFileSync(`public/pin/${pin.slice(0, 2)}.json`, "utf8")) as Record<string, [string, string]>)[pin.slice(2)];

test("known PIN codes give the city a shopper writes, and its state", () => {
  assert.deepEqual(lookup("400001"), ["Mumbai", "Maharashtra"]);
  assert.deepEqual(lookup("400050"), ["Mumbai", "Maharashtra"]);
  assert.deepEqual(lookup("411001"), ["Pune", "Maharashtra"]);
  assert.deepEqual(lookup("560034"), ["Bengaluru", "Karnataka"]);
  assert.deepEqual(lookup("110001"), ["New Delhi", "Delhi"]);
  assert.deepEqual(lookup("500081"), ["Hyderabad", "Telangana"]);
  assert.deepEqual(lookup("380015"), ["Ahmedabad", "Gujarat"]);
});

test("the directory covers the country", () => {
  const files = readdirSync("public/pin").filter((f) => f.endsWith(".json"));
  const count = files.reduce((n, f) => n + Object.keys(JSON.parse(readFileSync(`public/pin/${f}`, "utf8"))).length, 0);
  assert.ok(files.length >= 60, `only ${files.length} PIN files`);
  assert.ok(count > 19000, `only ${count} PIN codes`);
});
