import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { runNextSlots, publishApproved } from "@/lib/marketing/pipeline";
import { backfillMetrics } from "@/lib/marketing/insights";
import { configuredChannels } from "@/lib/marketing/publish";
import { releasePrivateShorts } from "@/lib/marketing/publish/youtube";
import { drainLongform } from "@/lib/marketing/youtube-longform-run";
import { hasServiceRole } from "@/lib/marketing/db";
import { consumeAdDecisions, monitorCampaigns } from "@/lib/marketing/ads/orchestrator";
import { consumeOutreachDecisions } from "@/lib/marketing/sends";
import { metaConfigured } from "@/lib/marketing/ads/meta";
import { sendsArmed } from "@/lib/marketing/sends";
import { intelReady } from "@/lib/marketing/intel";

export const runtime = "nodejs";
export const maxDuration = 300; // reels can take ~30s each to render + upload
export const dynamic = "force-dynamic";

// The autonomous marketing tick. Scheduled by vercel.json crons.
// Each run, in order:
//   1. ORGANIC — backfill matured post metrics (learn), then generate + compose
//      + safety-gate + (if a channel is configured) publish the next post.
//   2. PAID — monitor live campaigns (pull performance → ledger, apply kill rule),
//      then consume founder-approved ad decisions (plan → cap-check → launch).
//   3. OUTREACH — consume founder-approved outreach decisions (draft + safety-gate;
//      send only if armed, else stage).
// Everything is idempotent (slot_key / decision_id), so a retry never double-acts.
// Spend only ever flows through the cap-enforced ledger; customer sends only fire
// when explicitly armed. Absent credentials, each stage prepares and records.
//
// Auth: same CRON_SECRET Bearer scheme as the other crons (Vercel sends it).
async function tick(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const count = Math.min(Number(url.searchParams.get("count") ?? 1), 3);

  // 1) ORGANIC — learn, then create, then POST WHAT WAS APPROVED.
  //
  // The third step did not exist, and without it the design was a loop with no
  // exit: composition always writes a slot unapproved, so the publish branch
  // inside runSlot could never be reached, and a slot approved afterwards was
  // `queued` — which counts as already done. The founder could approve a week
  // and nothing would ever post.
  const metricsUpdated = await backfillMetrics().catch(() => 0);
  const posted = await runNextSlots(count);
  const published = await publishApproved();
  // The day Google's API audit passes, Shorts that went up private turn public.
  const shortsReleased = await releasePrivateShorts().catch((e) => ({ error: (e as Error).message }));
  // Widescreen Library films Roheena approved for YouTube: uploaded as
  // ordinary videos, each outcome (and any reason it was held) named.
  const longform = await drainLongform().catch((e) => ({ error: (e as Error).message }));

  // 2) PAID — monitor first (so kills happen before new spend), then consume.
  const monitored = await monitorCampaigns().catch(() => ({ checked: 0, paused: 0 }));
  const ads = await consumeAdDecisions().catch(() => []);

  // 3) OUTREACH — draft + (staged unless armed) send.
  const outreach = await consumeOutreachDecisions().catch(() => []);

  return NextResponse.json({
    ok: true,
    capabilities: {
      serviceRole: hasServiceRole(),
      intelBridge: intelReady(),
      liveSocialChannels: configuredChannels(),
      metaAds: metaConfigured(),
      customerSendsArmed: sendsArmed(),
    },
    organic: {
      metricsUpdated,
      posted: posted.map((o) => ({ slot: o.slotKey, handle: o.handle, pillar: o.pillar, format: o.format, status: o.status, safety: o.safetyPassed, url: o.url, error: o.error })),
      // Named, with the reason a held slot was held — "2 published, 3 held" on
      // its own cannot tell you whether the held ones are waiting for their day
      // or waiting for a credential.
      published,
      shortsReleased,
      longform,
    },
    paid: { monitored, decisions: ads },
    outreach,
  });
}

export const GET = withCronRun("marketing", tick);
