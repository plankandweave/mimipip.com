import { isInternalOrder } from "./internal-orders";
import { exGst } from "./pricing";

export type PaidRecord = {
  family: "retail" | "corporate";
  email?: string | null;
  placedVia?: string | null;
  id: string;
  currency: string | null;
  total: unknown;
  tax: unknown;
  shipping: unknown;
  product: unknown;
};

/** Paid records only: fulfilment cancellation does not prove a refund. */
export function paidOrderBreakdown(rows: PaidRecord[]) {
  const groups = {
    external_sample: [] as PaidRecord[],
    external_retail: [] as PaidRecord[],
    internal_owner: [] as PaidRecord[],
    corporate: [] as PaidRecord[],
  };
  for (const row of rows) {
    const kind = row.family === "corporate" ? "corporate"
      : isInternalOrder(row.email) ? "internal_owner"
      : row.placedVia === "sample" ? "external_sample" : "external_retail";
    groups[kind].push(row);
  }
  return Object.fromEntries(Object.entries(groups).map(([kind, paid]) => [kind, {
    orders: paid.length,
    // These are collected amounts before refunds, not net acquisition revenue.
    currencies: aggregateMeasurement({ canonicalPaid: paid, unknownPaidAt: [], refunds: [] }).currencies,
  }]));
}

export type RefundRecord = {
  refundId: string;
  paymentId?: string | null;
  currency: string | null;
  amount: unknown;
  coverage: "provider_processed" | "historical_event";
};

type Money = { product: number; tax: number; shipping: number; gross: number };

const amount = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

function addMoney(a: Money, b: Money): Money {
  return {
    product: Math.round((a.product + b.product) * 100) / 100,
    tax: Math.round((a.tax + b.tax) * 100) / 100,
    shipping: Math.round((a.shipping + b.shipping) * 100) / 100,
    gross: Math.round((a.gross + b.gross) * 100) / 100,
  };
}

export function aggregateMeasurement(input: {
  canonicalPaid: PaidRecord[];
  unknownPaidAt: PaidRecord[];
  refunds: RefundRecord[];
}) {
  const currencies = new Map<string, {
    paid: Money;
    refunds: number;
    netCash: number;
    paidOrders: number;
    refundsCount: number;
  }>();
  const unknownCurrencies = new Map<string, { gross: number; orders: number }>();
  let invalidPaidMoney = 0;
  let sampleTaxDerived = 0;
  let invalidUnknownPaidMoney = 0;
  let invalidRefundMoney = 0;

  for (const row of input.canonicalPaid) {
    const total = amount(row.total);
    let product = amount(row.product);
    let tax = amount(row.tax);
    const shipping = amount(row.shipping);
    if (total === null || product === null || tax === null || shipping === null) {
      invalidPaidMoney += 1;
      continue;
    }
    const currency = row.currency || "UNKNOWN";
    // create_sample_order historically stored the GST-inclusive sample amount
    // as subtotal with tax=0. Use the same whole-rupee split as GA purchase
    // accounting for these known INR, free-delivery samples only. This is a
    // labelled report derivation, never a ledger rewrite or conversion replay.
    if (row.family === "retail" && row.placedVia === "sample"
      && currency === "INR" && total > 0 && tax === 0 && shipping === 0) {
      product = exGst(total);
      tax = total - product;
      sampleTaxDerived += 1;
    }
    const current = currencies.get(currency) ?? {
      paid: { product: 0, tax: 0, shipping: 0, gross: 0 }, refunds: 0, netCash: 0,
      paidOrders: 0, refundsCount: 0,
    };
    current.paid = addMoney(current.paid, {
      product, tax, shipping, gross: total,
    });
    current.paidOrders += 1;
    currencies.set(currency, current);
  }

  for (const row of input.refunds) {
    const refund = amount(row.amount);
    if (refund === null) {
      invalidRefundMoney += 1;
      continue;
    }
    const currency = row.currency || "UNKNOWN";
    const current = currencies.get(currency) ?? {
      paid: { product: 0, tax: 0, shipping: 0, gross: 0 }, refunds: 0, netCash: 0,
      paidOrders: 0, refundsCount: 0,
    };
    current.refunds = Math.round((current.refunds + refund) * 100) / 100;
    current.refundsCount += 1;
    currencies.set(currency, current);
  }

  for (const current of currencies.values()) {
    current.netCash = Math.round((current.paid.gross - current.refunds) * 100) / 100;
  }

  for (const row of input.unknownPaidAt) {
    const total = amount(row.total);
    if (total === null) {
      invalidUnknownPaidMoney += 1;
      continue;
    }
    const currency = row.currency || "UNKNOWN";
    const current = unknownCurrencies.get(currency) ?? { gross: 0, orders: 0 };
    current.gross = Math.round((current.gross + total) * 100) / 100;
    current.orders += 1;
    unknownCurrencies.set(currency, current);
  }

  const orderedCurrencies = [...currencies.entries()].sort(([a], [b]) => a.localeCompare(b));
  return {
    currencies: Object.fromEntries(orderedCurrencies),
    product_after_refunds: Object.fromEntries(orderedCurrencies.map(([currency, row]) => [currency, {
      value: row.refundsCount === 0 ? row.paid.product : null,
      // Activity is bucketed by the day money moved. A refund today may belong
      // to a prior-day sale, so the valid lower bound can be negative.
      lower_bound: Math.round((row.paid.product - row.refunds) * 100) / 100,
      upper_bound: row.paid.product,
    }])),
    product_refund_allocation: "unknown when refunds exist: provider refunds are not allocated among product, tax and shipping",
    excluded_unknown_paid_at: Object.fromEntries([...unknownCurrencies.entries()].sort(([a], [b]) => a.localeCompare(b))),
    counts: {
      canonical_paid: input.canonicalPaid.length,
      sample_tax_derived_from_inclusive_total: sampleTaxDerived,
      unknown_paid_at: input.unknownPaidAt.length,
      refunds: input.refunds.length,
      provider_processed_refunds: input.refunds.filter((r) => r.coverage === "provider_processed").length,
      historical_event_refunds: input.refunds.filter((r) => r.coverage === "historical_event").length,
      invalid_paid_money_excluded: invalidPaidMoney,
      invalid_unknown_paid_money_excluded: invalidUnknownPaidMoney,
      invalid_refund_money_excluded: invalidRefundMoney,
    },
  };
}

