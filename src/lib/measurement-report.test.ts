import assert from "node:assert/strict";
import test from "node:test";
import { aggregateMeasurement, paidOrderBreakdown, dedupeRefunds, refundLedgerInput, validDateKey, type PaidRecord } from "./measurement-report";

const paid = (overrides: Partial<PaidRecord> = {}): PaidRecord => ({
  family: "retail", id: "one", currency: "INR", total: 1180, product: 1000, tax: 180, shipping: 0,
  ...overrides,
});

test("keeps product, tax, shipping, refunds and net cash separate by currency", () => {
  const result = aggregateMeasurement({
    canonicalPaid: [paid(), paid({ id: "two", currency: "USD", total: 120, product: 100, tax: 0, shipping: 20 })],
    unknownPaidAt: [],
    refunds: [{ refundId: "rf_1", currency: "INR", amount: 180, coverage: "provider_processed" }],
  });
  assert.deepEqual(result.currencies.INR, {
    paid: { product: 1000, tax: 180, shipping: 0, gross: 1180 },
    refunds: 180, netCash: 1000, paidOrders: 1, refundsCount: 1,
  });
  assert.equal(result.currencies.USD.netCash, 120);
  assert.deepEqual(result.product_after_refunds.INR, { value: null, lower_bound: 820, upper_bound: 1000 });
  assert.deepEqual(result.product_after_refunds.USD, { value: 100, lower_bound: 100, upper_bound: 100 });
});

test("excludes unknown paid times from dated totals while reporting their coverage", () => {
  const result = aggregateMeasurement({ canonicalPaid: [], unknownPaidAt: [paid()], refunds: [] });
  assert.deepEqual(result.currencies, {});
  assert.deepEqual(result.excluded_unknown_paid_at.INR, { gross: 1180, orders: 1 });
  assert.equal(result.counts.unknown_paid_at, 1);
});

test("canonical refund record replaces its historical event without double counting", () => {
  const rows = dedupeRefunds(
    [{ refundId: "rf_1", currency: "INR", amount: 500, coverage: "provider_processed" }],
    [{ refundId: "rf_1", currency: "INR", amount: 500, coverage: "historical_event" }],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.coverage, "provider_processed");
});

test("missing or malformed money is excluded and never treated as zero", () => {
  const result = aggregateMeasurement({
    canonicalPaid: [paid({ total: null }), paid({ id: "bad", tax: "not-money" })],
    unknownPaidAt: [paid({ id: "unknown", total: undefined })],
    refunds: [{ refundId: "rf_bad", currency: "INR", amount: null, coverage: "historical_event" }],
  });
  assert.deepEqual(result.currencies, {});
  assert.equal(result.counts.invalid_paid_money_excluded, 2);
  assert.equal(result.counts.invalid_unknown_paid_money_excluded, 1);
  assert.equal(result.counts.invalid_refund_money_excluded, 1);
  assert.deepEqual(result.product_after_refunds, {});
});

test("report dates reject impossible calendar values", () => {
  assert.equal(validDateKey("2026-09-14"), true);
  assert.equal(validDateKey("2026-02-29"), false);
  assert.equal(validDateKey("2026-99-99"), false);
  assert.equal(validDateKey("14-09-2026"), false);
});

test("a refund-only day retains its negative product activity bound", () => {
  const result = aggregateMeasurement({
    canonicalPaid: [],
    unknownPaidAt: [],
    refunds: [{ refundId: "rf_prior_day", currency: "INR", amount: 500, coverage: "provider_processed" }],
  });
  assert.deepEqual(result.product_after_refunds.INR, { value: null, lower_bound: -500, upper_bound: 0 });
  assert.equal(result.currencies.INR.netCash, -500);
});

test("processed refunds require finite money, currency and provider event time", () => {
  assert.deepEqual(refundLedgerInput({
    event: "refund.processed",
    payload: { refund: { entity: { id: "rf_1", amount: 5000, currency: "INR", status: "processed" } } },
  }), { ok: false });
  assert.deepEqual(refundLedgerInput({
    event: "refund.processed", created_at: 1_789_000_000,
    payload: { refund: { entity: { id: "rf_1", amount: Number.NaN, currency: "INR", status: "processed" } } },
  }), { ok: false });
  const valid = refundLedgerInput({
    event: "refund.processed", created_at: 1_789_000_000,
    payload: { refund: { entity: { id: "rf_1", payment_id: "pay_1", amount: 5000, currency: "INR", status: "processed", created_at: 1_788_900_000 } } },
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value.amount, 50);
    assert.equal(valid.value.processedAt, new Date(1_789_000_000_000).toISOString());
  }
});


test("paid sample and retail sales are separate from exact owner validations and corporate cash", () => {
  const result = paidOrderBreakdown([
    paid({ id: "sample", placedVia: "sample", email: "customer@example.com", total: 200, product: 169, tax: 31 }),
    paid({ id: "wall", email: "buyer@plankandweave.com" }),
    paid({ id: "owner", placedVia: "sample", email: " ROHEENA@ZYVORAH.COM " }),
    paid({ id: "corporate", family: "corporate" }),
  ]);
  assert.equal(result.external_sample.orders, 1);
  assert.equal(result.external_sample.currencies.INR.paid.gross, 200);
  assert.equal(result.external_retail.orders, 1);
  assert.equal(result.internal_owner.orders, 1);
  assert.equal(result.corporate.orders, 1);
  assert.equal(paidOrderBreakdown([]).external_retail.orders, 0);
});


test("legacy INR sample zero tax is split like GA, with derivation disclosed and cash preserved", () => {
  const result = aggregateMeasurement({ canonicalPaid: [paid({ placedVia: "sample", total: 200, product: 200, tax: 0 })], unknownPaidAt: [], refunds: [] });
  assert.deepEqual(result.currencies.INR.paid, { product: 169, tax: 31, shipping: 0, gross: 200 });
  assert.equal(result.currencies.INR.netCash, 200);
  assert.equal(result.counts.sample_tax_derived_from_inclusive_total, 1);
  for (const row of [paid({ placedVia: "sample", total: 200, product: 169, tax: 31 }), paid({ family: "corporate", placedVia: "sample", tax: 0 }), paid({ currency: "USD", placedVia: "sample", tax: 0 }), paid({ tax: 0 })]) {
    const untouched = aggregateMeasurement({ canonicalPaid: [row], unknownPaidAt: [], refunds: [] });
    assert.equal(untouched.counts.sample_tax_derived_from_inclusive_total, 0);
    assert.equal(untouched.currencies[row.currency!].paid.tax, row.tax);
  }
  const missing = aggregateMeasurement({ canonicalPaid: [paid({ placedVia: "sample", tax: null })], unknownPaidAt: [], refunds: [] });
  assert.equal(missing.counts.invalid_paid_money_excluded, 1);
  assert.equal(missing.counts.sample_tax_derived_from_inclusive_total, 0);
});
