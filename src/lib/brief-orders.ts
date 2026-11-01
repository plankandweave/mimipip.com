import { isInternalOrder } from "./internal-orders";

type BriefOrder = { payment_status?: string; email?: string | null; placed_via?: string | null; total?: unknown };

/** intel_snapshot is an order-created cohort, not a paid_at cash ledger.
 * Missing identity cannot safely be counted as an acquired customer. */
export function briefOrders<T extends BriefOrder>(orders: T[]) {
  const paid = orders.filter((order) => order.payment_status === "paid");
  const owner = paid.filter((order) => isInternalOrder(order.email));
  const unidentified = paid.filter((order) => !order.email?.trim());
  const customer = paid.filter((order) => order.email?.trim() && !isInternalOrder(order.email));
  const samples = customer.filter((order) => order.placed_via === "sample");
  const retail = customer.filter((order) => order.placed_via !== "sample");
  const revenue = (rows: T[]) => rows.reduce((sum, order) => {
    const amount = Number(order.total);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
  return { customer, owner, unidentified, samples, retail, customerRevenue: revenue(customer), retailRevenue: revenue(retail) };
}
