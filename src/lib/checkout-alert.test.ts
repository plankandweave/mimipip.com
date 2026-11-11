// A customer who closes the payment window without trying to pay has
// ABANDONED checkout; nothing failed. The alert once said "Checkout FAILED"
// for that (order #91, 10 October 2026), which reads as a fault to chase.
// Pinned here: an abandoned checkout never says "failed", and a real gateway
// failure still does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Sent = { subject: string; html: string };

async function alertFor(f: Record<string, unknown>): Promise<Sent> {
  const source = readFileSync(new URL("./checkout-alert.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const sent: Sent[] = [];
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (id: string) => {
      if (id === "server-only") return {};
      if (id === "./email") return { sendEmail: async (m: Sent) => (sent.push(m), true) };
      // No database client: the failure row is skipped, the email still goes.
      if (id === "./supabase-admin") return { supabaseAdmin: () => null };
      throw new Error(`unexpected require ${id}`);
    },
    process: { env: {} },
    console: { error: () => {} },
    Promise,
  });
  const record = module.exports.recordCheckoutFailure as (f: unknown) => Promise<void>;
  await record(f);
  assert.equal(sent.length, 1);
  return sent[0];
}

test("an abandoned checkout is called abandoned, never failed", async () => {
  const m = await alertFor({
    stage: "payment_abandoned",
    detail: "Order #91 (IN) was placed, the payment window opened, and the gateway recorded ZERO payment attempts.",
    email: "customer@example.com",
    orderNumber: 91,
    valueInr: 6410,
  });
  assert.equal(m.subject, "Checkout abandoned — ₹6,410 (order #91)");
  assert.match(m.html, /A customer abandoned checkout\./);
  assert.doesNotMatch(m.subject, /fail/i);
  assert.doesNotMatch(m.html, /could not complete|FAILED/);
});

test("a real gateway failure still says FAILED", async () => {
  const m = await alertFor({ stage: "payment_failed", orderNumber: 92, valueInr: 1000 });
  assert.equal(m.subject, "Checkout FAILED — ₹1,000 (order #92)");
  assert.match(m.html, /could not complete checkout/);
});
