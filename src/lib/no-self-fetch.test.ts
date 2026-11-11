import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// On Cloudflare a Worker fetching its own zone's public URL is fragile — the
// subrequest can loop and time out (522). Server code that calls its own origin
// passes on next dev and Vercel and dies in production: the site-batch approve
// route did exactly that and every partner approval failed (15 Sep 2026). Call
// the handler in-process, or read bundled assets through the ASSETS binding
// (src/lib/asset-fetch.ts) — never the public URL.
//
// A same-worker same-origin /api self-fetch is empirically SURVIVED by OpenNext
// (the site-batch-drive cron drives its batch that way in production), but no
// route needs one: the site-batch drive callers and the studio tick chains all
// call their worker in-process instead (PRs #356, #358). There are none left,
// so this guard has no exemptions today. The `self-fetch-ok` marker on a fetch
// line is the escape hatch if a genuinely unavoidable case ever appears — it
// must be justified at the call site; every other self-origin fetch in
// src/app/api is a failure.
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

// A self-origin fetch is a `fetch(...)` whose URL is built from the request's
// own origin. Two shapes cover every case in this codebase:
//   fetch(new URL("/api/x", req.url))         — absolute path off the request
//   fetch(`${origin}/api/x`, …)               — the conventional `origin` var
//                                                (= new URL(req.url).origin, or
//                                                 NEXT_PUBLIC_SITE_URL — both the
//                                                 same zone)
// Both /api routes and bundled assets (/fonts, /brand, /logo-*) count: reading
// either over the public URL is the same same-zone hop. External fetches use a
// full literal URL or `${process.env.SOMETHING}` and are not matched.
const SELF_FETCH = [
  /fetch\(\s*new URL\(\s*["'`]\//,
  /fetch\(\s*`\$\{origin\}\//,
];

test("no server route fetches its own origin", () => {
  const offenders: string[] = [];
  for (const file of walk(join(process.cwd(), "src/app/api"))) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes("self-fetch-ok")) return; // deliberate, documented at the call site
      if (SELF_FETCH.some((re) => re.test(line))) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `same-zone self-fetch in:\n${offenders.join("\n")}`);
});
