// Server-only: puts cleared Library films on the zyvorah.com page their link
// names, and takes them down again.
//
// The page is not typed anywhere. A film is filed with a zyvorah.com link and
// a trigger reads it into (site_kind, site_handle) — /products/karma is
// ('product','karma'), /installation is ('page','installation'); migrations
// 20260928213000 and 20260930120000. Clearance IS the approval (Roheena,
// 28 Sep 2026): a film whose voice, music and listening review are all
// settled goes live with no second tap, and `site_enabled` is the one switch
// that keeps a cleared film off. Amazon cuts never go on.
//
// One pass, run by /api/cron/site-films every ten minutes:
//   wanted and not live (or its file changed) → copy to the public store,
//     size-checked, under its content hash → site_state 'live'.
//   live but no longer wanted → 'off'. site_films() only returns 'live', so
//     the film is gone from the page the moment this row is written.
//   a copy that fails → 'failed' with the reason in site_error, retried up to
//     MAX_ATTEMPTS, and reported by the cron route as a failed run until fixed.
//
// Captions and a poster for films filed without a cover are made first, by
// film-captions.ts — best-effort, never a reason to keep a cleared film off.
// A live film whose captions or poster changed is copied out again.

import { revalidatePath } from "next/cache";
import { hasServiceRole, serviceClient } from "./db";
import { privateBucket } from "@/lib/r2-media";
import { MEDIA_BASE, R2_DOMAIN_BASE } from "@/lib/media-url";
import { prepareFilms } from "./film-captions";
import { copyToPublic, publicFilmKey } from "./library-publish";
import { isCleared, normaliseClearance } from "./library-record";
import { bumpCatalogueVersion } from "@/lib/catalogue-cache";
import { SITE_FILM_KINDS, type SiteFilmKind } from "@/lib/site-films";

const LIBRARY = "marketing_asset_library";
const MAX_ATTEMPTS = 5;

type Row = {
  id: string;
  title: string;
  format: string | null;
  width: number | null;
  height: number | null;
  media_key: string | null;
  media_sha256: string | null;
  cover_key: string | null;
  captions_key: string | null;
  captions_sha256: string | null;
  clearance: unknown;
  site_kind: string | null;
  site_handle: string | null;
  site_enabled: boolean;
  site_state: string;
  site_media_url: string | null;
  site_poster_url: string | null;
  site_captions_sha256: string | null;
  site_error: string | null;
  site_attempts: number;
};

export type SiteFilmPass = {
  published: string[];
  retired: string[];
  failed: { id: string; title: string; reason: string }[];
  /** Captions and posters made this pass. A failure here is recorded on the
   *  film and retried; it never fails the run or keeps a film off. */
  prepared: { title: string; ok: boolean; reason?: string }[];
};

/** Is the live copy behind the row — another file, new or corrected
 *  captions, or a poster that now exists? Pure; pinned by the test. */
export function liveIsCurrent(row: Pick<Row, "site_state" | "site_media_url" | "media_sha256" | "captions_key" | "captions_sha256" | "site_captions_sha256" | "cover_key" | "site_poster_url">): boolean {
  if (row.site_state !== "live" || !row.media_sha256) return false;
  if (row.site_media_url !== `${R2_DOMAIN_BASE}/${publicFilmKey(row.media_sha256)}`) return false;
  if ((row.captions_key ? row.captions_sha256 : null) !== row.site_captions_sha256) return false;
  if (row.cover_key && !row.site_poster_url) return false;
  return true;
}

/** The film's captions on the public store, served from this origin. */
async function captionsUrl(row: Row): Promise<string | null> {
  if (!row.captions_key || !row.captions_sha256) return null;
  const key = `marketing-media/library/captions/${row.id}-${row.captions_sha256.slice(0, 12)}.vtt`;
  await copyToPublic(row.captions_key, key, "text/vtt; charset=utf-8", row.title);
  return `${MEDIA_BASE}/${key}`;
}

/** Why this film may not be on the site, or null when it should be. */
export function siteRefusal(row: Pick<Row, "site_kind" | "site_handle" | "site_enabled" | "format" | "clearance" | "media_key" | "media_sha256" | "width" | "height">): string | null {
  if (row.format === "meeting") return "reserved for business meetings";
  if (!row.site_kind || !row.site_handle) return "its link does not name a zyvorah.com page";
  if (!(SITE_FILM_KINDS as readonly string[]).includes(row.site_kind)) return `no ${row.site_kind} page shows Library films yet`;
  if (!row.site_enabled) return "kept off the site";
  if (row.format === "amazon") return "cut for Amazon";
  if (!isCleared(normaliseClearance(row.clearance))) return "not cleared";
  if (!row.media_key || !row.media_sha256) return "no stored video file";
  if (!row.width || !row.height) return "not measured yet";
  return null;
}

