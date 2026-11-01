import { NextResponse } from "next/server";
import { getProject } from "@/content/projects";
import { renderProjectBookPdf } from "@/lib/project-book-pdf";
import { renderFlipBookPdf } from "@/lib/flip-book-pdf";

import { getShopConcept } from "@/lib/shop-concepts";
import { addConceptPdfLinks } from "@/lib/concept-pdf-links";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { TASTE_COOKIE } from "@/lib/taste";
import { VISITOR_TOKEN_RE, isCrawler, uaFamily } from "@/lib/ua";

export const dynamic = "force-dynamic";
/** A dozen full-resolution fetch-and-watermark round trips comfortably
 *  exceeds the default 10s — matches the budget used for the corporate
 *  install sheet, the other image-heavy PDF in this codebase. */
export const maxDuration = 60;

/**
 * GET → the case-study book as a watermarked PDF.
 *
 * Public and unauthenticated, deliberately: these pages exist to be sent to
 * strangers, and the download exists for the person who wants to forward,
 * print or slide-deck it rather than send a link. No session, no gate — the
 * watermark is what keeps a downloaded copy identifiably ours once it starts
 * moving on its own.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const project = getProject(slug);
  if (!project || (await hiddenConceptSlugs()).has(slug))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  let bytes: Uint8Array;
  try {
    // A flip project downloads as its own landscape page grammar — one page
    // per spread, matching the left-to-right read on screen.
    bytes = await addConceptPdfLinks(
      await (project.flip
        ? renderFlipBookPdf(project)
        : renderProjectBookPdf(project)),
      slug,
      !!getShopConcept(slug),
    );
  } catch (e) {
    console.error("[projects/download] render failed:", e);
    return NextResponse.json(
      { error: "Could not build the PDF. Please try again." },
      { status: 500 },
    );
  }

  // Record the download as a first-party intent signal — best-effort, and never
  // allowed to fail the download. Downloads are low-volume (unlike page views,
  // which is why server-side event writing is otherwise off; see proxy.ts), so
  // one insert per download is safe. The browser also fires a GA4 file_download
  // event (BookTopBar's DownloadPdfLink) so the source/campaign is attributed.
  //
  // Two rules keep the count honest (week of 28 Sep 2026: Chengdu After Dark,
  // Living Journey and River House each showed 11–13 "downloads" and not one
  // reader went on to configure or add the look):
  //  - ONE row per reader, study and day (event_key). The PDF takes seconds to
  //    build and the button gave no sign of it, so readers clicked two or three
  //    times — every study's rows came in threes, seconds apart.
  //  - No visitor cookie means automated. The download button only exists on a
  //    page whose visit beacon (TrafficSource) mints the cookie first, so a
  //    cookieless request never loaded that page in a browser: from 1 October
  //    almost every row was one, walking study after study ten seconds apart.
  //    Kept, flagged is_bot, so the report's human count excludes it.
  try {
    if (req.method !== "HEAD") void logDownload(req, slug, project);
  } catch (e) {
    console.error("[projects/download] event log threw:", e);
  }

  const filename = `Zyvorah-${project.slug}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Rebuilding a 12-image PDF per request is fine at this project's
      // traffic, but a minute of edge caching absorbs a burst (someone
      // spamming the button, a crawler) without every hit re-fetching and
      // re-watermarking a dozen images.
      "Cache-Control": "private, no-store",
    },
  });
}

async function logDownload(
  req: Request,
  slug: string,
  project: { title: string; client: string },
) {
  const raw = (await cookies()).get(TASTE_COOKIE)?.value;
  const token = raw && VISITOR_TOKEN_RE.test(raw) ? raw : null;
  const ua = req.headers.get("user-agent");
  const isBot = isCrawler(ua) || !token;
  // A cookieless request has no visitor to key on; its address and agent stand
  // in, hashed into the key and never stored.
  const who =
    token ??
    `anon:${req.headers.get("cf-connecting-ip") ?? ""}:${ua ?? ""}`;
  const day = new Date().toISOString().slice(0, 10);
  const eventKey = createHash("sha256")
    .update(`case_study_download:${who}:${slug}:${day}`)
    .digest("hex");
  const meta = {
    title: project.title,
    client: project.client,
    ...(token ? {} : { cookieless: true }),
  };

  const db = supabaseAdmin();
  if (!db) {
    const { error } = await supabase.rpc("log_site_event", {
      p_token: token,
      p_event: "case_study_download",
      p_handle: slug,
      p_meta: meta,
      p_is_bot: isBot,
      p_ua_family: uaFamily(ua),
    });
    if (error) console.error("[projects/download] event log failed:", error.message);
    return;
  }
  const { error } = await db.from("site_events").insert({
    token,
    event: "case_study_download",
    product_handle: slug,
    meta,
    event_key: eventKey,
    is_bot: isBot,
    ua_family: uaFamily(ua),
    emitted_by: "server",
    token_presented: !!token,
    schema_version: 1,
  });
  // 23505 = this reader already downloaded this study today: not an error.
  if (error && error.code !== "23505")
    console.error("[projects/download] event log failed:", error.message);
}
