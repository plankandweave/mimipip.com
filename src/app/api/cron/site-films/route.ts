import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { reconcileSiteFilms } from "@/lib/marketing/site-film-publish";

export const runtime = "nodejs";
export const maxDuration = 300; // the caption pass: container + Whisper, two films a tick
export const dynamic = "force-dynamic";

/**
 * Puts cleared Library films live on the zyvorah.com page their link names,
 * and takes down any that are no longer cleared or were switched off. See
 * src/lib/marketing/site-film-publish.ts.
 *
 * A film that cannot be published fails the run (500) until it is fixed, so
 * the cron ledger shows it instead of the page quietly going without.
 *
 * Auth: the cron worker sends `Authorization: Bearer <CRON_SECRET>`.
 */
async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const pass = await reconcileSiteFilms();
  if (pass.failed.length) {
    // Thrown, not returned: withCronRun records a throw's message in cron_runs.
    const reasons = pass.failed.map((f) => `“${f.title}”: ${f.reason}`).join("; ");
    throw new Error(`site films failed (published ${pass.published.length}, retired ${pass.retired.length}) — ${reasons}`);
  }
  return NextResponse.json({ ok: true, ...pass });
}

export const GET = withCronRun("site-films", handler);
