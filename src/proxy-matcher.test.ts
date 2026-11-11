// The proxy matcher is an allow-list, and both of its failure modes are silent:
//
//  - a PUBLIC page added to it is never held at the Cloudflare edge again
//    (vinext stamps no-store on every matched path), and the Supabase egress
//    the edge cache exists to save comes back;
//  - a page that reads cookies or the session server-side and is LEFT OUT of
//    it loses the session refresh, and a signed-in customer or partner looks
//    signed out.
//
// So both are pinned: every page section that reads cookies or the session
// (directly or through any server module it imports) must be covered, and the
// catalogue must not be.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL(".", import.meta.url));
const proxy = readFileSync(join(SRC, "proxy.ts"), "utf8");
const matcherBlock = proxy.slice(proxy.indexOf("matcher: ["), proxy.indexOf("],", proxy.indexOf("matcher: [")));
const patterns = [...matcherBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

function covered(path: string): boolean {
  return patterns.some((p) => {
    if (p.endsWith("/:path*")) {
      const base = p.slice(0, -"/:path*".length);
      return path === base || path.startsWith(`${base}/`);
    }
    return new RegExp(`^${p}$`).test(path);
  });
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

test("the catalogue is outside the proxy, so the edge can hold it", () => {
  for (const path of ["/", "/products/ochre-drift", "/collections", "/collections/pastel-wallpaper", "/moods", "/office", "/api/brand/icon.svg", "/api/webhooks/razorpay", "/media/x.png"]) {
    assert.equal(covered(path), false, `${path} must not be proxied — vinext would never cache it`);
  }
});

test("the beacons, account and private surfaces are proxied", () => {
  for (const path of ["/api/traffic", "/api/taste/event", "/api/cart", "/account", "/account/orders", "/checkout", "/cart", "/admin", "/studio", "/partners/homelane", "/bt/book"]) {
    assert.equal(covered(path), true, `${path} must be proxied`);
  }
});

test("every page that reads cookies or the session server-side is proxied", () => {
  const files = walk(SRC);
  const source = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
  const resolve = (spec: string, from: string): string | null => {
    const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? normalize(join(dirname(from), spec)) : null;
    if (!base) return null;
    for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) if (source.has(base + ext)) return base + ext;
    return null;
  };
  const isClient = (s: string) => /^\s*["']use client["']/.test(s);
  const reads = new Set(
    files.filter((f) => /from "next\/headers"|\bcookies\(\)|\bheaders\(\)/.test(source.get(f)!) && !isClient(source.get(f)!)),
  );
  for (let changed = true; changed; ) {
    changed = false;
    for (const f of files) {
      const s = source.get(f)!;
      if (reads.has(f) || isClient(s)) continue;
      const deps = [...s.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map((m) => resolve(m[1], f));
      if (deps.some((d) => d && reads.has(d))) {
        reads.add(f);
        changed = true;
      }
    }
  }
  const uncovered = [...reads]
    .filter((f) => /\/app\/.*\/(page|layout)\.tsx?$/.test(f))
    .map((f) => "/" + relative(join(SRC, "app"), f).split("/").slice(0, -1).filter((seg) => !seg.startsWith("(")).join("/"))
    .filter((path) => !covered(path.replace(/\[[^\]]+\]/g, "x")));
  assert.deepEqual(uncovered, [], "these page sections read cookies/session but are outside the proxy matcher");
});
