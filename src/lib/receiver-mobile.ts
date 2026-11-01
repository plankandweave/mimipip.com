// The receiver's mobile on a partner order (founder, 14 October 2026).
//
// Delhivery will not take a parcel without a mobile it can ring, and the OS now
// pauses any parcel that has none. So the portal asks for it where the parcel's
// address is given — the store, the order, the batch — and refuses a landline or
// a half-typed number there, rather than finding out on the factory floor.
//
// Vijay Sales is the one exception to "required": every Vijay Sales parcel goes
// to Abhay, and the OS carries that mobile itself (VIJAY_SALES_RECEIVER_MOBILE),
// so a store may leave the field blank. A number that IS typed must still be a
// real one for every account.
//
// Pure, no server machinery, so the stores form can use the same rule as the
// routes (the same reason ./phone is split out).

import { toIndianMobile } from "./phone";

export const VIJAY_SALES_SLUG = "vijay-sales";

export type ReceiverMobile =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/** The ten-digit mobile to store, or the sentence that tells the person what to fix. */
export function receiverMobile(accountSlug: string, raw: unknown): ReceiverMobile {
  const typed = String(raw ?? "").trim();
  if (!typed) {
    if (accountSlug === VIJAY_SALES_SLUG) return { ok: true, value: null };
    return { ok: false, error: "Add the mobile number of the person who will receive the parcel — the courier will not take it without one." };
  }
  const mobile = toIndianMobile(typed);
  if (!mobile) {
    return { ok: false, error: "That isn't a mobile number — give the 10-digit mobile of the person receiving the parcel (a landline can't be rung by the courier)." };
  }
  return { ok: true, value: mobile };
}
