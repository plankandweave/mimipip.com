/**
 * What kind of account this is — and therefore what it pays (Roheena, 2 Sep 2026).
 *
 * The first question is not online-or-offline. It is whether the account TRADES
 * our product or CONSUMES it:
 *
 *   · a reseller sells our wallpaper on — through their own storefront
 *     (online), across a counter or to a client (offline), or by specifying it
 *     on someone's project (an AID, or a builder/developer);
 *   · a CORPORATE account buys at scale for itself. Vijay Sales is not trading
 *     our product: they fit out their own showrooms, from a private library we
 *     draw for them, at a rate negotiated for that work;
 *   · a COMMERCIAL account also consumes rather than trades, but buys from the
 *     CATALOGUE. Knowledge Realty fit out their own towers, and Roheena's rule
 *     is that "pricing is based on the design it is" — so they pay the list
 *     price of whatever design they choose, with no reseller discount, and the
 *     account's rate_per_sqft prices only commissioned work that has no
 *     catalogue price of its own.
 *
 * CORPORATE AND COMMERCIAL ARE NOT INTERCHANGEABLE, and the difference is the
 * price basis, not the customer's size. One negotiates a single rate for
 * everything; the other pays what each design costs. Moving Vijay Sales to
 * 'commercial' would abandon their negotiated ₹90 for catalogue pricing.
 *
 * PICKING THE TYPE SETS THE TERMS. Price basis, discount and payment gate are
 * consequences of the type, not fields anyone fills in — that is the whole
 * point. Moco sat at 25% while labelled 'offline' for weeks precisely because
 * the discount was a free-text box on a form, and nothing tied it to what the
 * account actually was.
 *
 * This table is the website's copy of the rules. THE DATABASE IS THE AUTHORITY:
 * a BEFORE INSERT OR UPDATE trigger (migration 0127) writes pricing_mode,
 * discount_pct and print_gate from account_type on every write, so the rules
 * hold no matter which system writes the row — this app, the OS partner form,
 * or someone typing into Supabase at midnight. Keep the two in step; if they
 * ever disagree, the trigger wins and this file is the bug.
 *
 * WHAT IS STILL NEGOTIABLE, and only by the owner:
 *   · a corporate account's rate_per_sqft — the work is priced per deal;
 *   · a credit ceiling above the standard one (HomeLane's ₹10 lakh);
 *   · waiving the ceiling altogether (Vijay Sales, the only one).
 * Discounts are NOT on that list. A 40% partner is a 40% partner.
 */

