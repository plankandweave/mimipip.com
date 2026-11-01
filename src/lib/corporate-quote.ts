import "server-only";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PricedLine } from "@/lib/corporate-project";

/**
 * A partner project parked awaiting a purchase order.
 *
 * The row is written by the partner and read by whoever raises the PO, whose
 * only credential is the token in the link. So everything a reader needs to
 * decide is on the row, and nothing a reader sends is trusted beyond the PO
 * number and their name.
 */

export type QuoteLineView = {
  printName: string | null;
  widthMm: number; heightMm: number;
  areaSqft: number; excludedSqft: number;
  ratePerSqft: number; total: number;
  designUrl: string;
};

export type QuoteRow = {
  id: string;
  account_id: string;
  token: string;
  created_by_email: string;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  lines: unknown[];
  state: string | null;
  gstin: string | null;
  ship_address: string | null;
  ship_city: string | null;
  ship_pincode: string | null;
  ship_contact_name: string | null;
  ship_contact_phone: string | null;
  walls: number;
  total_sqft: number | null;
  total_inr: number | null;
  po_number: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  declined_at: string | null;
  group_ref: string | null;
  expires_at: string;
  created_at: string;
};

/** 32 random bytes, base64url. Unguessable, and short enough for WhatsApp. */
export function mintQuoteToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function fetchCorporateQuote(token: string): Promise<QuoteRow | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("corporate_quotes").select("*").eq("token", token).maybeSingle();
  return (data as QuoteRow | null) ?? null;
}

export const quoteExpired = (q: QuoteRow) => new Date(q.expires_at).getTime() < Date.now();

/** What the approver is shown — derived fresh from server-side pricing, never
 *  from anything stored as money. */
export function quoteLineViews(lines: PricedLine[]): QuoteLineView[] {
  return lines.map((l) => ({
    printName: l.printName,
    widthMm: l.widthMm, heightMm: l.heightMm,
    areaSqft: l.price.areaSqft, excludedSqft: l.price.excludedSqft,
    ratePerSqft: l.price.ratePerSqft, total: l.price.total,
    designUrl: l.designUrl,
  }));
}
