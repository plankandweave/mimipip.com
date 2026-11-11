import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isKidsQuery, isLorangeVendor, lorangeHostServes, LORANGE_PATH, LORANGE_VENDOR, osBrandForVendor, ZYVORAH_KIDS_COLLECTIONS } from "./lorange-kids";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("a parent's search for a child's room is recognised", () => {
  for (const q of ["kids", "Kids room", "children's wallpaper", "childrens room", "baby nursery", "Nursery", "toddler wall", "kid’s bedroom", "newborn"]) {
    assert.equal(isKidsQuery(q), true, q);
  }
});

test("words that only contain a kids word are not a kids search", () => {
  for (const q of ["babylon", "kidskin leather", "botanical", "", "living room", "childhood memories"]) {
    assert.equal(isKidsQuery(q), false, q);
  }
});

test("the brand's vendor name matches however the apostrophe is typed", () => {
  assert.equal(isLorangeVendor(LORANGE_VENDOR), true);
  assert.equal(isLorangeVendor("L’Orange Kids"), true);
  assert.equal(isLorangeVendor(" l'orange kids "), true);
  assert.equal(isLorangeVendor("Zyvorah"), false);
  assert.equal(isLorangeVendor(null), false);
});

test("every kids entry point opens the L'Orange Kids shop", () => {
  const header = read("src/components/Header.tsx");
  assert.match(header, /\{ label: "Kids & nursery", href: LORANGE_PATH \}/, "phone browse chip");
  assert.match(header, /title: "Kids & Nursery",\s*href: LORANGE_PATH,/, "mega-menu row");
  assert.match(header, /ZYVORAH_KIDS_COLLECTIONS/, "the menu row and the shop share one list of Zyvorah kids rooms");
  assert.match(read("src/app/search/page.tsx"), /isKidsQuery\(query\)[\s\S]*href=\{LORANGE_PATH\}/, "search");
  assert.match(read("next.config.ts"), /source: "\/kids", destination: "\/lorange-kids"/, "/kids address");
  assert.equal(LORANGE_PATH, "/lorange-kids");
});

test("the shop shows Zyvorah designs only as Zyvorah's, never as the sister brand's", () => {
  const page = read("src/app/lorange-kids/page.tsx");
  // The brand's own grid is fed by the vendor query alone.
  assert.match(page, /getCollectionCards\(handles\)/);
  assert.match(read("src/lib/lorange-kids-queries.ts"), /\.eq\("vendor", LORANGE_VENDOR\)/);
  assert.match(page, /Children’s rooms from Zyvorah/);
  assert.ok(ZYVORAH_KIDS_COLLECTIONS.every((c) => c.handle.length > 0));
});

test("the shop always says whose family it is in, and how to get back", () => {
  const page = read("src/app/lorange-kids/page.tsx");
  assert.match(page, /\{LORANGE_FAMILY_LINE\}/);
  assert.match(page, /\{LORANGE_BACK_LINE\}/);
});

// 29 Oct 2026: L'Orange is another door into the OS. A L'Orange line is told
// to the OS as brand "lorange", so its mail and invoice carry the brand; a
// Zyvorah line sends nothing, exactly as before.
test("a L'Orange line reaches the OS as brand lorange; a Zyvorah line sends nothing", () => {
  assert.equal(osBrandForVendor(LORANGE_VENDOR), "lorange");
  assert.equal(osBrandForVendor("Zyvorah"), undefined);
  assert.equal(osBrandForVendor(null), undefined);
  assert.match(read("src/lib/os-sync.ts"), /select\("id, handle, category, vendor"\)[\s\S]*\.\.\.\(brand \? \{ brand \} : \{\}\)/, "os-sync sends the brand per line");
});

test("lorangekids.com serves the shop and its assets; everything else is zyvorah.com's", () => {
  for (const p of ["/", "/lorange-kids", "/lorange-kids/x", "/api/newsletter", "/lorange-kids/logo.png", "/assets/app.js", "/robots.txt"]) {
    assert.equal(lorangeHostServes(p), true, p);
  }
  for (const p of ["/products/jungle", "/cart", "/checkout", "/collections/nursery", "/account"]) {
    assert.equal(lorangeHostServes(p), false, p);
  }
});