/** The storefront paths that show a page's films, so they can be refreshed. */
function pathsFor(kind: string | null, handle: string | null): string[] {
  if (!kind || !handle) return [];
  switch (kind as SiteFilmKind) {
    case "product": return [`/products/${handle}`];
    case "collection": return handle === "taash" ? ["/collections/taash", "/mati"] : [`/collections/${handle}`];
    case "concept": return [`/concepts/${handle}`, `/projects/${handle}`];
    case "page": return [`/${handle}`];
    default: return [];
  }
}

/** The poster: the film's own cover from the Library, when it has one. A
 *  missing cover is not a reason to keep a cleared film off — the player
 *  shows the first frame instead. */
async function posterUrl(row: Row): Promise<string | null> {
  if (!row.cover_key) return null;
  const source = await privateBucket();
  const head = await source?.head(row.cover_key);
  if (!head) return null;
  const ext = row.cover_key.endsWith(".png") ? "png" : "jpg";
  const tag = head.httpEtag.replace(/\W/g, "").slice(0, 16);
  return copyToPublic(row.cover_key, `marketing-media/library/covers/${row.id}-${tag}.${ext}`, ext === "png" ? "image/png" : "image/jpeg", row.title);
}

async function write(id: string, patch: Record<string, unknown>) {
  const { error } = await serviceClient().from(LIBRARY).update(patch).eq("id", id);
  if (error) throw new Error(`Library write for ${id}: ${error.message}`);
}

export async function reconcileSiteFilms(opts: { prepareBudgetMs?: number; prepareMax?: number } = {}): Promise<SiteFilmPass> {
  if (!hasServiceRole()) throw new Error("the service role is not configured; site films cannot be reconciled");
  // Captions and posters first, so a film tends to go live with them. Two a
  // pass by default: each is a container round-trip plus a Whisper call.
  let prepared: SiteFilmPass["prepared"] = [];
  try {
    prepared = await prepareFilms({ budgetMs: opts.prepareBudgetMs ?? 120_000, max: opts.prepareMax ?? 2 });
  } catch (e) {
    prepared = [{ title: "(caption pass)", ok: false, reason: e instanceof Error ? e.message : String(e) }];
  }
  const { data, error } = await serviceClient()
    .from(LIBRARY)
    .select("id,title,format,width,height,media_key,media_sha256,cover_key,captions_key,captions_sha256,clearance,site_kind,site_handle,site_enabled,site_state,site_media_url,site_poster_url,site_captions_sha256,site_error,site_attempts");
  if (error) throw new Error(`Library read: ${error.message}`);

  const pass: SiteFilmPass = { published: [], retired: [], failed: [], prepared };
  const touched = new Set<string>();

  for (const row of (data ?? []) as Row[]) {
    const refusal = siteRefusal(row);
    if (refusal) {
      if (row.site_state !== "off") {
        await write(row.id, { site_state: "off", site_error: null, site_attempts: 0 });
        pass.retired.push(row.title);
        pathsFor(row.site_kind, row.site_handle).forEach((p) => touched.add(p));
      }
      continue;
    }

    if (liveIsCurrent(row)) continue;
    if (row.site_state === "failed" && row.site_attempts >= MAX_ATTEMPTS) {
      pass.failed.push({ id: row.id, title: row.title, reason: row.site_error ?? "failed" });
      continue;
    }

    try {
      const media = await copyToPublic(row.media_key!, publicFilmKey(row.media_sha256!), "video/mp4", row.title);
      const poster = await posterUrl(row);
      const captions = await captionsUrl(row);
      await write(row.id, {
        site_state: "live",
        site_media_url: media,
        site_poster_url: poster,
        site_captions_url: captions,
        site_captions_sha256: captions ? row.captions_sha256 : null,
        // The day a film first went live on the page; new captions or a
        // poster do not restart it.
        ...(row.site_state === "live" ? {} : { site_published_at: new Date().toISOString() }),
        site_error: null,
        site_attempts: 0,
      });
      pass.published.push(row.title);
      pathsFor(row.site_kind, row.site_handle).forEach((p) => touched.add(p));
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      await write(row.id, { site_state: "failed", site_error: reason, site_attempts: row.site_attempts + 1 });
      pass.failed.push({ id: row.id, title: row.title, reason });
      if (row.site_state === "live") pathsFor(row.site_kind, row.site_handle).forEach((p) => touched.add(p));
    }
  }

  if (touched.size) {
    // site_films() reads go through the catalogue cache; a new version makes
    // every page ask again within about a minute.
    await bumpCatalogueVersion();
    for (const p of touched) {
      try { revalidatePath(p); } catch { /* the version bump already covers it */ }
    }
  }
  return pass;
}
