// Every native-binary dependency stays external to the bundler.
//
// R33 is why a check lives here at all: the marketing cron was the one
// sharp-reaching route missing from Vercel's outputFileTracingIncludes, so its
// function 500'd at module load in production — before auth, before the
// heartbeat, before the ledger. Nothing recorded a failure because nothing got
// far enough to record anything, and it stayed dead for 33 days.
//
// WHAT CHANGED. That list is gone, deliberately: the apex moved to Cloudflare
// Workers on 5 September 2026, native binaries run in the media container, and
// next.config.ts says so in as many words. This test went on asserting the
// Vercel shape against a Cloudflare deployment and had been failing ever since
// — invisibly, because nothing in the repo ran it. The composing routes are in
// fact healthy: `marketing` and `marketing-week` both log ok in cron_runs.
//
// So the assertion is retargeted rather than deleted. The surviving half of the
// same protection is serverExternalPackages: a hand-maintained list that a new
// native import must be added to, with exactly the property that made R33
// possible — forgetting is silent. A comment saying "remember to add it" would
// be worth nothing; the previous author of that list forgot, and so would the
// next. This checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

/** Packages that ship a .node/.so and therefore must not be bundled. Keyed by
 *  the import specifier as it appears in source. */
const NATIVE = ["sharp", "onnxruntime-node", "@xenova/transformers"];

/** Every file under src/ that imports one of them at module scope. */
function nativeImporters(): Map<string, string[]> {
  const byPackage = new Map<string, string[]>();
  (function walk(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        const src = readFileSync(full, "utf8");
        for (const pkg of NATIVE) {
          if (new RegExp(`from "${pkg.replace("/", "\\/")}"`).test(src)) {
            byPackage.set(pkg, [...(byPackage.get(pkg) ?? []), full.slice(SRC.length + 1)]);
          }
        }
      }
    }
  })(SRC);
  return byPackage;
}

test("every native dependency imported in src is declared serverExternalPackages", () => {
  const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
  const block = config.match(/serverExternalPackages:\s*\[([^\]]*)\]/);
  assert.ok(block, "serverExternalPackages is gone from next.config.ts");

  const importers = nativeImporters();
  assert.ok(importers.size > 0, "found no native imports — did the scan path break?");

  for (const [pkg, files] of importers) {
    assert.ok(
      block[1].includes(`"${pkg}"`),
      `${pkg} is imported by ${files.join(", ")} but is not in serverExternalPackages. ` +
        `Bundling a native module fails at module load in production — silently, ` +
        `before anything that could report it.`,
    );
  }
});

test("sharp's platform packages are named, not just sharp itself", () => {
  // The actual cause of the missing libvips .so was the install step skipping
  // these glibc-constrained optional packages, not the bundler — so naming the
  // parent alone was not enough, and still isn't.
  const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
  const block = config.match(/serverExternalPackages:\s*\[([^\]]*)\]/);
  assert.ok(block);
  for (const pkg of ["@img/sharp-linux-x64", "@img/sharp-libvips-linux-x64"]) {
    assert.ok(block[1].includes(`"${pkg}"`), `${pkg} dropped out of serverExternalPackages`);
  }
});
