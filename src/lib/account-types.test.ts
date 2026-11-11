// The four numbers that must never drift, pinned.
//
// These are commercial rules, not preferences: an offline reseller is 40% off
// list and an AID is 25%, and the reason this file exists is that the discount
// used to be a free-text box on a form — which is how Moco came to sit at 25%
// while labelled 'offline'. If a change makes one of these fail, the change is
// wrong until Roheena says the rule itself moved.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_TYPES, ACCOUNT_TYPE_RULES, autographBlockedForType, creditCeilingFor,
  rulesFor, DEFAULT_CREDIT_LIMIT_INR, DEFAULT_CREDIT_TERMS_DAYS,
} from "./account-types";

test("resellers priced off the website list carry their fixed discount", () => {
  assert.equal(ACCOUNT_TYPE_RULES.online.discountPct, 40);
  assert.equal(ACCOUNT_TYPE_RULES.offline.discountPct, 40);
  // Furnishings 40, furniture 30 (Roheena, 11 Sep 2026).
  assert.equal(ACCOUNT_TYPE_RULES.furniture.discountPct, 30);
  assert.equal(ACCOUNT_TYPE_RULES.aid.discountPct, 25);
  assert.equal(ACCOUNT_TYPE_RULES.builder.discountPct, 25);
  for (const t of ["online", "offline", "furniture", "aid", "builder"] as const) {
    assert.equal(ACCOUNT_TYPE_RULES[t].pricingMode, "website", `${t} prices off the list`);
  }
});

test("a builder is an AID in everything but name", () => {
  const { label: _aidLabel, hint: _aidHint, ...aid } = ACCOUNT_TYPE_RULES.aid;
  const { label: _bLabel, hint: _bHint, ...builder } = ACCOUNT_TYPE_RULES.builder;
  assert.deepEqual(builder, aid);
});

test("corporate is a negotiated rate, not a discount off the list", () => {
  assert.equal(ACCOUNT_TYPE_RULES.corporate.pricingMode, "flat_rate");
  assert.equal(ACCOUNT_TYPE_RULES.corporate.discountPct, 0);
});

test("Autograph is withheld from online resellers and nobody else", () => {
  assert.equal(autographBlockedForType("online"), true);
  for (const t of ["offline", "furniture", "aid", "builder", "corporate"] as const) {
    assert.equal(autographBlockedForType(t), false, `${t} may buy Autograph`);
  }
});

test("an unclassifiable account gets the most restricted terms, not the cheapest", () => {
  // The trap this guards: falling back to a real type. 'online' looks strict
  // because it is the one type without Autograph, but it carries the LARGEST
  // discount and prints on credit — so an unreadable row would have got our
  // best terms plus permission to print before paying.
  assert.equal(autographBlockedForType(null), true);
  assert.equal(autographBlockedForType("something-new"), true);
  for (const bad of [undefined, null, "", "offline ", "AID", "reseller"]) {
    const r = rulesFor(bad);
    assert.equal(r.discountPct, 0, `${String(bad)}: no discount`);
    assert.equal(r.printGate, "payment_first", `${String(bad)}: pays first`);
    assert.equal(r.autograph, false, `${String(bad)}: no Autograph`);
    assert.equal(r.needsCreditLimit, true, `${String(bad)}: still ceilinged`);
  }
  // And it is not silently one of the five.
  assert.equal(rulesFor("nonsense").label, "Unclassified");
});

test("who pays before we print, and who is therefore exposed", () => {
  assert.equal(ACCOUNT_TYPE_RULES.online.printGate, "credit");
  assert.equal(ACCOUNT_TYPE_RULES.corporate.printGate, "credit");
  for (const t of ["offline", "furniture", "aid", "builder"] as const) {
    assert.equal(ACCOUNT_TYPE_RULES[t].printGate, "payment_first", `${t} pays upfront`);
  }
  // Needing a ceiling is exactly "prints before it pays".
  for (const t of ACCOUNT_TYPES) {
    assert.equal(
      ACCOUNT_TYPE_RULES[t].needsCreditLimit,
      ACCOUNT_TYPE_RULES[t].printGate === "credit",
      `${t}: a ceiling is needed iff it prints on credit`,
    );
  }
});

