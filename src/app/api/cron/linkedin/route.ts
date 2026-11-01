import { NextResponse } from "next/server";
import { withCronRun } from "@/lib/cron-run";
import { publishApproved } from "@/lib/marketing/pipeline";
import { LinkedInPublisher } from "@/lib/marketing/publish/linkedin";
import { hasServiceRole, serviceClient } from "@/lib/marketing/db";
import { logicalDayKey } from "@/lib/dailyRotation";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

// LinkedIn's posting slot: 09:30 IST (cron worker, "0 4 * * *" UTC).
//
// Instagram publishes at 11:30 from /api/cron/marketing. LinkedIn's audience
// reads at the start of the working day, so its approved post for the day goes
// out two hours earlier from here — LinkedIn only, nothing composed, nothing
// else touched. The 11:30 run still sweeps LinkedIn too, which is what lets a
// post approved after 09:30 on its own day go out that day.
//
// Until LinkedIn approves the page connection this records "held — not
// connected" every morning, and the desk offers the post to put up by hand.
async function tick(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const published = await publishApproved(new Date(), { channels: ["linkedin"] });

  // Today's follower count — LinkedIn only ever says "now", so the trend
  // exists only if it is written down each day (marketing_channel_stats).
  const li = new LinkedInPublisher();
  let followers: number | null = null;
  if (await li.ready()) {
    followers = await li.followers();
    if (followers !== null && hasServiceRole()) {
      const { error } = await serviceClient()
        .from("marketing_channel_stats")
        .upsert({ channel: "linkedin", day_key: logicalDayKey(), followers, recorded_at: new Date().toISOString() }, { onConflict: "channel,day_key" });
      if (error) throw new Error(`marketing_channel_stats write: ${error.message}`);
    }
  }

  return NextResponse.json({ ok: true, connected: li.configured, followers, published });
}

export const GET = withCronRun("linkedin", tick);
