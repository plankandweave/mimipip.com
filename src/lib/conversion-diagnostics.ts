import { addIstDays, istDateKey } from "./ist";

export const DIAGNOSTIC_EVENTS = [
  "product_arrival", "view_item", "configuration_start", "configuration_step_1",
  "configuration_step_2", "configuration_step_3", "configuration_step_4",
  "cart_add_blocked", "cart_add_attempt", "cart_add_failed", "add_to_cart",
  "payment_window_opened", "payment_window_failed", "payment_window_dismissed", "payment_verification_failed",
  "begin_checkout", "add_shipping_info", "add_payment_info", "purchase", "sample_purchase",
  "concept_brief_open", "concept_brief_attempt", "concept_brief_failed", "concept_brief_submitted", "generate_lead",
] as const;

export function diagnosticWindow(requested: number, now = new Date()) {
  const days = Number.isFinite(requested) ? Math.max(1, Math.min(90, Math.trunc(requested))) : 28;
  const to = addIstDays(istDateKey(now), -1);
  return { days, from: addIstDays(to, 1 - days), to };
}

export function cartSignalCounts(events: Record<string, unknown>) {
  const count = (key: string) => {
    const n = Number(events[key] ?? 0);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return { serverConfirmed: count("cart_add"), browserReported: count("cart") };
}
