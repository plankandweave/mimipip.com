import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Nothing that has reached the printer can be cancelled, by any client
 * (Roheena, 25 October 2026: "This cannot be an option when anything already
 * reaches the hot folder across any client … and should never appear").
 *
 * ZVY-20516 had printed and the partner portal still offered "Request
 * cancellation", because the link only hid after dispatch. Now it is offered
 * only while production can PROVE nothing of the wall is at the printer: the
 * print engine holds no job, queue row or run for its ZVY number (read from the
 * engine's own tables, `order_nos_at_printer`), and the OS reports a status
 * from before the hand-off. A pushed wall the OS did not answer for is treated
 * as at the printer — a missing answer is not proof.
 *
 * Retail checks the same engine tables inside its own database functions
 * (migration 20261025052835).
 */

/** OS print statuses that come before the wall is handed to the print engine. */
export const BEFORE_THE_PRINTER: ReadonlySet<string> = new Set([
  "received",
  "awaiting_quote",
  "awaiting_quote_accept",
  "awaiting_price",
  "awaiting_approval",
  "awaiting_payment",
  "awaiting_po",
  "awaiting_credit_approval",
  "awaiting_design",
  "awaiting_batch",
  "awaiting_release",
  "release_pending",
  "reviewing",
]);

export const AT_PRINTER_MESSAGE =
  "This order is already in production, so it can no longer be cancelled. Write to hello@zyvorah.com if something is wrong.";

/** Our own row states after which there is nothing left to cancel. */
const FINISHED = new Set(["cancelled", "dispatched", "delivered", "installed", "closed", "archived"]);

export type CancelRow = {
  status?: string | null;
  cancel_requested_at?: string | null;
  cancel_outcome?: string | null;
  os_order_id?: number | null;
  os_print_order_no?: string | null;
};

export type CancelOs = {
  printStatus?: string | null;
  printOrderNo?: string | null;
  printingAt?: string | null;
  printedAt?: string | null;
  labelReleasedAt?: string | null;
  dispatchedAt?: string | null;
} | null | undefined;

/**
 * May a partner ask to cancel this wall? `atPrinter` is the set of ZVY numbers
 * the print engine holds; pass null when that read failed, which answers no.
 */
export function partnerMayRequestCancel(row: CancelRow, os: CancelOs, atPrinter: ReadonlySet<string> | null): boolean {
  if (row.cancel_requested_at || row.cancel_outcome) return false;
  if (row.status && FINISHED.has(row.status)) return false;
  if (!atPrinter) return false;
  if (row.os_print_order_no && atPrinter.has(row.os_print_order_no)) return false;
  if (typeof row.os_order_id !== "number") return true;
  if (!os) return false;
  if (os.printOrderNo && atPrinter.has(os.printOrderNo)) return false;
  if (os.printingAt || os.printedAt || os.labelReleasedAt || os.dispatchedAt) return false;
  return Boolean(os.printStatus && BEFORE_THE_PRINTER.has(os.printStatus));
}

/** The ZVY numbers among `nos` that the print engine holds. Throws if it cannot tell. */
export async function orderNosAtPrinter(sb: SupabaseClient, nos: (string | null | undefined)[]): Promise<Set<string>> {
  const wanted = [...new Set(nos.filter((n): n is string => Boolean(n && n.trim())))];
  if (!wanted.length) return new Set();
  const { data, error } = await sb.rpc("order_nos_at_printer", { p_nos: wanted });
  if (error) throw new Error(`order_nos_at_printer: ${error.message}`);
  // A set-returning scalar function comes back as bare values; tolerate the
  // row-object shape too, so a PostgREST change cannot read as "nothing held".
  return new Set(((data ?? []) as unknown[]).map(v =>
    v && typeof v === "object" ? String(Object.values(v as Record<string, unknown>)[0]) : String(v)));
}
