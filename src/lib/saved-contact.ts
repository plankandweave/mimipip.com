"use client";

const KEY = "zyv_contact_v1";

/** How long a saved address stays useful.
 *
 *  This record exists so a customer who gave their address ordering a sample
 *  is not asked for it again at checkout — a span of minutes to a few days.
 *  It is NOT a profile: an address kept for ever on a browser someone else
 *  later uses hands the next visitor a real name, phone number and street
 *  address, pre-filled into a form they can submit. Thirty days covers the
 *  actual use and bounds that. A signed-in customer's real address book lives
 *  on the server, where it belongs. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type SavedContact = {
  name: string;
  email: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
};

/** The only keys that may come back out. Both call sites SPREAD the result
 *  straight into form state, so an unvalidated parse would let anything in
 *  localStorage under this key — corrupted, hand-edited or written by an
 *  older build — set arbitrary form fields. Picking by name means the shape
 *  is guaranteed no matter what is stored. */
const FIELDS: readonly (keyof SavedContact)[] = [
  "name", "email", "phone", "line1", "city", "state", "pincode",
];

type Stored = Partial<SavedContact> & { savedAt?: number };

/** One browser-local record of the last contact and shipping address a
 *  customer typed, shared between the sample-order form and checkout.
 *
 *  Returns {} for anything it cannot vouch for: absent, unparseable, not an
 *  object, or older than MAX_AGE_MS. Never throws — private browsing and
 *  quota-blocked storage both surface as an exception on access. */
export function readSavedContact(): Partial<SavedContact> {
  if (typeof window === "undefined") return {};
  let stored: Stored;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    stored = parsed as Stored;
  } catch {
    return {};
  }

  // A record with no timestamp predates the expiry and is treated as expired
  // rather than trusted — the safe direction, and it costs one re-typing.
  const savedAt = typeof stored.savedAt === "number" ? stored.savedAt : 0;
  if (!savedAt || Date.now() - savedAt > MAX_AGE_MS) {
    clearSavedContact();
    return {};
  }

  const out: Partial<SavedContact> = {};
  for (const f of FIELDS) {
    const v = stored[f];
    if (typeof v === "string" && v) out[f] = v;
  }
  return out;
}

export function writeSavedContact(contact: Partial<SavedContact>): void {
  if (typeof window === "undefined") return;
  try {
    const merged: Stored = { ...readSavedContact(), savedAt: Date.now() };
    for (const f of FIELDS) {
      const v = contact[f];
      if (typeof v === "string" && v) merged[f] = v;
    }
    window.localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // Best-effort convenience only — private browsing and quota errors must
    // never block a checkout.
  }
}

/** Forget the address. Called on log-out: the next person at this browser is
 *  a different person, and the whole point of logging out is that the machine
 *  stops knowing who you are. */
export function clearSavedContact(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — if storage is unreadable it is also unwritable.
  }
}
