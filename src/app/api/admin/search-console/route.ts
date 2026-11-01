import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchSearchWindow, searchConsoleConfigured, resolveSite, diagnose } from "@/lib/search-console";
import { staffKey } from "@/lib/staff-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What people typed into Google to reach us, for /admin/marketing.
//
// Analytics can say a visit came from search; only Search Console knows the
// search. That was the largest blind spot in the marketing report — organic was
// a volume with no content, so there was no way to tell whether the free
// traffic arriving was people looking for murals or people looking for
// something else entirely.
//
// 28 days rather than the brief's 7: the desk is where she plans, and a month
// of terms is a far better basis for deciding what to write next than a week of
// them, especially at this volume.
//
// Separate route from GET /api/admin/marketing, for the same reason the paid
// review is separate: it makes several Google round-trips and the setup
// checklist should not wait on them.
async function keyOk(key: string): Promise<boolean> {
  const { data } = await supabase.rpc("intel_key_ok", { p_key: key });
  return !!data;
}

export async function GET(req: Request) {
  const key = await staffKey(req);
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!searchConsoleConfigured()) {
    return NextResponse.json({ configured: false, site: null, window: null, diagnosis: null });
  }

  try {
    const [window, site] = await Promise.all([fetchSearchWindow(28, 25), resolveSite()]);
    // When there is nothing to show, say why in enough detail to act on. One
    // extra call, and only on the path that is already failing.
    const diagnosis = window ? null : await diagnose();
    // `site` is reported even when the window is null. The two failures look
    // identical from the outside and need opposite fixes: no site means the
    // service account cannot see the property, while a site with no window
    // means it can see it and the query itself failed.
    return NextResponse.json({ configured: true, site, window, diagnosis });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
