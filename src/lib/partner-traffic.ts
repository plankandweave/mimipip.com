import "server-only";

/**
 * Re-label the visit a partner login happened in.
 *
 * The visit beacon (api/traffic) fires on the first page of a browser visit —
 * for a designer that is usually the portal's sign-in page, before they have
 * proved who they are — so it is recorded as "direct". Called right after a
 * partner member signs in, this marks that visit as the partner's, so a
 * designer's first visit counts as their company's traffic in the daily report
 * and not only the visits after it. See lib/partner-traffic-rules.ts.
 *
 * Kept out of corporate-auth.ts on purpose: that module is loaded under a
 * fixed import list by partner-projects-page.test.ts.
 */

import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { TASTE_COOKIE } from "@/lib/taste";
import { VISITOR_TOKEN_RE } from "@/lib/ua";
import { partnerAttribution, relabelMeta } from "@/lib/partner-traffic-rules";

/** How far back a visit can have started and still be this login's visit. */
const VISIT_WINDOW_MS = 12 * 3_600_000;

/** Best-effort, never throws: analytics must not fail a login. */
export async function relabelVisitAsPartner(
  session: { staff: boolean; account: { slug: string } } | null,
): Promise<void> {
  const partner = partnerAttribution(session);
  if (!partner) return;
  try {
    const sb = supabaseAdmin();
    const token = (await cookies()).get(TASTE_COOKIE)?.value;
    if (!sb || !token || !VISITOR_TOKEN_RE.test(token)) return;
    const { data } = await sb.from("site_events")
      .select("id, meta")
      .eq("token", token).eq("event", "session")
      .gte("created_at", new Date(Date.now() - VISIT_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false }).limit(1);
    const row = data?.[0] as { id: number; meta: Record<string, unknown> | null } | undefined;
    if (!row) return;
    await sb.from("site_events").update({ meta: relabelMeta(row.meta, partner.source) }).eq("id", row.id);
  } catch (e) {
    console.error("[partner-traffic] could not relabel visit:", e instanceof Error ? e.message : e);
  }
}
