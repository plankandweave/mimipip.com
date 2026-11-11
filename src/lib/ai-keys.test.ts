// One Anthropic key per workflow, so the Console can say which workflow is
// spending (founder, 10 October 2026). These pin the fallback that keeps a
// workflow alive before its key exists, and sweep src/ so a new AI call
// cannot quietly go back to spending the shared key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { AI_WORKFLOWS, anthropicKeyFor, anthropicKeySource, partnerWorkflow, SHARED_ANTHROPIC_KEY } from "./ai-keys";

test("a workflow spends its own key when set, the shared key until then", () => {
  assert.equal(anthropicKeyFor("outreach", { ANTHROPIC_KEY_OUTREACH: "own", ANTHROPIC_API_KEY: "shared" }), "own");
  assert.equal(anthropicKeyFor("outreach", { ANTHROPIC_API_KEY: "shared" }), "shared");
  assert.equal(anthropicKeyFor("outreach", { ANTHROPIC_KEY_OUTREACH: "  ", ANTHROPIC_API_KEY: "shared" }), "shared");
  assert.equal(anthropicKeyFor("outreach", {}), undefined);
  // Another workflow's key is never borrowed.
  assert.equal(anthropicKeyFor("quotations", { ANTHROPIC_KEY_OUTREACH: "own" }), undefined);
});

test("Vijay Sales still reads a key set under the first split's name", () => {
  assert.equal(anthropicKeyFor("vijaySales", { ANTHROPIC_KEY_VIJAY_SALES: "vs", ANTHROPIC_KEY_STORES: "old", ANTHROPIC_API_KEY: "shared" }), "vs");
  assert.equal(anthropicKeyFor("vijaySales", { ANTHROPIC_KEY_STORES: "old", ANTHROPIC_API_KEY: "shared" }), "old");
  // The spelling on the founder's key sheet.
  assert.equal(anthropicKeyFor("vijaySales", { ANTHROPIC_KEY_VIJAYSALES: "sheet", ANTHROPIC_KEY_STORES: "old" }), "sheet");
  assert.equal(anthropicKeyFor("vijaySales", { ANTHROPIC_API_KEY: "shared" }), "shared");
  // The old name belonged to Vijay Sales' work only; proposals never borrow it.
  assert.equal(anthropicKeyFor("proposals", { ANTHROPIC_KEY_STORES: "old" }), undefined);
});

test("a partner's AI spend lands on that partner's key", () => {
  assert.equal(partnerWorkflow("homelane"), "homelane");
  assert.equal(partnerWorkflow("vijay-sales"), "vijaySales");
  assert.equal(partnerWorkflow("the-lives-within"), "proposals");
  assert.equal(partnerWorkflow(null), "proposals");
});

test("every workflow has its own setting and its own Console name", () => {
  const envs: string[] = Object.values(AI_WORKFLOWS).map((w) => w.env);
  const names = Object.values(AI_WORKFLOWS).map((w) => w.console);
  assert.equal(new Set(envs).size, envs.length);
  assert.equal(new Set(names).size, names.length);
  assert.ok(!envs.includes(SHARED_ANTHROPIC_KEY));
  // Instagram's keys are its own and are not a workflow here.
  assert.ok(envs.every((e) => !/INSTAGRAM/.test(e)));
});

const ROOT = join(import.meta.dirname, "..");
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx|mjs)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

