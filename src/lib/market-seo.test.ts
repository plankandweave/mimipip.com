import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CATALOGUE_FLOOR_RATE,
  countryPhrase,
  deliveryPitch,
  HOME_MARKET,
  marketAlternates,
  marketMetadataAlternates,
  marketPriceLabel,
  marketUrl,
  SEARCH_MARKETS,
} from "@/lib/market-seo";

const PRODUCT_PATH = "/products/wildflower-reverie";

test("the home market keeps the clean URL; a search market gets its own", () => {
  assert.equal(marketUrl(PRODUCT_PATH, HOME_MARKET), PRODUCT_PATH);
  assert.equal(marketUrl(PRODUCT_PATH, "US"), `${PRODUCT_PATH}?market=US`);
  assert.equal(marketUrl("/collections/x?page=2", "AE"), "/collections/x?page=2&market=AE");
});

test("hreflang names x-default, the home market and every search market", () => {
  const languages = marketAlternates(PRODUCT_PATH);
  assert.equal(languages["x-default"], PRODUCT_PATH);
  assert.equal(languages["en-IN"], PRODUCT_PATH);
  for (const code of SEARCH_MARKETS) {
    assert.equal(languages[`en-${code}`], `${PRODUCT_PATH}?market=${code}`);
  }
});

test("every variant publishes the same, reciprocal cluster", () => {
  // Google drops a cluster whose members do not all point at each other, so
  // each variant must list every other variant AND itself.
  const clusters = [HOME_MARKET, ...SEARCH_MARKETS].map((code) =>
    marketMetadataAlternates(PRODUCT_PATH, code),
  );
  for (const cluster of clusters) {
    assert.deepEqual(cluster.languages, clusters[0].languages);
    assert.ok(
      Object.values(cluster.languages).includes(cluster.canonical),
      `canonical ${cluster.canonical} is missing from its own hreflang cluster`,
    );
  }
});

test("each variant canonicals to itself, never back to India", () => {
  assert.equal(marketMetadataAlternates(PRODUCT_PATH, HOME_MARKET).canonical, PRODUCT_PATH);
  for (const code of SEARCH_MARKETS) {
    assert.equal(
      marketMetadataAlternates(PRODUCT_PATH, code).canonical,
      `${PRODUCT_PATH}?market=${code}`,
      "a market variant that canonicals to the India page is dropped from the index",
    );
  }
});

test("a snippet quotes the currency its own page charges", () => {
  const india = marketPriceLabel(CATALOGUE_FLOOR_RATE, HOME_MARKET);
  assert.match(india, /₹/);
  assert.doesNotMatch(india, /\$/);
  for (const code of SEARCH_MARKETS) {
    const abroad = marketPriceLabel(CATALOGUE_FLOOR_RATE, code);
    assert.match(abroad, /\$/, `${code} must quote dollars`);
    assert.doesNotMatch(abroad, /₹/, `${code} must not quote rupees`);
  }
});

test("delivery copy never promises free India delivery abroad", () => {
  assert.match(deliveryPitch(HOME_MARKET), /Free India delivery/);
  for (const code of SEARCH_MARKETS) {
    const pitch = deliveryPitch(code);
    assert.doesNotMatch(pitch, /Free India delivery/);
    assert.match(pitch, /duties/, `${code} must keep the duties exclusion`);
  }
});

/**
 * The market variant is only worth publishing if a crawler can fetch it, and
 * only safe to publish if the clean URL stays India's page for indexing.
 */
test("robots.txt leaves the ?market= variants crawlable", () => {
  const policy = readFileSync(join(process.cwd(), "src/lib/robots-policy.ts"), "utf8");
  assert.doesNotMatch(policy, /\/products\/\*\?\*market=/);
  assert.doesNotMatch(policy, /Disallow.*\*\?\*$/m);
});

test("/api/market answers a crawler with the home market", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/market/route.ts"), "utf8");
  assert.match(route, /isCrawler/, "a crawler read of geo would put dollars on the x-default URL");
  assert.match(route, /crawler \? null : geoCountry\(req\)/);
});

test("a country name reads as English inside the sentence", () => {
  assert.equal(countryPhrase("US"), "the United States");
  assert.equal(countryPhrase("AE"), "the United Arab Emirates");
  assert.equal(countryPhrase("GB"), "the United Kingdom");
  assert.equal(countryPhrase("NL"), "the Netherlands");
  // Most countries take no article, and must not grow one.
  assert.equal(countryPhrase("FR"), "France");
  assert.equal(countryPhrase("JP"), "Japan");
  assert.equal(countryPhrase("IN"), "India");
  assert.match(deliveryPitch("US"), /Delivered to the United States/);
});
