/** Verify gateway records against the server's order before retiring exclusive artwork. */
export function capturedConceptPayment(
  expected: { gatewayId: string; orderNumber: number },
  gateway: { id?: string; receipt?: string; status?: string; currency?: string; amount?: number; amount_paid?: number },
  payments: { id?: string; order_id?: string; status?: string; currency?: string; amount?: number }[],
): string | null {
  if (gateway.id !== expected.gatewayId || gateway.receipt !== `order-${expected.orderNumber}` || gateway.status !== "paid" || gateway.currency !== "INR" || !gateway.amount || gateway.amount_paid !== gateway.amount) return null;
  return payments.find(p => p.order_id === expected.gatewayId && p.status === "captured" && p.currency === "INR" && p.amount === gateway.amount && typeof p.id === "string")?.id ?? null;
}