test("no AI call in src/ spends the shared key directly", () => {
  const offenders: string[] = [];
  for (const file of sources(ROOT)) {
    const rel = relative(ROOT, file);
    if (rel === join("lib", "ai-keys.ts")) continue;
    const src = readFileSync(file, "utf8");
    if (/process\.env\.ANTHROPIC_API_KEY|process\.env\[["']ANTHROPIC_API_KEY["']\]/.test(src)) offenders.push(`${rel}: reads ANTHROPIC_API_KEY`);
    // A client built without a key reads ANTHROPIC_API_KEY on its own.
    for (const m of src.matchAll(/new Anthropic\(([^)]*)\)/g)) {
      if (!/apiKey/.test(m[1])) offenders.push(`${rel}: new Anthropic(${m[1]}) without a workflow key`);
    }
    if (/["']x-api-key["']\s*:/.test(src) && !/anthropicKeyFor\(/.test(src) && !/INSTAGRAM/.test(src)) {
      offenders.push(`${rel}: calls Anthropic over HTTP without a workflow key`);
    }
  }
  assert.deepEqual(offenders, [], "name the workflow with anthropicKeyFor() in src/lib/ai-keys.ts");
});

// HomeLane and Vijay Sales are separate keys (founder, 10 October 2026). A
// partner screen serves whichever account is signed in, so an AI call made
// from one must take its key from that account, never a fixed workflow — or
// HomeLane's spend lands on someone else's key and the split proves nothing.
const PARTNER_ROUTES = [join("app", "api", "corporate"), join("app", "api", "partners"), join("app", "partners")];
const PARTNER_AI_CALL = /resolvePincode\(|draftWallsFromWalkthrough\(|anthropicKeyFor\(|new Anthropic\(/;

test("a partner route that calls the AI takes the key from the signed-in account", () => {
  const offenders: string[] = [];
  for (const file of sources(ROOT)) {
    const rel = relative(ROOT, file);
    if (!PARTNER_ROUTES.some((r) => rel.startsWith(r))) continue;
    const src = readFileSync(file, "utf8");
    if (PARTNER_AI_CALL.test(src) && !/partnerWorkflow\(/.test(src)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], "pass partnerWorkflow(session.account.slug) to the AI call");
});

test("code written for HomeLane spends the HomeLane key", () => {
  const offenders: string[] = [];
  for (const file of sources(ROOT)) {
    const rel = relative(ROOT, file);
    const src = readFileSync(file, "utf8");
    if (!/homelane/i.test(src) || !/anthropicKeyFor\(|new Anthropic\(/.test(src)) continue;
    if (!/anthropicKeyFor\(\s*["']homelane["']\s*\)|partnerWorkflow\(/.test(src)) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});

test("a refusal names the setting it spent, never the key", () => {
  const own = anthropicKeySource("outreach", { ANTHROPIC_KEY_OUTREACH: "sk-ant-own-ABCD", ANTHROPIC_API_KEY: "sk-ant-shared-WXYZ" });
  assert.match(own, /ANTHROPIC_KEY_OUTREACH/);
  assert.match(own, /…ABCD/);
  assert.ok(!own.includes("sk-ant"));
  // The 9–12 October case: the workflow's own key missing, the revoked shared one spent.
  const shared = anthropicKeySource("outreach", { ANTHROPIC_API_KEY: "sk-ant-shared-WXYZ" });
  assert.match(shared, /shared ANTHROPIC_API_KEY.*…WXYZ.*ANTHROPIC_KEY_OUTREACH is not set/);
  assert.match(anthropicKeySource("outreach", {}), /no key/);
});

test("the deploy's key check reads every workflow's settings from this file", async () => {
  const { workflowSettings, report } = await import("../../scripts/check-ai-keys.mjs");
  const parsed = workflowSettings(readFileSync(join(ROOT, "lib", "ai-keys.ts"), "utf8")) as Record<string, string[]>;
  assert.deepEqual(Object.keys(parsed).sort(), Object.keys(AI_WORKFLOWS).sort());
  assert.deepEqual(parsed.vijaySales, ["ANTHROPIC_KEY_VIJAY_SALES", "ANTHROPIC_KEY_VIJAYSALES", "ANTHROPIC_KEY_STORES"]);
  const { lines, warnings } = report(parsed, ["ANTHROPIC_API_KEY", "ANTHROPIC_KEY_FOUNDER", "ANTHROPIC_OUTREACH_KEY"]);
  assert.ok(lines.some((l: string) => /founder\s+spends ANTHROPIC_KEY_FOUNDER/.test(l)));
  assert.ok(warnings.some((w: string) => /outreach: ANTHROPIC_KEY_OUTREACH is not set/.test(w)));
  assert.ok(warnings.some((w: string) => /ANTHROPIC_OUTREACH_KEY .*misspelt/.test(w)));
});
