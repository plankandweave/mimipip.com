// The HomeLane city rule, pinned. Seven cities, and each one's state is fixed
// because the state picks the GSTIN — if this fails, the change is wrong until
// Roheena says the list itself moved.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIER1_CITIES, TIER1_PIN_PREFIXES, orderCityProblem, tier1City, tier1CityFor, tier1CityForPin,
  tier1OnlyPartner, tier1Problem,
} from "./tier1-cities";

test("exactly seven tier-1 cities, each with at least one state", () => {
  assert.equal(TIER1_CITIES.length, 7);
  assert.deepEqual(TIER1_CITIES.map((c) => c.city),
    ["Delhi NCR", "Mumbai", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune"]);
  for (const c of TIER1_CITIES) assert.ok(c.states.length >= 1, c.city);
});

test("only HomeLane is held to the list", () => {
  assert.equal(tier1OnlyPartner("homelane"), true);
  assert.equal(tier1OnlyPartner("design-cafe"), true);
  assert.equal(tier1OnlyPartner("vijay-sales"), false);
  assert.equal(tier1OnlyPartner(null), false);
});

test("a city outside the seven is refused, case-insensitively", () => {
  assert.equal(tier1Problem("Pune", "Maharashtra"), null);
  assert.equal(tier1Problem("pune", "maharashtra"), null);
  assert.match(tier1Problem("Bhosari, Pune", "Maharashtra") ?? "", /only be in/);
  assert.match(tier1Problem("", "Maharashtra") ?? "", /only be in/);
});

test("the state must match the city, because the GSTIN comes from it", () => {
  assert.match(tier1Problem("Mumbai", "Karnataka") ?? "", /Maharashtra/);
  assert.equal(tier1Problem("Delhi NCR", "Haryana"), null);
  assert.equal(tier1Problem("Delhi NCR", "Uttar Pradesh"), null);
  assert.match(tier1Problem("Delhi NCR", "Punjab") ?? "", /one of/);
  assert.equal(tier1City("bengaluru")?.states[0], "Karnataka");
});

// ── The city chosen at sign-in, and the order address (8 October 2026) ──

test("every one of the seven has delivery PIN prefixes", () => {
  for (const c of TIER1_CITIES) assert.ok((TIER1_PIN_PREFIXES[c.city] ?? []).length > 0, c.city);
});

test("the names people write resolve to the right city", () => {
  assert.equal(tier1CityFor("Bangalore")?.city, "Bengaluru");
  assert.equal(tier1CityFor("  gurgaon ")?.city, "Delhi NCR");
  assert.equal(tier1CityFor("Noida")?.city, "Delhi NCR");
  assert.equal(tier1CityFor("Navi Mumbai")?.city, "Mumbai");
  assert.equal(tier1CityFor("Secunderabad")?.city, "Hyderabad");
  assert.equal(tier1CityFor("Calcutta")?.city, "Kolkata");
  assert.equal(tier1CityFor("Pimpri-Chinchwad")?.city, "Pune");
  assert.equal(tier1CityFor("Jaipur"), null);
  assert.equal(tier1CityForPin("560034"), "Bengaluru");
  assert.equal(tier1CityForPin("302001"), null);
});

const mumbai = { city: "Mumbai", state: "Maharashtra", pincode: "400053" };

test("an address inside the chosen city passes, suburbs and NCR towns included", () => {
  assert.equal(orderCityProblem("Mumbai", mumbai), null);
  assert.equal(orderCityProblem("Mumbai", { ...mumbai, city: "Thane", pincode: "400601" }), null);
  assert.equal(orderCityProblem("Delhi NCR", { city: "Gurugram", state: "Haryana", pincode: "122002" }), null);
  assert.equal(orderCityProblem("Delhi NCR", { city: "Noida", state: "Uttar Pradesh", pincode: "201301" }), null);
  assert.equal(orderCityProblem("Delhi NCR", { city: "New Delhi", state: "Delhi", pincode: "110017" }), null);
  assert.equal(orderCityProblem("Bengaluru", { city: "Bengaluru", state: "Karnataka", pincode: "560050" }), null);
  assert.equal(orderCityProblem("Kolkata", { city: "Howrah", state: "West Bengal", pincode: "711101" }), null);
});

test("no city chosen means no order", () => {
  assert.match(orderCityProblem(null, mumbai) ?? "", /Choose your city/);
  assert.match(orderCityProblem("Jaipur", mumbai) ?? "", /Choose your city/);
});

test("a Bengaluru address on a Mumbai sign-in is stopped by its PIN, and the message says where it is", () => {
  // The exact shape of the pricing bug the OS pinned: the city field said one
  // place and the address another.
  const msg = orderCityProblem("Mumbai", { ...mumbai, pincode: "560050" }) ?? "";
  assert.match(msg, /560050 is in Bengaluru, not Mumbai/);
});

test("a city outside the seven is stopped however it is written", () => {
  assert.match(orderCityProblem("Pune", { city: "Nashik", state: "Maharashtra", pincode: "422001" }) ?? "", /not in Pune/);
  assert.match(orderCityProblem("Pune", { city: "Pune", state: "Maharashtra", pincode: "422001" }) ?? "", /outside Pune/);
});

test("the written city must be the chosen one", () => {
  assert.match(orderCityProblem("Mumbai", { ...mumbai, city: "Hyderabad" }) ?? "", /change your city to Hyderabad/);
});

test("the dispatch state must be the chosen city's, because it picks the GSTIN", () => {
  assert.match(orderCityProblem("Mumbai", { ...mumbai, state: "Karnataka" }) ?? "", /Maharashtra/);
  assert.match(orderCityProblem("Delhi NCR", { city: "Delhi", state: "Punjab", pincode: "110001" }) ?? "", /one of/);
});

test("a malformed PIN is asked for again rather than guessed", () => {
  assert.match(orderCityProblem("Mumbai", { ...mumbai, pincode: "4000" }) ?? "", /6-digit PIN/);
});
