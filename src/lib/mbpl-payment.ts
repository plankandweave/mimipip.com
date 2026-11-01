/**
 * How a customer pays Magnitude Brands Private Limited — the one place the
 * pay page (/pay) and the supply quotation read our account from.
 *
 * Every Zyvorah quotation, proforma and tax invoice links to its own signed
 * pay page (Roheena, 29 October 2026: "so we don't have to keep giving it to
 * a customer"). The amount only prefills the UPI app; what was paid is
 * decided by our bank statement, never by the page.
 * The same figures are printed by the OS (`zyvorah-payment-qr.ts`); a change
 * here is a change there too.
 */
export const MBPL_BANK = {
  bankName: "Kotak Mahindra Bank Ltd.",
  accountName: "MAGNITUDE BRANDS PRIVATE LIMITED",
  accountNumber: "8150651547",
  ifsc: "KKBK0001767",
  branch: "Baner, Pune",
} as const;

export const MBPL_UPI_ID = "magnitude.limited@kotak";
export const MBPL_PAYEE = "Magnitude Brands Private Limited";

export type PayParams = { ref: string | null; amount: number | null };

/** The UPI intent GPay, PhonePe and Paytm all open; amount and note only when known. */
export function upiLink({ ref, amount }: PayParams): string {
  const q = [
    `pa=${encodeURIComponent(MBPL_UPI_ID)}`,
    `pn=${encodeURIComponent(MBPL_PAYEE)}`,
    ...(amount ? [`am=${amount.toFixed(2)}`] : []),
    "cu=INR",
    ...(ref ? [`tn=${encodeURIComponent(ref)}`] : []),
  ];
  return `upi://pay?${q.join("&")}`;
}

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatAmount = (n: number) => `₹${inr.format(n)}`;
