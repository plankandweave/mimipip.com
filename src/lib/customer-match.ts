// Customer Match (Google Ads) / Custom Audiences (Meta): the consent contract
// and the hashing that turns an opted-in customer into an upload row.
//
// Only people who ticked the ads-personalisation box — recorded in
// marketing_consents (migration 20260928110000) — are ever exported. Nobody
// already in the database qualifies: email-marketing consent is a different
// purpose under the DPDP Act, and some of it was set by the act of signing in.

import "server-only";

import { createHash } from "node:crypto";
import { normalisePhone } from "./google-ads";

export { ADS_CONSENT_POLICY_VERSION } from "./ads-consent";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Google's email normalisation: trim, lowercase, and for gmail.com /
 *  googlemail.com drop the dots in the local part. Null for anything that
 *  isn't an address. */
export function normaliseMatchEmail(raw: string | null | undefined): string | null {
  const e = raw?.trim().toLowerCase();
  if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return null;
  const [local, domain] = e.split("@");
  if (domain === "gmail.com" || domain === "googlemail.com") return `${local.replace(/\./g, "")}@${domain}`;
  return e;
}

export type MatchRow = { email: string; phone: string };

/** One hashed upload row, or null when the person has neither usable field. */
export function hashMatchRow(contact: { email: string | null; phone: string | null }): MatchRow | null {
  const email = normaliseMatchEmail(contact.email);
  const phone = normalisePhone(contact.phone);
  if (!email && !phone) return null;
  return { email: email ? sha256(email) : "", phone: phone ? sha256(phone) : "" };
}

/** Google Ads "Customer list" CSV: headers exactly Email,Phone; hashed values. */
export function matchCsv(rows: MatchRow[]): string {
  return ["Email,Phone", ...rows.map((r) => `${r.email},${r.phone}`)].join("\n") + "\n";
}

export const csvSha256 = sha256;
