// Every model call this codebase makes is reported to the group's meter in the
// OS (owner, 10 November 2026; src/lib/ai-meter.ts, and docs/TOKEN_OPTIMISER.md
// in plankandweave/magnitude-global-platform). This sweep needs no install:
// it reads the source and fails when a file calls a model without loading the
// meter, or names a model host the meter does not know.
//
// The site that is live today (the static pages and worker/) calls no model;
// the store code under src/ is not deployed yet. The check is here so that
// the day it is, nothing in it is unmetered.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const sources = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  if (name === "node_modules" || name.startsWith(".")) return [];
  if (statSync(p).isDirectory()) return sources(p);
  return /\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.d\.ts$/.test(name) ? [p] : [];
});

const meter = readFileSync(join(ROOT, "src/lib/ai-meter.ts"), "utf8");
const known = [...meter.matchAll(/"([a-z0-9.-]+)":\s*"(?:anthropic|openai|elevenlabs|replicate|vapi|google|meshy)"/g)].map((m) => m[1]);
const calls = /new Anthropic\(|new OpenAI\(|https:\/\/(api\.anthropic\.com|api\.openai\.com|api\.elevenlabs\.io|api\.replicate\.com|api\.vapi\.ai|generativelanguage\.googleapis\.com|api\.meshy\.ai)/;
const anyHost = /\b(?:api\.(?:openai|anthropic|elevenlabs|replicate|vapi|meshy|mistral|cohere|groq|perplexity|deepseek|together|fireworks|stability)\.(?:com|ai|io|xyz)|api\.x\.ai|generativelanguage\.googleapis\.com|openrouter\.ai|fal\.run|api\.deepgram\.com|api\.runwayml\.com|api\.heygen\.com|api\.klingai\.com)\b/g;
// band-complete.ts is a fingerprinted composition rule file; its callers load the meter.
const exempt = new Set(["src/lib/ai-meter.ts", "src/lib/band-complete.ts", "scripts/check-ai-meter.mjs"]);

const problems = [];
for (const dir of ["src", "worker"]) {
  for (const file of sources(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, "utf8");
    if (!exempt.has(rel) && calls.test(text) && !/from "[^"]*ai-keys"|import "[^"]*ai-meter"/.test(text)) problems.push(`${rel}: calls a model without loading the meter`);
    for (const h of text.match(anyHost) ?? []) if (!known.includes(h)) problems.push(`${rel}: names ${h}, a model host the meter does not know`);
  }
}
if (!/import "\.\/ai-meter";/.test(readFileSync(join(ROOT, "src/lib/ai-keys.ts"), "utf8"))) problems.push("src/lib/ai-keys.ts no longer loads the meter");
if (known.length < 6) problems.push("src/lib/ai-meter.ts: the model host list could not be read");

if (problems.length) { console.error([...new Set(problems)].join("\n")); process.exit(1); }
console.log(`every model call is metered (${known.length} hosts known)`);
