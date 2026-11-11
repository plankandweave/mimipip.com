// Every static path the sitemap advertises must resolve to a real route.
//
// A sitemap that lists a 404 is worse than one that is merely incomplete: it is
// a promise to a crawler that the page exists, and search engines treat a
// pattern of them as a quality signal about the whole site. Nothing checked,
// and the sitemap is edited by hand every time a landing-page family ships.
//
// This walks src/app the way the router does, so a path served by a dynamic
// segment (/collections/wall-art via collections/[handle]) counts as real,
// while a path with no page at all does not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const APP = join(process.cwd(), "src", "app");

/** The literal paths listed in sitemap.ts. Dynamic families are generated from
 *  the database at request time and are not in scope here. */
function sitemapPaths(): string[] {
  const src = readFileSync(join(APP, "sitemap.ts"), "utf8");
  return [...new Set([...src.matchAll(/path:\s*"(\/[^"]*)"/g)].map((m) => m[1]))];
}

/** Does the router have something to serve at this path? */
function routeExists(path: string): boolean {
  const segments = path.split("/").filter(Boolean);

  const walk = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0) {
      return ["page.tsx", "page.ts", "route.ts", "route.tsx"].some((f) => existsSync(join(dir, f)));
    }
    const [head, ...tail] = rest;

    // A literal directory wins; route groups "(name)" are transparent to the
    // URL, so they are searched through without consuming a segment.
    if (existsSync(join(dir, head))) return walk(join(dir, head), tail);

    let entries: string[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return false;
    }
    for (const name of entries) {
      if (name.startsWith("(") && walk(join(dir, name), rest)) return true;
      // [handle], [...slug], [[...path]] all match here.
      if (name.startsWith("[") && walk(join(dir, name), tail)) return true;
    }
    return false;
  };

  return walk(APP, segments);
}

test("the sitemap only advertises pages that exist", () => {
  const paths = sitemapPaths();
  assert.ok(paths.length > 20, `only found ${paths.length} sitemap paths — did the parse break?`);

  const missing = paths.filter((p) => p !== "/" && !routeExists(p));
  assert.deepEqual(missing, [], `sitemap lists ${missing.length} path(s) with no route`);
});

test("every browse axis carries its index page", () => {
  // The mega-menu renders six links per column ordered by position, so a column
  // whose index page is missing silently swallows every collection added to it
  // after the sixth. That is exactly how 20 style collections and a mood
  // collection came to be live and unreachable from the nav.
  for (const axis of ["/rooms", "/colours", "/styles", "/moods", "/collections", "/series"]) {
    assert.ok(routeExists(axis), `${axis} has no page — the menu column has no "see all"`);
    assert.ok(sitemapPaths().includes(axis), `${axis} exists but is not in the sitemap`);
  }
});
