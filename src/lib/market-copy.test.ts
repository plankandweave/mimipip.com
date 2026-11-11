import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Every storefront surface a shopper can reach must price through the market
 * (MarketMoney / useMarket().money / MarketPricingNote), never through the
 * rupee-only formatter or a rupee baked into a string.
 *
 * This guards the leak reported on 25 Sep 2026 — a US visitor saw dollars at
 * the top of a product page and "₹200" further down — and then the sweep that
 * followed it, which found the same fault on the shopfront, the collection
 * listings, the five sector landing pages, the materials and bespoke pages and
 * both office quote tools.
 *
 * It walks the tree rather than naming files, so a NEW page is covered the day
 * it is written instead of the day someone remembers to add it here — and it
 * walks src/lib as well, because the first version did not, and a shared card
 * helper there kept printing ₹200/sq ft under every design on every collection
 * listing while every named file passed.
 */
const ROOTS = ["src/app", "src/components", "src/lib"];

/**
 * Surfaces that are not a shopper being quoted a price, each with the reason
 * it may keep rupees. Anything not listed here is held to the rule.
 */
const NOT_A_SHOPFRONT = [
  // Staff and trade desks, and machine endpoints: not a retail shopper.
  /(^|\/)(admin|studio|api)(\/|$)/,
  /partners?\//i,
  /\/(o|q|order|decide)\//,
  /account\/trade/,
  /corporate|vendor|marketing/i,
  /feeds\/|llms|well-known|spec-sheet/,
  // A past order is settled in the currency it was placed in.
  /account\/orders/,
  // Editorial and legal surfaces, verified by hand on 25 Sep 2026:
  // the ₹1-per-sq-ft women's fund (a pledge Zyvorah pays, not a price), the
  // published India shipping policy, the terms, the FAQ's India-scoped
  // answers, the India-only sample flow and its page, and a case study's
  // self-labelled illustrative arithmetic.
  /our-story|press|FounderNote|book\//,
  /shipping-policy|shipping-returns|terms|faq/,
  /samples|OrderSample|SampleOrderModal|gift-card/,
  /content\/projects/,
  // Only ever rendered for India — it returns the international block first.
  /DeliveryEstimator/,
  // Back office and outbound: invoices, emails, WhatsApp, the OS sync, the
  // marketing engine and the payment gateway all settle in rupees by design.
  /lib\/(marketing|os-sync|outreach|newsletter|whatsapp|razorpay|intel)/,
  /lib\/.*(invoice|email|agreement|payments?|ledger|self-invoice)/i,
  /lib\/(checkout-alert|account-types|sample-print|measurement-report)/,
  /lib\/(brand-knowledge|voice-concierge|room-content|concept-payment)/,
  /lib\/(ga|ga-mp|meta-capi|meta-pixel|google-ads|openai-pixel|ad-channels)\.ts/,
  /lib\/(flip-book|project-pdf|project-book)/,
  // A B2B quotation and its specification sheets: an Indian offer in rupees,
  // GST shown on its own line, sent to a named company by the founder.
  /lib\/quotation\//,
  // The rupee formatter itself, the market rules, and the India rate card the
  // rest of the site converts FROM.
  /lib\/(pricing|markets|market-seo|shipping|seo)\.ts/,
  // A chat answer about a past order still quotes the rupee total the order
  // RPC returns; the presentment currency is stored on the order but is not
  // exposed by that function yet. Tracked, not silently blessed.
  /lib\/concierge-tools/,
  // The book is a printed object sold within India only — its colophon says so.
  /lib\/taash/,
  // India's sample finishes, an India-only offer.
  /lib\/sample-finishes/,
  // Its rupee string is the PDF specification document, which is India's:
  // it sits beside the GST line, the Indian test certificates and the Indian
  // install cities. The ON-PAGE table never prints it — every finish row
  // carries rateInr and is priced in the reader's market (OfficeSpecTable).
  /lib\/office-spec/,
  // A staff-issued quotation, noindex, priced in the currency it was issued
  // in — repricing it when the customer opens the link would change the offer.
  /quote\/\[token\]/,
  // India's half of a pair: the only things that render it are
  // MarketInvoiceBreakdown (which handles every other market) and the
  // India-only sample flow.
  /components\/InvoiceBreakdown/,
  // The appliance-wraps range (wraps.zyvorah.com, ported 6 Oct 2026) is an
  // India-only line: its formats are the fridge, AC and washer sizes sold in
  // India, every price is a GST-inclusive set price "delivered across India",
  // and nothing in it can be bought yet (lib/wrap-sales-gate.ts). Converting a
  // pre-launch Indian set price into dollars would invent an offer that does
  // not exist. Revisit with the range's launch, if it ever ships abroad.
  /app\/(wraps|fridge-wraps|ac-wraps|washing-machine-wraps|dishwasher-wraps|dryer-wraps)\//,
  /components\/(Wrap[A-Z]\w*|ApplianceLanding)\.tsx$/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function shopperFacingFiles(): string[] {
  const cwd = process.cwd();
  return ROOTS.flatMap((root) => walk(join(cwd, root)))
    .map((p) => relative(cwd, p).split(sep).join("/"))
    .filter((p) => !NOT_A_SHOPFRONT.some((re) => re.test(p)))
    .sort();
}

/**
 * What is left after removing everything no shopper reads as a price: comments,
 * the `india=` half of a MarketPricingNote (that IS India's copy), aria/title
 * text about the women's fund, and the metadata helpers, which are written when
 * the page is built and carry their own market through `?market=` instead.
 */
function shopperVisible(src: string): string {
  return src
    .replace(/export async function generateMetadata[\s\S]*?\n\}\n/g, "")
    .replace(/^(export )?(async )?function \w+Description\b[\s\S]*?\n\}\n/gm, "")
    .replace(/export const metadata[\s\S]*?\n\};\n/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/india="[^"]*"/g, 'india=""')
    .replace(/india=\{"[^"]*"\}/g, 'india=""')
    .replace(/(aria-label|title)="[^"]*"/g, "")
    .replace(/^import[\s\S]*?from "[^"]*";$/gm, "");
}

test("the shopper-facing sweep actually covers the shopfront", () => {
  // If the filter ever silently swallows the storefront, every assertion below
  // would pass over an empty list. Pin the pages the whole business runs on.
  const files = shopperFacingFiles();
  for (const required of [
    "src/app/page.tsx",
    "src/app/products/[handle]/page.tsx",
    "src/app/collections/[handle]/page.tsx",
    "src/app/cart/page.tsx",
    "src/app/checkout/page.tsx",
    "src/app/office/page.tsx",
    "src/app/materials/page.tsx",
    "src/components/ProductCard.tsx",
    "src/components/ProductConfigurator.tsx",
    "src/components/office/OfficeConceptBuilder.tsx",
  ]) {
    assert.ok(files.includes(required), `${required} dropped out of the sweep`);
  }
  assert.ok(files.length > 100, `only ${files.length} files swept — the walk is broken`);
});

test("no shopper-facing file prices in rupees regardless of market", () => {
  const offenders: string[] = [];
  for (const rel of shopperFacingFiles()) {
    const cleaned = shopperVisible(readFileSync(join(process.cwd(), rel), "utf8"));
    if (/\bformatINR\b/.test(cleaned)) offenders.push(`${rel}: calls formatINR in rendered copy`);
    for (const line of cleaned.split("\n")) {
      if (line.includes("₹")) offenders.push(`${rel}: ${line.trim().slice(0, 100)}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `a shopper outside India would be quoted rupees here:\n${offenders.join("\n")}`,
  );
});
