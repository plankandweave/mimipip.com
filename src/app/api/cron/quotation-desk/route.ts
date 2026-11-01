import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { runQuotationDesk } from "@/lib/quotation/desk";

export const runtime = "nodejs";
// Up to three Opus reads of a whole company, plus a classifier per thread.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * The quotation desk, ON DEMAND ONLY (founder, 11 October 2026: "I don't
 * need the quotation desk to run every day. It can run only when I actually
 * use it."). No schedule calls this route; it runs when someone calls it by
 * hand. Finds customers whose latest email asks for a quotation and prepares
 * it, with its specification sheets and covering note, under a task for
 * Roheena's Send. Sends nothing. The Prepare button on the company's CRM
 * page is the everyday way in. See src/lib/quotation/desk.ts and the
 * AGENTS.md rule "Quotations".
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 */
async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const run = await runQuotationDesk();
  return NextResponse.json({ ok: true, ...run });
}

export const GET = withCronRun("quotation-desk", handler);
