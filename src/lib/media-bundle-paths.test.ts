// deploy-media.yml must fire for every file the media container is made of,
// and for nothing else.
//
// The container runs the app's own modules from src/lib (bundle-inputs.mjs
// lists them from esbuild's metafile). The workflow once triggered on
// "src/lib/**", which was correct and cost a billed minute on every merge to
// decide the push was not the container's — about a third of the account's
// Actions minutes by 6 October 2026. Now the workflow's `paths` list names
// the bundle's src inputs one by one, and this test is what keeps the two
// the same: a new import in the container that the list lacks would ship to
// the website Worker and never reach the media service, silently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");

test("deploy-media.yml lists exactly the src files the media bundle is made of", () => {
  const listed = execFileSync(process.execPath, [join(root, "media-container", "bundle-inputs.mjs")], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("media-container/"))
    .sort();

  const yml = readFileSync(join(root, ".github", "workflows", "deploy-media.yml"), "utf8");
  const paths = yml.match(/^\s+paths:\n((?:\s+(?:- .*|#.*)\n)+)/m)?.[1] ?? "";
  const inWorkflow = [...paths.matchAll(/^\s+- "([^"]+)"/gm)].map((m) => m[1]);
  const srcInWorkflow = inWorkflow.filter((p) => p.startsWith("src/")).sort();

  for (const fixed of ["media-container/**", "pnpm-lock.yaml", ".github/workflows/deploy-media.yml"]) {
    assert.ok(inWorkflow.includes(fixed), `deploy-media.yml paths must keep "${fixed}"`);
  }
  for (const p of srcInWorkflow) {
    assert.ok(!p.includes("*"), `deploy-media.yml lists src files one by one, not "${p}"`);
  }

  const missing = listed.filter((p) => !srcInWorkflow.includes(p));
  const stale = srcInWorkflow.filter((p) => !listed.includes(p));
  assert.deepEqual(
    { missing, stale },
    { missing: [], stale: [] },
    [
      "deploy-media.yml's `paths` and the media bundle's inputs differ.",
      missing.length ? `Add under paths:\n${missing.map((p) => `      - "${p}"`).join("\n")}` : "",
      stale.length ? `Remove from paths:\n${stale.map((p) => `      - "${p}"`).join("\n")}` : "",
    ].filter(Boolean).join("\n"),
  );
});
