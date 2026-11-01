import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchChannelDay } from "@/lib/ad-channels";
import { gaReportingConfigured } from "@/lib/ga-data";
import { addIstDays, istDateKey } from "@/lib/ist";
import { staffKey } from "@/lib/staff-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The paid-channel review for /admin/marketing — the same numbers, verdicts and
// flags as the 08:00 IST mail, because it is the same call (fetchChannelDay).
//
// Until this existed the marketing page knew only about the campaigns the
// engine itself launches on Meta. Every rupee actually being spent was on
// Google Ads, and the only place that showed it was an email: the page the
// founder opens to plan the month said nothing about where the money went.
//
// Separate from GET /api/admin/marketing on purpose: this makes a dozen GA and
// Meta round-trips, and the setup checklist should not wait on them.
async function keyOk(key: string): Promise<boolean> {
  const { data } = await supabase.rpc("intel_key_ok", { p_key: key });
  return !!data;
}

export async function GET(req: Request) {
  const key = await staffKey(req);
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // "Yesterday" on the shop's clock — GA's day is never complete before then.
  // Today rides along, marked incomplete, so a campaign launched this morning
  // is visible this afternoon rather than tomorrow.
  const dateKey = addIstDays(istDateKey(), -1);
  try {
    return NextResponse.json(await fetchChannelDay(dateKey, gaReportingConfigured(), { withToday: true }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
