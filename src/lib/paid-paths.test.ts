import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// No order is an order until it is paid — and every order that IS paid must
// become one. Until 8 October 2026 the Razorpay webhook and the exclusive
// payment recovery marked retail orders paid and stopped: no ZVY number, no
// print files, no OS push, no email. Any file that marks a retail order paid
// must hand it to lib/retail-paid.ts (directly, or through
// paid-without-gateway, which does).
const PAID_RPCS = /mark_order_paid_by_rzp|mark_order_paid_by_gift|mark_order_paid_free/;
const HANDOFF = /settlePaidOrder|afterPaidWithoutGateway/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [p] : [];
  });
}

test("every path that marks a retail order paid starts its production", () => {
  const offenders = sources("src").filter((f) => {
    const s = readFileSync(f, "utf8");
    return PAID_RPCS.test(s) && !HANDOFF.test(s);
  });
  assert.deepEqual(offenders, []);
});

test("nothing outside the paid path mints a production number or draws an order copy", () => {
  const allowed = new Set([join("src", "lib", "retail-paid.ts"), join("src", "lib", "order-number.ts"), join("src", "lib", "order-copy-remote.ts")]);
  const offenders = sources("src").filter((f) => {
    if (allowed.has(f)) return false;
    const s = readFileSync(f, "utf8");
    return /buildCartOrderCopyPdfRemote\(/.test(s) || (/ensureOrderZvy\(/.test(s) && !/fullyPaidByGift|fullyCoveredByCode/.test(s));
  });
  assert.deepEqual(offenders, []);
});
