import { supabase } from "./supabase";
import { generateGstInvoice } from "./gst-invoice";
import { generateExportInvoice, isInternationalPresentment, parsePresentment } from "./export-invoice";

/**
 * The one dispatch-time invoice call. An order presented in INR gets the GST
 * tax invoice; an order presented in USD gets the commercial (export)
 * invoice. Both callers of generateGstInvoice used to be blind to the
 * currency, so a US order would have been issued an INR tax invoice with 18%
 * GST backed out of a dollar figure. Idempotent and never throws past its
 * callers' own try/catch — a document must never block a dispatch.
 */
export async function generateDispatchInvoice(orderId: string): Promise<string | null> {
  let notes: string | null = null;
  try {
    const { data } = await supabase.from("orders").select("notes").eq("id", orderId).maybeSingle();
    notes = (data as { notes?: string | null } | null)?.notes ?? null;
  } catch (e) {
    console.error("dispatch-invoice: could not read order notes:", e);
  }
  if (isInternationalPresentment(parsePresentment(notes))) return generateExportInvoice(orderId);
  return generateGstInvoice(orderId);
}
