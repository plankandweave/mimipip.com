/** Partner-facing progress uses recorded production facts, never elapsed time. */
export const ORDER_LANES = [
  { id: "waiting", title: "Waiting on", description: "Approval, payment or information", tone: "amber" },
  { id: "production", title: "In production", description: "Preparing artwork and printing", tone: "indigo" },
  { id: "dispatch", title: "Printed · awaiting pickup", description: "Label on the box · courier collects it", tone: "emerald" },
  { id: "archive", title: "Dispatched & archived", description: "Completed orders and their records", tone: "stone" },
] as const;
export type OrderLane = typeof ORDER_LANES[number]["id"];
export type BoardOrder = {
  imageUrl?: string;
  key: string; ref: string; name: string; po: string | null;
  group: string | null; osId: number | null; batch: string | null;
  width: number | null; height: number | null; stage: string;
  attention: string | null; createdAt: string | null; dispatchedAt: string | null;
  courier: string | null; pod: string | null; trackingUrl: string | null;
  location: string; fromDesk: boolean;
};
export type BoardDocument = {
  id: number; number: string; kind: string; orderId?: number | null;
  groupRef?: string | null; batchRef?: string | null;
  grandTotal: number | null; createdAt: string | null; sentAt: string | null;
};
export function orderLane(o: BoardOrder): OrderLane {
  if (o.attention) return "waiting";
  if (o.dispatchedAt || ["Dispatched", "Delivered", "Cancelled", "Canceled", "Closed"].includes(o.stage)) return "archive";
  if (["Printing complete", "Awaiting pickup"].includes(o.stage)) return "dispatch";
  if (["Draft", "Awaiting payment", "Needs attention"].includes(o.stage)) return "waiting";
  return "production";
}
export function documentsForOrder(o: BoardOrder, docs: BoardDocument[]): BoardDocument[] {
  return docs.filter(d => (o.osId != null && d.orderId === o.osId)
    || Boolean(o.group && d.groupRef === o.group)
    || Boolean(o.batch && d.batchRef === o.batch));
}
export function groupBoardOrders(rows: BoardOrder[], query = "", docs: BoardDocument[] = []) {
  const groups = new Map<string, BoardOrder[]>();
  for (const row of rows) {
    const key = row.group ? `group:${row.group}` : row.batch ? `batch:${row.batch}` : row.key;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const term = query.trim().toLowerCase();
  return [...groups.entries()].map(([key, items]) => {
    const lane = ORDER_LANES.find(l => items.some(o => orderLane(o) === l.id))!.id;
    return { key, items, lane };
  }).filter(g => !term || g.items.some(o => [o.ref, o.name, o.po, o.pod, o.courier, o.location,
    ...documentsForOrder(o, docs).map(d => d.number)].filter(Boolean).join(" ").toLowerCase().includes(term)))
    .sort((a, b) => {
      const date = (items: BoardOrder[]) => Math.min(...items.map(o => Date.parse(o.createdAt ?? "") || 0));
      return a.lane === "archive" && b.lane === "archive" ? date(b.items) - date(a.items) : date(a.items) - date(b.items);
    });
}

/**
 * A store proposal waiting on the partner's approval, as board rows — one per
 * wall still to approve, grouped as one order, in "Waiting on" (Roheena,
 * 25 Oct 2026: the EBD Gurgaon proposal had gone to Vijay Sales, and the board
 * still said "Waiting on: 0 orders"). The "Waiting on you" strip already led
 * with it; the board now counts it too.
 */
export type ProposalBatch = { id: string; title: string; storeName?: string | null; city?: string | null; awaitingApproval?: number; createdAt?: string | null };
export const PROPOSAL_ROW_PREFIX = "proposal-";
export function proposalBoardRows(batches: readonly ProposalBatch[]): BoardOrder[] {
  return batches.filter(b => (b.awaitingApproval ?? 0) > 0).flatMap(b => {
    const n = b.awaitingApproval!;
    const store = b.storeName ?? b.title;
    return Array.from({ length: n }, (_, i): BoardOrder => ({
      key: `${PROPOSAL_ROW_PREFIX}${b.id}-${i + 1}`, ref: store,
      name: `Wall ${i + 1} of ${n} · artwork ready for your approval`,
      po: null, group: null, osId: null, batch: `site-batch:${b.id}`,
      width: null, height: null, stage: "Awaiting your approval",
      attention: "Proposal sent — approve the artwork and it goes to print",
      createdAt: b.createdAt ?? null, dispatchedAt: null, courier: null, pod: null, trackingUrl: null,
      location: b.city ?? "", fromDesk: false,
    }));
  });
}
