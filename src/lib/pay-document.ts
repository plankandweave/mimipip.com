/**
 * The one document a pay link names, as the OS confirms it.
 *
 * The pay page shows our bank account, so it opens only when the OS says the
 * link's signature is genuine and the document is payable (OS route
 * `GET /api/zyvorah/pay/:id/:sig`). Any doubt — a malformed link, a refusal, the
 * OS unreachable — is "not found", never the page.
 */
export type PayDocument = { number: string; amount: number | null };

const ID_RE = /^[1-9][0-9]{0,9}$/;
const SIG_RE = /^[0-9a-f]{32}$/;

/** The OS's origin: the same server the invoice mirror posts to. */
export function osOrigin(): string {
  try {
    if (process.env.OS_INVOICE_URL) return new URL(process.env.OS_INVOICE_URL).origin;
  } catch { /* fall through */ }
  return "https://os.magnitudegroup.in";
}

/** Only a link of the shape the OS prints is ever asked about. */
export function isPayLinkShape(id: string, sig: string): boolean {
  return ID_RE.test(id) && SIG_RE.test(sig);
}

export async function fetchPayDocument(id: string, sig: string): Promise<PayDocument | null> {
  if (!isPayLinkShape(id, sig)) return null;
  try {
    const res = await fetch(`${osOrigin()}/api/zyvorah/pay/${id}/${sig}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { number?: unknown; amount?: unknown };
    if (typeof body.number !== "string" || !body.number) return null;
    const amount = typeof body.amount === "number" && body.amount > 0 ? Math.round(body.amount * 100) / 100 : null;
    return { number: body.number, amount };
  } catch (e) {
    console.error("pay document lookup failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
