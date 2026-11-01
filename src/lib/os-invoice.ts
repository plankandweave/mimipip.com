import { serviceFetch } from '@/brand/service-transport';
const fetch: typeof globalThis.fetch = (input, init) => serviceFetch('os', input, init);
// Mirrors a dispatch-time GST invoice into the Magnitude OS, which in turn
// creates the matching DRAFT customer invoice in Odoo with the EXACT same
// number (the storefront ZYV/<FY>/<NNNN> series is the owner of record).
//
// Env-gated: set OS_INVOICE_URL + OS_INGEST_TOKEN. Until then it's a silent
// no-op. Never throws — invoice generation / dispatch must not depend on the OS
// or Odoo being reachable. Idempotent on the invoice number at the OS end, so a
// retry (re-dispatch, replay) can't create a second Odoo move.

export type OsInvoiceLine = { desc: string; hsnSac: string; qty: number; incl: number; taxable: number };

export type OsInvoicePayload = {
  invoiceNumber: string;
  sourceRef: string;
  invoiceDate: string; // YYYY-MM-DD
  taxMode: "intra" | "inter";
  buyer: {
    name: string;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
    address?: string | null;
    placeOfSupply?: string | null;
  };
  lines: OsInvoiceLine[];
  taxableTotal: number;
  gstTotal: number;
  grandTotal: number;
  pdfUrl?: string | null;
};

export function isOsInvoiceConfigured(): boolean {
  return Boolean(process.env.OS_INVOICE_URL && process.env.OS_INGEST_TOKEN);
}

export async function pushInvoiceToOs(payload: OsInvoicePayload): Promise<boolean> {
  try {
    if (!isOsInvoiceConfigured()) return false;
    const res = await fetch(process.env.OS_INVOICE_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wallpaper-token": process.env.OS_INGEST_TOKEN!,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`os invoice ${res.status}: ${await res.text()}`);
    return true;
  } catch (e) {
    console.error("pushInvoiceToOs failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
