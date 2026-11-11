// Cloudflare cron weekdays run 1 = Sunday … 7 = Saturday — NOT the Unix
// 0 = Sunday / 1 = Monday most people write from memory. The worker said
// "30 3 * * 1 // Monday" and "0 5 * * 4 // Thursday"; production's cron_runs
// shows weekly-intel firing every Sunday and the customer newsletter going out
// every Wednesday (23 Sep, 30 Sep 2026). Cloudflare's own docs recommend the
// three-letter names to avoid exactly this, so numeric weekdays are banned.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");

function wranglerCrons(): string[] {
  const src = readFileSync(join(root, "cron-worker", "wrangler.jsonc"), "utf8");
  const start = src.indexOf("[", src.indexOf('"crons"')) + 1;
  const block = src.slice(start, src.indexOf("]", start));
  return [...block.matchAll(/^\s*"([^"]+)"/gm)].map((m) => m[1]);
}

function routeKeys(): string[] {
  const worker = readFileSync(join(root, "cron-worker", "worker.mjs"), "utf8");
  const map = worker.slice(worker.indexOf("const ROUTES"), worker.indexOf("async function tick"));
  return [...map.matchAll(/^\s*"([^"]+)":\s*\[/gm)].map((m) => m[1]);
}

test("the schedules are readable", () => {
  assert.ok(wranglerCrons().length >= 8, `parsed ${wranglerCrons().length} wrangler crons`);
  assert.ok(routeKeys().length >= 8, `parsed ${routeKeys().length} route keys`);
});

test("no schedule pins a weekday by number (Cloudflare 1 = Sunday)", () => {
  const numeric = [...new Set([...wranglerCrons(), ...routeKeys()])].filter((expr) => {
    const dow = expr.trim().split(/\s+/)[4];
    return dow !== undefined && /\d/.test(dow);
  });
  assert.deepEqual(numeric, [], `use MON/TUE/… instead of numbers in: ${numeric.join(" | ")}`);
});

test("every wrangler trigger has a route and every route has a trigger", () => {
  // controller.cron is matched against ROUTES verbatim; a trigger renamed in
  // one file and not the other fires into "no routes mapped" and does nothing.
  assert.deepEqual([...wranglerCrons()].sort(), [...routeKeys()].sort());
});

test("the weekly jobs land on the days their comments promise", () => {
  const keys = routeKeys();
  assert.ok(keys.includes("30 2 * * MON"), "weekly-intel: 08:00 IST Monday");
  assert.ok(keys.includes("30 8 * * THU"), "newsletter: 14:00 IST Thursday");
});
