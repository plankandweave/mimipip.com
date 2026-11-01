// Pure rule for the quotations an account still owes a PO on. Read by
// GET /api/corporate/quotes and pinned by pending-quotes.test.ts.

/** One quotation still waiting for its purchase order — what the account's
 *  "Waiting on you" list shows, so the team sees it, not only the inbox it was
 *  mailed to. Nothing here is money: the PO is entered on the quotation page. */
export type PendingQuote = {
  token: string; walls: number; totalInr: number; sentBy: string; sentTo: string | null;
  createdAt: string; expiresAt: string;
};

/** Pure: which quotation rows still wait for a PO at `now`. */
export function pendingQuotes(rows: Record<string, unknown>[], now: number): PendingQuote[] {
  return rows
    .filter((q) => !q.approved_at && !q.declined_at && !q.group_ref
      && new Date(String(q.expires_at)).getTime() > now)
    .map((q) => ({
      token: String(q.token),
      walls: Number(q.walls ?? 0),
      totalInr: Number(q.total_inr ?? 0),
      sentBy: String(q.created_by_email ?? ""),
      sentTo: (q.recipient_name as string | null) || (q.recipient_email as string | null) || (q.recipient_phone as string | null) || null,
      createdAt: String(q.created_at),
      expiresAt: String(q.expires_at),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
