// The staff surface holds no secret of its own.
//
// The whole point of moving /admin and /studio onto the Google sign-in was that
// there is no longer a second credential living in a browser. That is a property
// of the SOURCE, not of any one function, and it is the kind of property that
// erodes one convenient line at a time — a page that "just needs the key for
// this one call" puts it straight back. So it is asserted here over the files
// themselves.
//
// The second test catches the quieter failure: a page calling an RPC that
// /api/admin/rpc does not allow. That page does not crash, it just shows no
// data, which is exactly the sort of breakage nobody notices until someone
// needs the screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_RPCS } from "./admin-rpc-allowlist";

const ROOT = join(import.meta.dirname, "..");
const STAFF_DIRS = ["app/admin", "app/studio", "app/decide"];

function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

const staffFiles = STAFF_DIRS.flatMap((d) => sources(join(ROOT, d))).map((path) => ({
  path: path.slice(ROOT.length + 1),
  text: readFileSync(path, "utf8"),
}));

test("the staff pages exist and were actually scanned", () => {
  // Guards the guard: a bad path here would make every assertion below vacuous.
  assert.ok(staffFiles.length > 20, `only found ${staffFiles.length} staff source files`);
});

test("no staff page carries an admin key", () => {
  const banned: [RegExp, string][] = [
    [/@\/lib\/admin-key/, "imports the retired admin-key module"],
    [/getAdminKey|setAdminKey|clearAdminKey|adminKeyHeader/, "uses an admin-key helper"],
    [/zyvorah:adminkey|zyv_admin_key/, "reads the admin key out of localStorage"],
    [/["']x-admin-key["']/, "sends the x-admin-key header"],
    [/["']x-intel-key["']/, "sends the x-intel-key header"],
    [/p_key\s*:/, "passes p_key to a database function from the browser"],
  ];
  const offences: string[] = [];
  for (const file of staffFiles) {
    for (const [pattern, why] of banned) {
      if (pattern.test(file.text)) offences.push(`${file.path} ${why}`);
    }
  }
  assert.deepEqual(offences, [], `\n${offences.join("\n")}\n`);
});

test("the staff key is the admin key, not the intel one", () => {
  // Verified against the live database: admin_key satisfies BOTH admin_key_ok()
  // and intel_key_ok(), while intel_key satisfies only the second. elevatedKey()
  // returns the INTEL key first, so handing it to these two call sites makes
  // every admin_* function answer "unauthorized" — the entire staff surface,
  // dark, from a one-word change that reads like a tidy-up.
  for (const path of ["lib/staff-key.ts", "app/api/admin/rpc/route.ts"]) {
    const text = readFileSync(join(ROOT, path), "utf8");
    assert.match(text, /adminRpcKey\(\)/, `${path} should take its key from adminRpcKey()`);
    assert.doesNotMatch(text, /elevatedKey\(\)/, `${path} must not use elevatedKey()`);
  }
});

test("every admin RPC a page calls is one the server will run", () => {
  const allowed = new Set<string>(ADMIN_RPCS);
  const missing = new Set<string>();
  for (const file of staffFiles) {
    for (const m of file.text.matchAll(/adminRpc(?:<[^>]*>)?\(\s*["']([a-z0-9_]+)["']/g)) {
      if (!allowed.has(m[1])) missing.add(`${m[1]} (${file.path})`);
    }
  }
  assert.deepEqual([...missing], [], `not in ADMIN_RPCS: ${[...missing].join(", ")}`);
});
