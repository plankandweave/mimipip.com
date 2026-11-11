import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Licensed-character requests (founder, 5 October 2026).
 *
 * The week's only concierge chat was a parent asking for an Elsa / Frozen
 * wallpaper. The concierge described a "snow fantasy" alternative in words,
 * asked for measurements, and the customer never returned. The fix is a
 * behaviour, written into both concierge prompts, plus a record of every such
 * request. These pin the parts a later edit could silently drop. Read as
 * source, not imported, so the test needs no database or API key.
 */
const chat = readFileSync("src/app/api/concierge/route.ts", "utf8");
const voice = readFileSync("src/lib/voice-concierge.ts", "utf8");
const tools = readFileSync("src/lib/concierge-tools.ts", "utf8");

for (const [name, src] of [["chat", chat], ["voice", voice]] as const) {
  test(`${name} concierge has the character-request rules`, () => {
    assert.match(src, /## Character and franchise requests/);
    // Originals are SHOWN (or named), never only described.
    assert.match(src, /winter-worlds/);
    // Measurements are asked last, never as the price of seeing a design.
    assert.match(src, /measurements yet/);
    // The Your Own Image service is not a back door to printing the character.
    assert.match(src, /Your Own Image/);
    // Every request is recorded, and the tool is actually wired.
    assert.match(src, /call log_character_request/i);
    assert.match(src, /case "log_character_request":/);
  });
}

test("the chat concierge shows originals in its first reply", () => {
  assert.match(chat, /FIRST reply[^\n]*show_products/);
});

test("the tool's outcomes match the database's check constraint", () => {
  const list = tools.match(/CHARACTER_REQUEST_OUTCOMES = \[([^\]]+)\]/)?.[1] ?? "";
  const outcomes = [...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
  const migration = readdirSync("supabase/migrations").find((f) => f.endsWith("_character_requests.sql"));
  assert.ok(migration, "the character_requests migration exists");
  const sql = readFileSync(`supabase/migrations/${migration}`, "utf8");
  const check = sql.match(/outcome\s+text not null check \(outcome in\s*\(([^)]+)\)/)?.[1] ?? "";
  const allowed = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(outcomes, allowed);
  assert.equal(outcomes.length, 4);
});
