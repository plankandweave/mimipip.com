/**
 * WhatsApp delivery, by deep link.
 *
 * There is no WhatsApp Business API on this account yet, and a template-based
 * send would have to clear Meta approval before it could carry a quotation. A
 * wa.me link needs none of that: the partner taps, WhatsApp opens with the
 * message and the quote link already typed, and they press send from their own
 * number — which is the number their client already knows. When the Business
 * API does land, only this file has to change.
 *
 * Safe on the client: nothing here touches a secret.
 */

/**
 * An Indian mobile as wa.me wants it — digits only, country code included, no
 * '+'. Accepts "98765 43210", "+91 98765-43210", "09876543210".
 * Returns null when it isn't a number WhatsApp could dial.
 */
export function waNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  // A bare 10-digit Indian mobile starts 6–9; assume +91, which is what every
  // number on a partner account has been so far.
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  // "0" trunk prefix on a 10-digit mobile.
  if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits.slice(1))) {
    return `91${digits.slice(1)}`;
  }
  // Already carries a country code.
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/** The share link. Omit the number and WhatsApp asks who to send it to. */
export function waShareUrl(phone: string | null, message: string): string {
  const text = encodeURIComponent(message);
  const to = waNumber(phone);
  return to ? `https://wa.me/${to}?text=${text}` : `https://wa.me/?text=${text}`;
}

/** The message that carries a quotation. Plain text — WhatsApp renders *bold*. */
export function quotationMessage(opts: {
  recipientName?: string | null;
  accountName: string;
  walls: number;
  totalInr: number;
  url: string;
}): string {
  const hi = opts.recipientName ? `Hi ${opts.recipientName}, ` : "";
  const money = `₹${Math.round(opts.totalInr).toLocaleString("en-IN")}`;
  return (
    `${hi}here is the wallpaper quotation for ${opts.accountName} — ` +
    `${opts.walls} wall${opts.walls === 1 ? "" : "s"}, ${money} incl. GST.\n\n` +
    `${opts.url}\n\n` +
    `Open the link to see every wall and its size. When you have raised the PO, ` +
    `enter the PO number on that page and the walls go straight to print.`
  );
}

/**
 * The store's own line — where a SHOPPER messages Zyvorah (the functions above
 * are the other direction: a partner sending a quote on to their client).
 *
 * A ₹25–40k made-to-measure wall is bought in a conversation about the wall,
 * the room and the size, and until 30 Sep 2026 the storefront had no number
 * anywhere, so the warmest visitors could only leave.
 */
export const STORE_WHATSAPP = "917499916485";

/** A link that opens a chat with the store, the first message already typed. */
export function storeWhatsappHref(message: string): string {
  return waShareUrl(STORE_WHATSAPP, message);
}
