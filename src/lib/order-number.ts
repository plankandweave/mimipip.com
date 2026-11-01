import "server-only";

/**
 * The ZVY order number, minted by the Zyvorah print engine.
 *
 * There is ONE issuer for the whole business (Roheena, 19 Aug 2026): the engine
 * owns the counter, and the website, the partner portal, the studio, WhatsApp,
 * email and the desk are all just entry points that ask it for a number. Before
 * that, Magnitude OS derived its own — `ZVY-` + (its row id + 10000), which is
 * why every Vijay Sales order carries BOTH a portal ref (VS-000022) and an OS
 * number (ZVY-10189) for one wall. The engine has been the issuer since the
 * cutover; this is the partner portal joining it.
 *
 * Deliberately NO fallback counter. If the engine cannot be reached, the caller
 * must refuse to place the order rather than invent a number locally — a second
 * counter is the exact thing the single issuer exists to eliminate, and a
 * duplicate order number is far more expensive than a failed click.
 */

const MINT_PATH = "/order-number/mint";

export function isOrderNumberIssuerConfigured(): boolean {
  return Boolean(process.env.MIMAKI_BACKEND_URL && process.env.MIMAKI_SERVICE_KEY);
}

export type MintedOrderNumber = {
  /** The bare number, e.g. "ZVY-20447". */
  zvy: string;
  /** What to show and quote. Same as `zvy` — no prefix (Roheena, 2 Sep 2026). */
  ref: string;
  seq: number;
  /** True when this requestKey had already been minted; the same number is
   *  returned and no new one was consumed. */
  alreadyMinted: boolean;
};

/**
 * Mint (or re-fetch) the order number for `requestKey`.
 *
 * `requestKey` is the idempotency key and must be stable for the order being
 * placed — the same key always returns the same number, so a retried request
 * or a redelivered webhook can never burn a second one. Returns null on any
 * failure; the caller decides what that means, and for placing an order it
 * has to mean "don't".
 */
export async function mintOrderNumber(
  requestKey: string,
  source: "website" | "dealer" | "studio" | "whatsapp" | "email" | "manual",
): Promise<MintedOrderNumber | null> {
  if (!isOrderNumberIssuerConfigured()) {
    console.error("[order-number] issuer not configured — MIMAKI_BACKEND_URL/MIMAKI_SERVICE_KEY");
    return null;
  }
  const base = process.env.MIMAKI_BACKEND_URL!.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}${MINT_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Key": process.env.MIMAKI_SERVICE_KEY!,
      },
      // No `prefix`: one series, no prefix on it.
      body: JSON.stringify({ requestKey, source }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.error(`[order-number] mint failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const d = (await res.json()) as {
      ok?: boolean; zvy?: string; ref?: string; seq?: number; alreadyMinted?: boolean;
    };
    if (!d.ok || !d.zvy || !d.ref || typeof d.seq !== "number") {
      console.error("[order-number] mint returned an unusable body:", JSON.stringify(d));
      return null;
    }
    return { zvy: d.zvy, ref: d.ref, seq: d.seq, alreadyMinted: Boolean(d.alreadyMinted) };
  } catch (e) {
    console.error("[order-number] mint unreachable:", e);
    return null;
  }
}

/**
 * Give every printable line of a retail order its ZVY number, and copy the
 * first one onto the order as the headline the customer is shown.
 *
 * Called on the checkout path (so the confirmation can quote it) and again at
 * /api/razorpay/verify (so an order placed while the engine was unreachable is
 * still numbered before it reaches the OS). Idempotent twice over: a line that
 * already has a number is skipped, and the issuer keys each mint on the line's
 * id, so a retry returns the same number and burns none.
 *
 * Never throws and never invents a number. A retail sale must not be lost to a
 * print-engine hiccup (Roheena, 2 Sep 2026) — the order stands unnumbered and
 * the next verify pass finishes the job.
 */
export async function ensureOrderZvy(orderId: string): Promise<string | null> {
  // Service role, not the anon client. `orders` and `order_items` are RLS-on
  // with no policies (checkout writes them through security-definer RPCs), so
  // the anon key reads NOTHING here: the order lookup returned null, this
  // function returned null, and from 2 Sep to 13 Sep no retail order was ever
  // numbered — zero `source: website` rows in the issuer's ledger while the
  // customer went on seeing "#59". Silent, because "no order" is also the
  // legitimate answer for a bad id.
  const { supabaseAdmin } = await import("./supabase-admin");
  const supabase = supabaseAdmin();
  if (!supabase) {
    console.error("[order-number] SUPABASE_SERVICE_ROLE_KEY not set — cannot number the order");
    return null;
  }
  const { data: order, error: orderErr } = await supabase
    .from("orders").select("id, zvy").eq("id", orderId).maybeSingle();
  if (orderErr) console.error("[order-number] order lookup failed:", orderErr.message);
  if (!order) return null;

  const { data: items, error: itemsErr } = await supabase
    .from("order_items").select("id, zvy").eq("order_id", orderId).order("created_at", { ascending: true });
  if (itemsErr) console.error("[order-number] line lookup failed:", itemsErr.message);
  if (!items?.length) return order.zvy ?? null;

  const numbers: string[] = [];
  for (const it of items as { id: string; zvy: string | null }[]) {
    if (it.zvy) { numbers.push(it.zvy); continue; }
    const minted = await mintOrderNumber(`web-item-${it.id}`, "website");
    if (!minted) break;                     // issuer down — leave the rest for verify
    const { error } = await supabase.from("order_items").update({ zvy: minted.zvy }).eq("id", it.id);
    if (error) { console.error("[order-number] could not store line number:", error.message); break; }
    numbers.push(minted.zvy);
  }

  const headline = order.zvy ?? numbers[0] ?? null;
  if (headline && !order.zvy) {
    const { error } = await supabase.from("orders").update({ zvy: headline }).eq("id", orderId);
    if (error) console.error("[order-number] could not store headline number:", error.message);
  }
  return headline;
}
