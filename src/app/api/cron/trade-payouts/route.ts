import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { processNextTradePayout } from "@/lib/trade-ledger";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Backstop sweep for the trade-partner payout queue. The webhook's after()
// call to processTradePayoutFor is the fast path — this cron exists because
// after() isn't guaranteed to fire on every invocation (see
// src/app/api/cron/studio-drain's comment on the same Vercel behavior), and
// because a ledger row that fails a payout attempt (RazorpayX transiently
// down) needs somewhere to be retried from. Drains up to 20 claimable rows
// per run rather than looping until empty, to stay well inside the function
// timeout; a queue longer than that just gets finished on the next tick.
//
// Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>` — the only
// caller. trade_ledger_claim_next() itself is service-role-only in Postgres,
// so this route is the sole path that can trigger a payout sweep.
async function tick(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const viaCron = !!cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (!viaCron) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let attempted = 0;
  let paid = 0;
  const failures: string[] = [];

  for (let i = 0; i < 20; i++) {
    const outcome = await processNextTradePayout();
    if (!outcome.claimed) break; // nothing left to claim
    attempted++;
    if (outcome.ok) paid++;
    else failures.push(`${outcome.ledgerId}: ${outcome.reason}`);
  }

  return NextResponse.json({ ok: true, attempted, paid, failures });
}

export const GET = withCronRun("trade-payouts", tick);
