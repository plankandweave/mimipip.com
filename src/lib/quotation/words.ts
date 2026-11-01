// A rupee amount in words, the Indian way: lakhs and crores, never millions.
//
// A quotation's total is printed twice — as digits and as words — because a
// purchase desk checks one against the other, and a figure in words is the
// one a bank or an auditor reads. "Rupees Fourteen Lakh Twenty-Three Thousand
// One Hundred and Sixty only." is the convention every Indian quotation and
// invoice follows; a figure in millions reads as foreign.

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–99 in words, hyphenated above twenty ("Twenty-Three"). */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t}-${o}` : t;
}

/** 0–999 in words, with the "and" Indian English puts after the hundreds. */
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(h ? `and ${twoDigits(rest)}` : twoDigits(rest));
  return parts.join(" ");
}

/** A whole number of rupees in words, without the "Rupees … only" frame. */
export function numberInIndianWords(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const rest = n % 1_000;
  const parts: string[] = [];
  if (crore) parts.push(`${numberInIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  // "Six Thousand and Sixty-Eight": the "and" Indian cheque-writing puts
  // before a final part under a hundred, when a larger unit came before it.
  if (rest) parts.push(rest < 100 && parts.length ? `and ${twoDigits(rest)}` : threeDigits(rest));
  return parts.join(" ");
}

/** "Rupees Fourteen Lakh Twenty-Three Thousand One Hundred and Sixty only." */
export function rupeesInWords(amount: number): string {
  return `Rupees ${numberInIndianWords(amount)} only.`;
}

/** ₹14,23,160 — Indian digit grouping, no paise. */
export function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** A rate per square foot: whole rupees stay whole (₹350), paise show when
 *  they exist (₹169.49) — a backed-out GST rate is never rounded to look
 *  tidier than the arithmetic the customer will check. */
export function formatRate(rate: number): string {
  const whole = Math.round(rate);
  if (Math.abs(rate - whole) < 0.005) return `₹${whole.toLocaleString("en-IN")}`;
  return `₹${rate.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 3,494 — square feet, whole. */
export function formatSqft(sqft: number): string {
  return Math.round(sqft).toLocaleString("en-IN");
}