test("a credit account with no figure set falls back to the standard ceiling", () => {
  const c = creditCeilingFor({
    account_type: "online", credit_limit_inr: null, credit_terms_days: null,
  });
  assert.deepEqual(c, {
    limitInr: DEFAULT_CREDIT_LIMIT_INR, termsDays: DEFAULT_CREDIT_TERMS_DAYS, waived: false,
  });
  assert.equal(DEFAULT_CREDIT_LIMIT_INR, 200_000);
  assert.equal(DEFAULT_CREDIT_TERMS_DAYS, 30);
});

test("an owner's negotiated ceiling wins over the default", () => {
  // HomeLane, at ₹10 lakh.
  const c = creditCeilingFor({
    account_type: "online", credit_limit_inr: 1_000_000, credit_terms_days: 30,
  });
  assert.equal(c.limitInr, 1_000_000);
  assert.equal(c.waived, false);
});

test("waived is not the same as unset", () => {
  // Vijay Sales prints without a ceiling because we decided so. An account
  // nobody has finished setting up must not read the same way.
  const waived = creditCeilingFor({
    account_type: "corporate", credit_limit_inr: null, credit_terms_days: null,
    credit_limit_waived: true,
  });
  assert.deepEqual(waived, { limitInr: null, termsDays: null, waived: true });

  const unset = creditCeilingFor({
    account_type: "corporate", credit_limit_inr: null, credit_terms_days: null,
    credit_limit_waived: false,
  });
  assert.equal(unset.limitInr, DEFAULT_CREDIT_LIMIT_INR);
  assert.equal(unset.waived, false);
});

test("an account that pays upfront carries no ceiling to breach", () => {
  for (const t of ["offline", "aid", "builder"] as const) {
    const c = creditCeilingFor({ account_type: t, credit_limit_inr: null, credit_terms_days: null });
    assert.deepEqual(c, { limitInr: null, termsDays: null, waived: false }, t);
  }
});

// ─── Commercial: pays what the design costs ─────────────────────────────────
//
// Added 2026-09-08 on Roheena's rule: "Design should be either on the website,
// pricing based on the design it is… Only if it's custom, like commissioned,
// it'll be 300." A commercial client consumes rather than trades, like a
// corporate one, but buys from the CATALOGUE rather than from a private library
// at a negotiated rate — so it is the one type that pays list with nothing off.

test("a commercial account pays the catalogue price, with no discount", () => {
  assert.equal(ACCOUNT_TYPE_RULES.commercial.pricingMode, "website");
  assert.equal(ACCOUNT_TYPE_RULES.commercial.discountPct, 0);
});

test("commercial is the only type that pays list — every other website type takes a cut", () => {
  // The point of the type. If another type ever reaches 0% off list, one of the
  // two is wrong and it is worth finding out which before a quote goes out.
  for (const t of ["online", "offline", "aid", "builder"] as const) {
    assert.ok(
      ACCOUNT_TYPE_RULES[t].discountPct > 0,
      `${t} pays list, which makes 'commercial' redundant`,
    );
  }
});

test("commercial and corporate differ by price basis, not by size of client", () => {
  // Both consume rather than trade. The difference that matters is how a line
  // is priced — and it is why moving Vijay Sales to 'commercial' would abandon
  // their negotiated rate for catalogue pricing.
  assert.equal(ACCOUNT_TYPE_RULES.corporate.pricingMode, "flat_rate");
  assert.equal(ACCOUNT_TYPE_RULES.commercial.pricingMode, "website");
});

// Roheena, seeing the desk card show "Print on credit · Rs 0 of Rs 2,00,000":
// "No credit."
test("a commercial account pays before we print, and so carries no ceiling", () => {
  assert.equal(ACCOUNT_TYPE_RULES.commercial.printGate, "payment_first");
  assert.equal(ACCOUNT_TYPE_RULES.commercial.needsCreditLimit, false);
});

test("credit is extended to exactly two types, and commercial is not one", () => {
  // The list is short on purpose, and a new type joining it should be a
  // decision somebody makes rather than something a default carries in: an
  // account that prints before it pays is unsecured exposure.
  const onCredit = ACCOUNT_TYPES.filter((t) => ACCOUNT_TYPE_RULES[t].printGate === "credit");
  assert.deepEqual([...onCredit].sort(), ["corporate", "online"]);
});

test("commercial may buy Autograph — only online resellers may not", () => {
  assert.equal(ACCOUNT_TYPE_RULES.commercial.autograph, true);
  assert.equal(ACCOUNT_TYPE_RULES.online.autograph, false);
});
