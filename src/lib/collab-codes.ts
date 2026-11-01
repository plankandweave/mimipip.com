// Creator collaboration codes — the store's OWN discount authority.
//
// THE RULE (Roheena, 7 October 2026). A UGC collaboration gifts a creator a
// wallpaper makeover in return for deliverables. The Magnitude OS mints codes
// for three reasons (os-discount.ts) and the store caps them at 50%; a
// collaboration is the FOURTH reason, and it is minted HERE, on a row of
// `collaborations`, because it is bound to things only this store knows:
//
//   • the creator's EMAIL — the code is personal; typed by anyone else at
//     checkout it is refused (`wrong_email`);
//   • optionally the DESIGNS it covers — every line in the cart must be one
//     of `allowed_handles`, or the code is refused (`wrong_design`);
//   • a percentage up to 100 and an optional rupee ceiling;
//   • one use: redeemed when the order is confirmed, never before.
//
// Everything below the lookup is a pure function over the row, so the
// refusals are pinned by collab-codes.test.ts without a database.

export const CODE_RE = /^[A-Z0-9-]{4,60}$/;

export type CollabCodeRow = {
  id: string;
  slug: string;
  name: string;
  email: string;
  status: string;
  code: string;
  discount_pct: number;
  max_value_inr: number | null;
  allowed_handles: string[] | null;
  free_shipping: boolean;
  code_expires_at: string | null;
  order_id: string | null;
  redeemed_at: string | null;
};

export type CollabRefusal =
  | "already_redeemed"
  | "expired"
  | "not_allowed"
  | "wrong_email"
  | "wrong_design";

/** What a buyer presents alongside the code. Either may be unknown yet (the
 *  cart page checks before an email is typed): an unknown value is not
 *  checked, and /api/checkout re-runs the check with everything known. */
export type Buyer = {
  email?: string | null;
  cartHandles?: string[] | null;
};

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Why this collaboration's code may not be used by this buyer, or null when
 * it may. Order matters: a cancelled or spent code is refused before anyone
 * learns whose it is.
 */
export function collabRefusalFor(row: CollabCodeRow, buyer: Buyer, now: Date = new Date()): CollabRefusal | null {
  if (row.status === "cancelled") return "not_allowed";
  if (row.order_id || row.redeemed_at) return "already_redeemed";
  if (row.code_expires_at && new Date(row.code_expires_at).getTime() <= now.getTime()) return "expired";
  if (buyer.email && norm(buyer.email) !== norm(row.email)) return "wrong_email";
  if (row.allowed_handles && row.allowed_handles.length > 0 && buyer.cartHandles && buyer.cartHandles.length > 0) {
    const allowed = new Set(row.allowed_handles.map(norm));
    if (buyer.cartHandles.some((h) => !allowed.has(norm(h)))) return "wrong_design";
  }
  return null;
}

/** "p•••a@gmail.com" — enough for the creator to recognise their own address,
 *  not enough for anyone else to learn it from the checkout. */
export function emailHint(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  const u = user ?? "";
  const shown = u.length <= 2 ? u.slice(0, 1) : `${u[0]}•••${u[u.length - 1]}`;
  return `${shown}@${domain}`;
}

/** A code from a name: "Priya Sharma" → ZYV-PRIYA-7K2Q. Random tail so two
 *  Priyas never collide and a guess never lands. */
export function suggestCode(name: string, random: () => number = Math.random): string {
  const first = name.trim().split(/\s+/)[0]?.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12) || "CREATOR";
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 4; i++) tail += alphabet[Math.floor(random() * alphabet.length)];
  return `ZYV-${first}-${tail}`;
}

/** A tracking slug from a handle or a name: "@priya.sharma_" → "priya-sharma". */
export function suggestSlug(handleOrName: string): string {
  const s = handleOrName
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s.length >= 3 ? s : `${s}creator`.slice(0, 40);
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** The campaign every visit a collaboration brings is stamped with. */
export const campaignFor = (slug: string) => `collab-${slug}`;

/** The link the creator shares — redirects to their landing with the UTMs. */
export const trackingPath = (slug: string) => `/c/${slug}`;
