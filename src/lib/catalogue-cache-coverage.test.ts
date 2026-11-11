// The storefront must not ask Supabase the same catalogue question on every
// page view.
//
// This file exists because that failure is SILENT and has already cost money:
// on 25 Sep 2026 the edge log showed 44,251 reads of /rest/v1/products, 26,748
// of collection_page_v2 and 6,100 of collection_facets_v2 in a single day —
// every one of them a re-render of a catalogue that changes when the studio
// publishes, not when a visitor arrives. Supabase's free-plan egress quota went
// with it, and the org was put on a fair-use grace period expiring 26 Oct 2026.
//
// Nothing throws when a reader is written without `cachedCatalogue`, and
// nothing looks wrong on the page — it is simply paid for again on every hit.
// So the guard is pinned here by name: the fat, per-request catalogue readers
// must stay wrapped. Adding a new one? Wrap it and add it to this list.
//
// hiddenConceptList is held for only 60 seconds, not the catalogue hour: see
// concept-availability.ts for why a minute is safe and an hour is not the
// point. Anything genuinely required to be live is simply absent from this
// list and must not be added to it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const QUERIES = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
const RELIGION = readFileSync(new URL("./religion-catalogue.ts", import.meta.url), "utf8");
const LAUNCH = readFileSync(new URL("./launch-queries.ts", import.meta.url), "utf8");
const CONCEPTS = readFileSync(new URL("./concept-availability.ts", import.meta.url), "utf8");
const MARKETPLACE = readFileSync(new URL("./marketplace-availability.ts", import.meta.url), "utf8");
const INSTALLED = readFileSync(new URL("./installed-walls.ts", import.meta.url), "utf8");
const SPACES = readFileSync(new URL("./space-sections.ts", import.meta.url), "utf8");

const CACHED: [string, string][] = [
  ["getReligionIndex", RELIGION],
  // The fattest reads: whole product rows with their images, materials and tags.
  ["getCollectionCards", QUERIES],
  ["getProductsByHandles", QUERIES],
  ["getProductByHandle", QUERIES],
  ["getRelatedProductCards", QUERIES],
  ["getTileHeroes", QUERIES],
  ["getFlatImageMap", QUERIES],
  ["getJustInPage", QUERIES],
  ["browseProductCards", QUERIES],
  // Read on every search to tell whether the query names a collection.
  ["getNamedCollectionRows", QUERIES],
  // The per-page RPCs behind every collection grid.
  ["getCollectionPageHandles", QUERIES],
  ["getCollectionFacetRows", QUERIES],
  ["getCollectionFlagCounts", QUERIES],
  ["getCollectionByHandle", QUERIES],
  ["getCollectionStories", LAUNCH],
  // The axis index pages (/moods, /colours, /styles, /rooms) and the lookbook.
  ["getAxisCollections", QUERIES],
  ["getStyleTagList", QUERIES],
  // The product page's side reads: 22–25k a day each on 29 Sep 2026, unwrapped.
  ["getProductRating", QUERIES],
  ["getProductAttributes", QUERIES],
  ["readAmazonAsin", MARKETPLACE],
  // The product page's sample pill: 8,200 a day on 1 Oct 2026, unwrapped. The
  // sample-order API keeps the live isSampleableHandle — it banks money.
  ["isSampleableForPage", QUERIES],
  // The shop-by-space sections (/retail, /hospitals): 3,600 a day across 32
  // spaces on 1 Oct 2026, i.e. every tile on every hub render.
  ["handlesWithScene", SPACES],
  ["getSectionFinishMeta", SPACES],
  // "On real walls" — customer install photos, on every product page.
  ["readInstalledWallPhotos", INSTALLED],
  // The exclusives check, held 60s — the Header asks it on every page render.
  // The no-double-sale guarantee is a row lock in the database, not this.
  ["hiddenConceptList", CONCEPTS],
];

for (const [name, source] of CACHED) {
  test(`${name} reads through the catalogue cache`, () => {
    assert.match(
      source,
      new RegExp(`\\b${name}\\s*=\\s*cachedCatalogue\\(`),
      `${name} must be declared with cachedCatalogue(...) — an uncached catalogue read is billed on every page view`,
    );
  });
}
