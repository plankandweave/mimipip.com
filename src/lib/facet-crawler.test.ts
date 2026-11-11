import { test } from "node:test";
import assert from "node:assert/strict";
import { facetCrawlerRedirect, MAX_FILTER_TAGS } from "./facet-crawler";

const META = { asn: 32934 };
const u = (s: string) => new URL(s, "https://zyvorah.com");

test("Meta's network asking for a filter combination is sent to the bare collection", () => {
  const to = facetCrawlerRedirect(u("/collections/textures?tag=Art&tag=Dark&new=1"), META);
  assert.equal(to?.to.toString(), "https://zyvorah.com/collections/textures");
});

test("every facet parameter the grid reads triggers it", () => {
  for (const q of ["tag=X", "sort=featured", "signature=1", "new=1", "child=1", "page=2"]) {
    assert.ok(facetCrawlerRedirect(u(`/collections/blue-wallpaper?${q}`), META), q);
  }
});

test("the bare collection itself is served — that is Meta's ad-review landing page", () => {
  assert.equal(facetCrawlerRedirect(u("/collections/textures"), META), null);
  assert.equal(facetCrawlerRedirect(u("/collections/textures?utm_source=meta&fbclid=abc"), META), null);
});

test("product pages and the collections index are never touched", () => {
  assert.equal(facetCrawlerRedirect(u("/products/ochre-drift?tag=X"), META), null);
  assert.equal(facetCrawlerRedirect(u("/collections?tag=X"), META), null);
});

test("shoppers on every other network keep their filters", () => {
  assert.equal(facetCrawlerRedirect(u("/collections/textures?tag=Art"), { asn: 24560, country: "IN", acceptLanguage: "en-IN,en;q=0.9" }), null); // Airtel
  assert.equal(facetCrawlerRedirect(u("/collections/textures?tag=Art"), { asn: 15169, country: "US", acceptLanguage: "en-US" }), null); // Google
  assert.equal(facetCrawlerRedirect(u("/collections/textures?tag=Art"), {}), null); // off Cloudflare
});

test("China, and zh browsers anywhere, are sent to the bare collection", () => {
  const url = u("/collections/wall-art?tag=Geometric&tag=Play+School&tag=Powder+Bathroom");
  assert.equal(facetCrawlerRedirect(url, { asn: 9808, country: "CN" })?.reason, "country");
  assert.equal(facetCrawlerRedirect(url, { asn: 4134, country: "cn" })?.reason, "country");
  assert.equal(facetCrawlerRedirect(url, { country: "BR", acceptLanguage: "zh-CN,zh;q=0.9" })?.reason, "lang");
  assert.equal(facetCrawlerRedirect(url, { country: "RU", acceptLanguage: "ZH-TW" })?.reason, "lang");
  assert.equal(facetCrawlerRedirect(url, { asn: 32934, country: "US" })?.reason, "asn");
});

test("Chinese as a second language, or China on a bare collection, is left alone", () => {
  const url = u("/collections/wall-art?tag=Geometric&tag=Pastel&tag=Floral");
  assert.equal(facetCrawlerRedirect(url, { country: "IN", acceptLanguage: "en-IN,zh;q=0.5" }), null);
  assert.equal(facetCrawlerRedirect(u("/collections/wall-art"), { country: "CN", acceptLanguage: "zh-CN" }), null);
  assert.equal(facetCrawlerRedirect(u("/products/ochre-drift?tag=X"), { country: "CN" }), null);
});

const tags = (n: number) => Array.from({ length: n }, (_, i) => `tag=T${i}`).join("&");

test("more tags than a listing offers is sent to the bare collection, on any network", () => {
  const url = u(`/collections/wall-art?${tags(MAX_FILTER_TAGS + 1)}&sort=newest`);
  const shopperLike = { asn: 262755, country: "BR", acceptLanguage: "en-US,en;q=0.9" };
  const to = facetCrawlerRedirect(url, shopperLike);
  assert.equal(to?.reason, "depth");
  assert.equal(to?.to.toString(), "https://zyvorah.com/collections/wall-art");
  assert.equal(facetCrawlerRedirect(u(`/collections/wall-art?${tags(7)}`), {})?.reason, "depth");
});

test("up to the most a listing offers, a shopper keeps every filter", () => {
  const shopper = { asn: 24560, country: "IN", acceptLanguage: "en-IN,en;q=0.9" };
  assert.equal(facetCrawlerRedirect(u(`/collections/wall-art?${tags(MAX_FILTER_TAGS)}`), shopper), null);
  assert.equal(facetCrawlerRedirect(u(`/collections/wall-art?${tags(1)}`), shopper), null);
});