export const ACCOUNT_TYPES = ["online", "offline", "furniture", "aid", "builder", "corporate", "commercial"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** The standard ceiling for an account that prints before it pays: ₹2 lakh
 *  outstanding, on 30-day terms, whichever trips first. Both bounds matter —
 *  ₹2 lakh held for ninety days is as much of a problem as ₹10 lakh in a week
 *  (see the OS's zyvorah-credit, which enforces them). */
export const DEFAULT_CREDIT_LIMIT_INR = 200_000;
export const DEFAULT_CREDIT_TERMS_DAYS = 30;

export type AccountTypeRule = {
  label: string;
  /** How a line is priced: off the live catalogue, or at a negotiated rate. */
  pricingMode: "website" | "flat_rate";
  /** Off website list. Fixed by the type — never negotiated per account. */
  discountPct: number;
  /** Do they print first and pay later, or pay before we print? A credit
   *  account is invoiced and never sees a payment gateway; an account that
   *  pays upfront gets one, and needs no credit ceiling because it carries no
   *  exposure. */
  printGate: "credit" | "payment_first";
  /** May this account buy Autograph designs? Withheld from ONLINE resellers
   *  only: Autograph sells on zyvorah.com and never on a marketplace, so a
   *  partner whose storefront IS the marketplace cannot have it. Everyone
   *  else — offline, furniture, AID, builder, corporate — may. */
  autograph: boolean;
  /** True when this type prints on credit and so needs a ceiling. */
  needsCreditLimit: boolean;
  /** One line explaining the type, for the people picking it. */
  hint: string;
};

export const ACCOUNT_TYPE_RULES: Record<AccountType, AccountTypeRule> = {
  online: {
    label: "Online reseller",
    pricingMode: "website", discountPct: 40, printGate: "credit",
    autograph: false, needsCreditLimit: true,
    hint: "Resells through their own storefront or a marketplace — HomeLane, Pepperfry. No Autograph.",
  },
  offline: {
    // The FURNISHINGS trade. The value stays 'offline' so Moco and Shades keep
    // the type they have; only the label moved when furniture arrived.
    label: "Furnishings reseller",
    pricingMode: "website", discountPct: 40, printGate: "payment_first",
    autograph: true, needsCreditLimit: false,
    hint: "Sells across a counter or to a client — a furnishings shop, a showroom. Pays before we print.",
  },
  furniture: {
    // A furniture store brought into wallpaper from outside the category
    // (Roheena, 11 Sep 2026): 30 off, where the furnishings trade gets 40.
    // Otherwise the same shape of account as an offline reseller.
    label: "Furniture store",
    pricingMode: "website", discountPct: 30, printGate: "payment_first",
    autograph: true, needsCreditLimit: false,
    hint: "A furniture showroom adding wallpaper to its floor. 30% off list. Pays before we print.",
  },
  aid: {
    label: "Architect / interior designer",
    pricingMode: "website", discountPct: 25, printGate: "payment_first",
    autograph: true, needsCreditLimit: false,
    hint: "Specifies our wallpaper on a client's project. Pays before we print.",
  },
  builder: {
    label: "Builder / developer",
    pricingMode: "website", discountPct: 25, printGate: "payment_first",
    autograph: true, needsCreditLimit: false,
    hint: "Specifies our wallpaper on a development. Same terms as an AID.",
  },
  corporate: {
    label: "Corporate",
    pricingMode: "flat_rate", discountPct: 0, printGate: "credit",
    autograph: true, needsCreditLimit: true,
    hint: "Buys at scale for itself rather than reselling — Vijay Sales. Rate is negotiated per account.",
  },
  commercial: {
    label: "Commercial project",
    // Pays before we print, like every other type except the two we have
    // deliberately extended credit to. A building owner arriving through a link
    // has no trading history with us, and handing a new account ₹2 lakh of
    // unsecured exposure because it is large is how the exposure gets there.
    pricingMode: "website", discountPct: 0, printGate: "payment_first",
    autograph: true, needsCreditLimit: false,
    hint: "Fits out its own building — a lift lobby, an arrival hall, a hospital corridor. Pays the catalogue price for a catalogue design; commissioned work is charged at the account's own rate. Pays before we print.",
  },
};

export function isAccountType(v: unknown): v is AccountType {
  return typeof v === "string" && (ACCOUNT_TYPES as readonly string[]).includes(v);
}

/** What an account we cannot classify gets.
 *
 *  Deliberately not one of the five. Falling back to a REAL type was the
 *  tempting shortcut and the wrong one: 'online' looks restrictive because it
 *  is the one type without Autograph, but it also carries the largest discount
 *  (40%) and prints on credit — so an unreadable row would have been handed
 *  the most generous terms we offer and permission to print before paying.
 *
 *  Every bound here goes the other way: no discount, no Autograph, pay before
 *  we print, and a ceiling if it somehow prints anyway. It should never be
 *  reached — account_type is NOT NULL under a CHECK constraint — so if a
 *  partner ever sees "Unclassified", that is a bug worth chasing rather than
 *  a price worth honouring. */
const UNCLASSIFIED: AccountTypeRule = {
  label: "Unclassified",
  pricingMode: "website", discountPct: 0, printGate: "payment_first",
  autograph: false, needsCreditLimit: true,
  hint: "This account has no valid type — nobody should see this. Tell us.",
};

/** The rules for an account. An unrecognised or missing type gets the
 *  conservative fallback above, never a real type's terms. */
export function rulesFor(accountType?: string | null): AccountTypeRule {
  return isAccountType(accountType) ? ACCOUNT_TYPE_RULES[accountType] : UNCLASSIFIED;
}

/** Is Autograph withheld from this account? Replaces the old read of
 *  channel_kind, which was a two-value column doing this job by side effect —
 *  Vijay Sales was labelled 'offline' purely so Autograph would reach it. */
export function autographBlockedForType(accountType?: string | null): boolean {
  return !rulesFor(accountType).autograph;
}

/** What ceiling actually binds on this account.
 *
 *  `waived` is deliberately distinct from "no figure set": Vijay Sales prints
 *  without a ceiling because we decided so, and that must not read the same as
 *  a new account nobody has finished setting up. */
export function creditCeilingFor(account: {
  account_type?: string | null;
  credit_limit_inr: number | null;
  credit_terms_days: number | null;
  credit_limit_waived?: boolean | null;
}): { limitInr: number | null; termsDays: number | null; waived: boolean } {
  if (account.credit_limit_waived) return { limitInr: null, termsDays: null, waived: true };
  if (!rulesFor(account.account_type).needsCreditLimit) {
    return { limitInr: null, termsDays: null, waived: false };
  }
  return {
    limitInr: account.credit_limit_inr ?? DEFAULT_CREDIT_LIMIT_INR,
    termsDays: account.credit_terms_days ?? DEFAULT_CREDIT_TERMS_DAYS,
    waived: false,
  };
}
