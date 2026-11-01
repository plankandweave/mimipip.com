import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { drainOutreachInbox } from "@/lib/outreach-inbox";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Drains outreach_email_queue: collab and press pitches the mailbox sweep
 * found in hello@zyvorah.com, classified, verified, scored and put on the
 * /admin/outreach desk with a dossier to the founder — the same path a
 * /collaborate form takes. See src/lib/outreach-inbox.ts.
 *
 * Auth: the cron worker sends `Authorization: Bearer <CRON_SECRET>`.
 */
async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await drainOutreachInbox();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = withCronRun("outreach-inbox", handler);
