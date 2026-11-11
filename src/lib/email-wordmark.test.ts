import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { emailWordmark } from "./email-wordmark";

// 5 October 2026: every email typed "zyvorah." in Arial instead of showing the
// logo, so customers saw a wordmark that did not match the site. The logo is an
// image, always. This sweeps the whole source tree for the typed imitation.
function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) yield p;
  }
}

test("no file types the wordmark as text — the logo is always the real image", () => {
  const offenders: string[] = [];
  for (const f of files("src")) {
    if (/zyvorah<span[^>]*>\.<\/span>/i.test(readFileSync(f, "utf8"))) offenders.push(f);
  }
  assert.deepEqual(offenders, [], `typed "zyvorah." logo found — use emailWordmark() (email) or the wordmark SVG (site): ${offenders.join(", ")}`);
});

test("the email wordmark is the brand PNG at its true proportions", () => {
  const html = emailWordmark(30);
  assert.match(html, /src="https:\/\/zyvorah\.com\/logo-dark\.png"/);
  assert.match(html, /width="94" height="30"/);
  assert.match(html, /alt="Zyvorah"/);
});
