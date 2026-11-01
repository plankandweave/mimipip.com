// Editorial product badges. Every one is merchant-set (or, for Signature, a
// curated studio pick) — never auto-fabricated from import dates or invented
// numbers. Order here is the display priority: a card shows the first badge,
// a product page can show them all.

import { AUTOGRAPH_LABEL } from "./pricing";

export type BadgeInput = {
  isFounders?: boolean;
  isSignature?: boolean;
  isLimited?: boolean;
  isNew?: boolean;
  isShowroom?: boolean;
  /** From the dedicated ceiling range — tag-derived (see isCeilingProduct in
   *  pricing.ts), not a merchant-set column like the others above. */
  isCeiling?: boolean;
  /** Autograph price tier (products.price_tier) — sold only on zyvorah.com. */
  isAutograph?: boolean;
};

export type Badge = {
  key: string;
  label: string;
  /** What a two-up phone card can carry beside its heart button: about 100px.
   *  "New this season" there read "NEW THIS SEA" under the heart (6 Oct 2026). */
  short: string;
  className: string;
};

export function productBadges(p: BadgeInput): Badge[] {
  const badges: Badge[] = [];
  // Autograph leads every other mark. It is the one badge that changes what the
  // shopper can DO — this design cannot be bought anywhere else — so it must
  // never be pushed off a card by an editorial pick below it.
  if (p.isAutograph) badges.push({ key: "autograph", label: AUTOGRAPH_LABEL, short: AUTOGRAPH_LABEL, className: "bg-charcoal text-surface" });
  // Founder's Favourite is the rarest, most personal mark — it leads.
  if (p.isFounders) badges.push({ key: "founders", label: "Founder's Favourite", short: "Founder's pick", className: "bg-blush text-charcoal" });
  if (p.isSignature) badges.push({ key: "signature", label: "Signature", short: "Signature", className: "bg-charcoal/90 text-surface" });
  if (p.isLimited) badges.push({ key: "limited", label: "Limited edition", short: "Limited", className: "bg-peach text-charcoal" });
  if (p.isNew) badges.push({ key: "new", label: "New this season", short: "New", className: "bg-sage text-charcoal" });
  if (p.isShowroom) badges.push({ key: "showroom", label: "Loved in our showroom", short: "Showroom pick", className: "bg-lavender text-charcoal" });
  // Practical, not editorial — a shopper needs to know this goes overhead
  // before they measure a wall for it.
  if (p.isCeiling) badges.push({ key: "ceiling", label: "Ceiling wallpaper", short: "Ceiling", className: "bg-lavender/70 text-charcoal" });
  return badges;
}
