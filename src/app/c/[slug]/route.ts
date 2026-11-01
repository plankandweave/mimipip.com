import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { TASTE_COOKIE } from "@/lib/taste";
import { isCrawler, uaFamily, VISITOR_TOKEN_RE } from "@/lib/ua";
import { requestGeo, referrerHost } from "@/lib/request-geo";
import { collabLandingUrl } from "@/lib/collab-link";
import { SLUG_RE } from "@/lib/collab-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * zyvorah.com/c/<slug> — the link a collaborating creator shares (in her bio,
 * on a Story link sticker, under a reel).
 *
 * Two jobs, in this order:
 *   1. Record the click HERE, where the request is served — no JavaScript
 *      needed, so an in-app browser that never runs the beacon still counts —
 *      with the coarse geography Cloudflare attaches (country, state, town),
 *      the referring host and whether it was a crawler. Never an IP.
 *   2. Send the visitor on to the collaboration's landing (or `?to=/path`,
 *      for a reel about one design) with utm_campaign=collab-<slug>, so the
 *      session beacon stamps the visit and everything that visitor later does
 *      — views, carts, orders — joins back to the creator on her desk.
 *
 * An unknown or cancelled slug still lands somewhere useful (the home page),
 * untagged: a dead link in a creator's bio must never be a 404.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await ctx.params;
  const slug = decodeURIComponent(raw).trim().toLowerCase();
  const url = new URL(req.url);
  const origin = url.origin;

  const db = supabaseAdmin();
  const row = db && SLUG_RE.test(slug)
    ? ((await db.from("collaborations").select("id, slug, status, landing_path").eq("slug", slug).maybeSingle()).data as
        { id: string; slug: string; status: string; landing_path: string } | null)
    : null;

  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
  if (!row || row.status === "cancelled") return NextResponse.redirect(new URL("/", origin), { status: 302, headers });

  const target = collabLandingUrl(origin, row.slug, row.landing_path, url.searchParams.get("to"));

  const ua = req.headers.get("user-agent");
  const cookieToken = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${TASTE_COOKIE}=([^;]+)`))?.[1];
  const geo = requestGeo(req);
  const referrer = req.headers.get("referer");
  after(async () => {
    const { error } = await db!.from("collaboration_clicks").insert({
      collaboration_id: row.id,
      token: cookieToken && VISITOR_TOKEN_RE.test(cookieToken) ? cookieToken : null,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      referrer_host: referrerHost(referrer),
      ua_family: uaFamily(ua),
      is_bot: isCrawler(ua),
      landing: new URL(target).pathname,
    });
    if (error) console.error("collab click not recorded:", error.message);
  });

  return NextResponse.redirect(target, { status: 302, headers });
}
