/**
 * The delivery address a partner order must carry — per ORDER, not per state.
 *
 * Until 2026-09-19 the portal shipped by state: one saved address per state,
 * auto-filled and silently reused. A Vijay Sales repeat of an Ahmedabad wall
 * (ZVY-20476) was placed for Virar with nothing typed; it inherited the
 * parent's state, the address came back blank, the OS fell back to the
 * account's last address, and two walls for two cities were boxed as one
 * carton to Shahibaug. A blank destination is therefore refused here, before
 * anything is saved or pushed — the OS never gets to guess.
 */

export type ShipTo = { address: string; city: string | null; pincode: string };

const PINCODE = /^[1-9][0-9]{5}$/;

export function checkShipTo(input: { address?: unknown; city?: unknown; pincode?: unknown }): { ok: true; value: ShipTo } | { ok: false; error: string } {
  const address = typeof input.address === "string" ? input.address.trim() : "";
  const city = typeof input.city === "string" ? input.city.trim() : "";
  const pincode = typeof input.pincode === "string" ? input.pincode.replace(/\s+/g, "") : "";
  if (address.length < 8) return { ok: false, error: "This order has no delivery address — pick a store or type the site address (it is per order, never assumed from the state)." };
  if (!PINCODE.test(pincode)) return { ok: false, error: "We could not establish a 6-digit PIN code for this address — the courier is booked on it. Type the PIN with the address, or make the address more specific." };
  return { ok: true, value: { address, city: city || null, pincode } };
}
