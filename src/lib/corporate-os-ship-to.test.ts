// Every road that pushes a partner order to the OS must carry the delivery PIN.
//
// Found by the night patrol, 16 Oct 2026: from 12 Oct every Vijay Sales order
// (20 of them, Ahmedabad and Bengaluru) reached the OS with no pincode even
// though corporate_orders held one. Three of the four call sites built the
// push from the address/city/contact fields and simply never passed
// `shipPincode`. Earlier stores got away with it because their PIN was typed
// inside the address text, which the OS parses; the new stores' addresses
// carry none, so each order sat retrying "No 6-digit pincode found" every
// five minutes and could not be booked with a courier.
//
// The push also never sent the state inside `customer`, which is where the
// OS reads ship_state from — so every partner order landed with no ship state.
//
// Two static checks: the push body itself, and every call site
// (so a fifth road added later cannot forget the PIN either).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** The argument object of each `pushCorporateOrderToOs({ … })` call. */
function pushCallArgs(src: string): string[] {
  const out: string[] = [];
  const marker = "pushCorporateOrderToOs({";
  let i = src.indexOf(marker);
  while (i !== -1) {
    let depth = 0;
    let j = i + marker.length - 1;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}" && --depth === 0) break;
    }
    out.push(src.slice(i, j + 1));
    i = src.indexOf(marker, j);
  }
  return out;
}

test("every OS push call site passes the delivery pincode", () => {
  const sites: string[] = [];
  const missing: string[] = [];
  for (const file of walk(join(root, "src"))) {
    const src = readFileSync(file, "utf8");
    for (const args of pushCallArgs(src)) {
      const rel = file.slice(root.length + 1);
      sites.push(rel);
      if (!/\bshipPincode\s*:/.test(args)) missing.push(rel);
    }
  }
  assert.ok(sites.length >= 4, `expected at least 4 push call sites, found ${sites.length}`);
  assert.deepEqual(missing, [], `these OS pushes drop the delivery PIN: ${missing.join(", ")}`);
});

test("the push body carries pincode and state inside customer", () => {
  // Static on purpose: corporate-os.ts imports "server-only", which cannot be
  // loaded under the plain node test runner.
  const src = readFileSync(join(root, "src", "lib", "corporate-os.ts"), "utf8");
  const start = src.indexOf("customer: {");
  assert.ok(start !== -1, "push body has no customer block");
  const block = src.slice(start, src.indexOf("},", start));
  assert.match(block, /\bpincode:\s*input\.shipPincode\b/, "customer.pincode is not sent");
  assert.match(block, /\bstate:\s*input\.state\b/, "customer.state is not sent — the OS reads ship_state from there");
});