export function dedupeRefunds(canonical: RefundRecord[], historical: RefundRecord[]): RefundRecord[] {
  const rows = new Map<string, RefundRecord>();
  for (const row of historical) rows.set(row.refundId, row);
  for (const row of canonical) rows.set(row.refundId, row);
  return [...rows.values()];
}

export function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

export function refundLedgerInput(event: {
  event: string;
  created_at?: number;
  payload?: Record<string, unknown>;
}): { ok: true; value: {
  refundId: string;
  paymentId: string | null;
  amount: number;
  currency: string;
  providerStatus: string;
  providerCreatedAt: string | null;
  processedAt: string | null;
} } | { ok: false } {
  const timestampIso = (seconds: number | undefined): string | null => {
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
    const date = new Date(seconds * 1000);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  };
  const payload = event.payload as {
    refund?: { entity?: {
      id?: string; amount?: number; payment_id?: string; currency?: string;
      status?: string; created_at?: number;
    } };
  } | undefined;
  const entity = payload?.refund?.entity;
  if (!entity?.id || typeof entity.amount !== "number" || !Number.isFinite(entity.amount)
      || entity.amount < 0 || !entity.currency?.trim()) return { ok: false };
  const providerCreatedAt = timestampIso(entity.created_at);
  const eventCreatedAt = timestampIso(event.created_at);
  if (entity.created_at !== undefined && !providerCreatedAt) return { ok: false };
  if (event.created_at !== undefined && !eventCreatedAt) return { ok: false };
  const providerStatus = (entity.status || (event.event === "refund.processed" ? "processed" : "created")).toLowerCase();
  if (providerStatus === "processed" && !eventCreatedAt) return { ok: false };
  return {
    ok: true,
    value: {
      refundId: entity.id,
      paymentId: entity.payment_id ?? null,
      amount: entity.amount / 100,
      currency: entity.currency,
      providerStatus,
      providerCreatedAt,
      processedAt: providerStatus === "processed" ? eventCreatedAt : null,
    },
  };
}
