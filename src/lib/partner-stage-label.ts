export type OsStageFacts = {
  printStatus: string | null; stage: string | null; dispatchedAt: string | null;
  labelReleasedAt?: string | null; archivedAt?: string | null;
  /** The courier's delivered scan (Delhivery's OTP handover), never ours. */
  deliveredAt?: string | null;
};

/** OS stages that come after the wall left us. The OS only moves forward. */
const PAST_DISPATCH = ["dispatched", "install_scheduled", "installed", "closed"];

/** Collapse the OS's internal states into the handful a customer cares about. */
export function labelFor(os: OsStageFacts | undefined, fallback: string): string {
  // Pre-production states are ours, not the OS's — a draft has never been sent.
  if (fallback === "draft") return "Draft";
  if (!os) {
    if (fallback === "push_failed") return "Needs attention";
    if (fallback === "frozen" || fallback === "po_received") return "Confirmed";
    // The OS could not be read (slow, or restarting on a deploy). A wall it has
    // already finished is remembered on our own row by `settledStatus`, so it
    // stays out of "In production" instead of falling back to "Received".
    if (fallback === "delivered") return "Dispatched";
    if (fallback === "cancelled") return "Cancelled";
    return "Received";
  }
  // A wall the OS cancelled, or one finished without a dispatch date (installed,
  // closed, archived off the desk), used to fall through to "Rendering" and hold
  // its whole site job under "In production" (Vijay Sales Bhosari, 25 Oct 2026).
  if (os.printStatus === "cancelled") return "Cancelled";
  if (os.deliveredAt) return "Delivered";
  if (os.dispatchedAt || os.printStatus === "dispatched" || PAST_DISPATCH.includes(os.stage ?? "")) return "Dispatched";
  if (os.archivedAt) return "Closed";
  // Printing done splits in two for the partner (Roheena 2026-07-29): the run
  // coming off the machine, and the piece checked + boxed waiting on a
  // courier. One "Printed" label made that wait look like nothing happening.
  if (os.labelReleasedAt || os.stage === "label_released") return "Awaiting pickup";
  if (os.printStatus === "printed" || os.stage === "printed" || os.stage === "qc_hold") return "Printing complete";
  // Held by the payment gate: the partner needs to pay before anything prints,
  // and the proforma carrying the UPI QR is already in their inbox.
  if (os.printStatus === "awaiting_payment") return "Awaiting payment";
  if (os.printStatus === "queued_for_print" || os.stage === "printing") return "Pending printing";
  if (os.printStatus === "needs_input") return "Needs attention";
  return "Rendering";
}

/**
 * The portal's own status for a wall the OS has finished, or null while it is
 * still live. Written onto `corporate_orders.status` whenever the OS says so,
 * so the board is right on a read where the OS does not answer (Vijay Sales,
 * 25 Oct 2026: 21 dispatched walls still read `in_production` on our row).
 */
export function settledStatus(os: OsStageFacts | undefined | null): "delivered" | "cancelled" | null {
  if (!os) return null;
  const label = labelFor(os, "");
  if (label === "Cancelled") return "cancelled";
  if (label === "Dispatched" || label === "Delivered" || label === "Closed") return "delivered";
  return null;
}
