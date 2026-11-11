import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const queries = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/collections/[handle]/page.tsx", import.meta.url), "utf8");
const browse = readFileSync(new URL("../app/api/browse/route.ts", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../supabase/migrations/20261013132141_collection_cards_require_renders.sql", import.meta.url),
  "utf8",
);

test("collection paging excludes designs without a room render", () => {
  assert.match(queries, /p_rendered_only:\s*opts\.renderedOnly \?\? false/);
  assert.match(page, /renderedOnly:\s*family\?\.measurementType !== "length"/);
  assert.match(browse, /renderedOnly:\s*family\?\.measurementType !== "length"/);
  assert.match(migration, /i\.is_flat = false/);
});

test("ordinary cards cannot silently fall back to flat artwork", () => {
  assert.match(queries, /let card = imgs\.find\(\(i\) => !i\.is_flat\)/);
  assert.doesNotMatch(queries, /mode === "scene"[^\n]*\?\? flat/);
  assert.match(page, /data-flat-cards=/);
});

// A collection with its own page replaces [handle]/page.tsx, so it must make
// the same promise itself: verify-index-pages.mjs reads every collection an
// index links to and fails a page that does not stamp its cards (13 October
// 2026: Blue Notes and Beyond the Blue turned the deploy red).
test("bespoke collection pages stamp their cards too", () => {
  const blueNotes = readFileSync(new URL("../app/collections/blue-notes/page.tsx", import.meta.url), "utf8");
  const beyond = readFileSync(new URL("../app/collections/beyond-the-blue/BlueExperience.tsx", import.meta.url), "utf8");
  const jain = readFileSync(new URL("../components/jain/Collection.tsx", import.meta.url), "utf8");
  assert.match(blueNotes, /data-flat-cards=""/);
  assert.match(beyond, /data-flat-cards=""/);
  assert.match(jain, /data-flat-cards=\{products\.filter\(card => card\.imageIsFlat\)/);
});
