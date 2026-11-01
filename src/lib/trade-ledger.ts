import "server-only";

import { supabaseAdmin } from "./supabase-admin";
import { createPayout } from "./razorpay";
import { sendEmail } from "./email";
import { tradePayoutEmail } from "./email-templates";
import { formatINR } from "./pricing";
import { SITE_URL } from "./seo";

// The payout half of the money engine (Phase 3). Called two ways, both going
// through the same claim → payout → release/mark-paying path so they can
// never both act on the same ledger row:
//   - inline, right after a trade order is marked paid (best-effort, fast)
//   - the /api/cron/trade-payouts sweep, for anything the inline attempt
//     missed (RazorpayX transiently down, function timed out, etc.)
//
// A row only reaches trade_ledger.status='paid' — and only gets a self-billed
// invoice — once RazorpayX's payout.processed webhook confirms the money
// actually moved (see trade_ledger_confirm_paid in 0071). createPayout() is
// always called with idempotencyKey = ledger id, so even a claim + payout
// call that "succeeds" but whose response is lost (timeout, crash) can be
// safely retried by the cron without paying twice.

type ClaimedLedger = {
  id: string;
  order_id: string;
  order_number: number;
  trade_partner_id: string;
  rzpx_fund_account_id: string | null;
  net_payout: number;
  retry_count: number;
};

export type PayoutOutcome =
  | { ok: true; claimed: true; ledgerId: string; payoutId: string }
  | { ok: false; claimed: true; ledgerId: string; reason: string }
  | { ok: false; claimed: false; reason: "nothing_to_claim" | "service_unavailable" };

async function runPayout(claim: ClaimedLedger): Promise<PayoutOutcome> {
  const admin = supabaseAdmin();
  if (!admin) return { ok: false, claimed: false, reason: "service_unavailable" };

  if (!claim.rzpx_fund_account_id) {
    // Partner has no verified bank account on file — shouldn't happen for an
    // active partner (Phase 1 requires penny-drop before activation), but
    // fail safe rather than crash the sweep. Doesn't consume a retry — this
    // isn't a transient failure, it needs a human to look at the partner row.
    await admin.rpc("trade_ledger_release", { p_id: claim.id, p_bump_retry: false });
    return { ok: false, claimed: true, ledgerId: claim.id, reason: "no_fund_account" };
  }
  if (!(claim.net_payout > 0)) {
    await admin.rpc("trade_ledger_release", { p_id: claim.id, p_bump_retry: false });
    return { ok: false, claimed: true, ledgerId: claim.id, reason: "non_positive_payout" };
  }

  const payout = await createPayout({
    fundAccountId: claim.rzpx_fund_account_id,
    amountInr: claim.net_payout,
    referenceId: `trade-ledger-${claim.id}`,
    idempotencyKey: claim.id,
    narration: `Zyvorah commission — order #${claim.order_number}`,
  });

  if (!payout) {
    // RazorpayX not configured, or the call failed — release for the cron to
    // retry. Bumps retry_count; after 5 attempts the row goes terminal
    // ('failed') rather than retrying forever.
    await admin.rpc("trade_ledger_release", { p_id: claim.id, p_bump_retry: true });
    return { ok: false, claimed: true, ledgerId: claim.id, reason: "payout_create_failed" };
  }

  await admin.rpc("trade_ledger_mark_paying", { p_id: claim.id, p_payout_id: payout.id });
  return { ok: true, claimed: true, ledgerId: claim.id, payoutId: payout.id };
}

/** Attempt payout for one specific ledger row (used right after a trade order
 *  is marked paid). No-op if the row isn't claimable (already paying/paid, or
 *  claimed by a concurrent run within the lease window). */
export async function processTradePayoutFor(ledgerId: string): Promise<PayoutOutcome> {
  const admin = supabaseAdmin();
  if (!admin) return { ok: false, claimed: false, reason: "service_unavailable" };

  const { data } = await admin.rpc("trade_ledger_claim_specific", { p_ledger_id: ledgerId });
  const claim = data as ClaimedLedger | null;
  if (!claim) return { ok: false, claimed: false, reason: "nothing_to_claim" };

  return runPayout(claim);
}

/** Claim and attempt the oldest eligible ledger row (used by the cron sweep). */
export async function processNextTradePayout(): Promise<PayoutOutcome> {
  const admin = supabaseAdmin();
  if (!admin) return { ok: false, claimed: false, reason: "service_unavailable" };

  const { data } = await admin.rpc("trade_ledger_claim_next");
  const claim = data as ClaimedLedger | null;
  if (!claim) return { ok: false, claimed: false, reason: "nothing_to_claim" };

  return runPayout(claim);
}

/** Called from the Razorpay webhook on payout.processed — generates the
 *  self-billed invoice and confirms the ledger row paid. Idempotent. */
export async function confirmTradePayoutProcessed(payoutId: string): Promise<void> {
  const admin = supabaseAdmin();
  if (!admin) return;

  const { data: ledgerRow } = await admin
    .from("trade_ledger")
    .select("id, status, trade_partner_id")
    .eq("payout_id", payoutId)
    .maybeSingle();
  if (!ledgerRow || ledgerRow.status === "paid") return; // not ours, or already confirmed

  const { generateTradeSelfInvoice } = await import("./trade-self-invoice");
  const invoice = await generateTradeSelfInvoice(ledgerRow.id);

  const { data: result } = await admin.rpc("trade_ledger_confirm_paid", {
    p_payout_id: payoutId,
    p_self_invoice_number: invoice?.number ?? null,
    p_self_invoice_url: invoice?.url ?? null,
  });
  const confirmed = result as { ok: boolean; already: boolean; id: string } | null;
  if (!confirmed?.ok || confirmed.already) return;

  // Notify the partner — best-effort, never blocks the confirmation itself.
  try {
    const { data: ledger } = await admin
      .from("trade_ledger")
      .select("net_payout, order_id, trade_partner_id")
      .eq("id", confirmed.id)
      .maybeSingle();
    const { data: partnerRow } = await admin
      .from("trade_partners")
      .select("legal_name, customer_id")
      .eq("id", ledgerRow.trade_partner_id)
      .maybeSingle();
    const { data: customer } = partnerRow?.customer_id
      ? await admin.from("customers").select("email").eq("id", partnerRow.customer_id).maybeSingle()
      : { data: null };
    const { data: order } = ledger?.order_id
      ? await admin.from("orders").select("order_number").eq("id", ledger.order_id).maybeSingle()
      : { data: null };

    if (customer?.email && ledger && order) {
      const tpl = tradePayoutEmail({
        orderNumber: order.order_number,
        netPayoutLabel: formatINR(Number(ledger.net_payout)),
        // The self-invoice lives in a private bucket and this email outlives
        // any signature, so it links to the partner's own ledger page — which
        // is auth-gated and signs the invoice fresh on each visit — rather than
        // to the file. A partner's commission and TDS terms are exactly what
        // must not be readable by URL alone.
        invoiceUrl: invoice?.url ? `${SITE_URL}/account/trade` : null,
      });
      await sendEmail({ to: customer.email, subject: tpl.subject, html: tpl.html });
    }
  } catch (e) {
    console.error("trade payout confirmation email failed:", e);
  }
}

/** Called from the Razorpay webhook on payout.failed / payout.reversed. */
export async function confirmTradePayoutFailed(payoutId: string, reason: string): Promise<void> {
  const admin = supabaseAdmin();
  if (!admin) return;
  await admin.rpc("trade_ledger_confirm_failed", { p_payout_id: payoutId, p_reason: reason });
}
