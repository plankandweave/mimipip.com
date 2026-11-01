import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { hasServiceRole, serviceClient } from "@/lib/marketing/db";
import { privateBucket, type R2Bucket } from "@/lib/r2-media";
import { probeMp4 } from "@/lib/marketing/mp4-probe";
import { DIVISIONS, divisionsFor, filmOf, isDivision, routeFilm } from "@/lib/marketing/video-divisions";
import { LANGUAGES, isLanguage } from "@/lib/marketing/film-language";
import { CLEARANCE_ITEMS, asPosts, canClear, clearanceOnApprovedUpload, deriveStatus, normaliseClearance, parsePostUrl, type Post } from "@/lib/marketing/library-record";
import { verifyPost, worthRechecking } from "@/lib/marketing/library-verify";
import { approveLongform, runLongform } from "@/lib/marketing/youtube-longform-run";
import { normaliseVtt, saveCaptions } from "@/lib/marketing/film-captions";
import { inspectLibraryFilm } from "@/lib/marketing/library-upload";
import { siteRefusal } from "@/lib/marketing/site-film-publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const table = "marketing_asset_library";
const err = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const validUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "zyvorah.com";
  } catch { return false; }
};

// Measure a stored film from R2 with ranged reads — only the box headers and
// the `moov` box, never the whole file.
async function measureStored(bucket: R2Bucket, key: string) {
  const head = await bucket.head(key);
  if (!head) return null;
  return probeMp4(async (offset, length) => {
    const len = Math.min(length, head.size - offset);
    if (len <= 0) return new Uint8Array();
    const obj = await bucket.get(key, { range: { offset, length: len } });
    return obj ? new Uint8Array(await obj.arrayBuffer()) : new Uint8Array();
  }, head.size);
}

/** Films filed before the Library measured uploads are measured here on the
 *  first load — a few small ranged reads each — so every card's check rests on
 *  the file and nobody runs a script or refreshes to finish it. */
const BACKFILL_PER_LOAD = 30;

/** Unproven YouTube/Instagram posts asked about again per load. */
const RECHECK_PER_LOAD = 10;

export async function GET(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  if (!hasServiceRole()) return err("Marketing storage is unavailable", 503);
  const db = serviceClient();
  const { data, error } = await db.from(table).select("*").order("created_at", { ascending: false }).limit(200);
  if (error) return err(error.message, 500);
  const rows = (data ?? []) as Record<string, unknown>[];
  const unmeasured = rows.filter((r) => r.media_key && "width" in r && r.width == null).slice(0, BACKFILL_PER_LOAD);
  const bucket = unmeasured.length ? await privateBucket() : null;
  if (bucket) {
    await Promise.all(unmeasured.map(async (row) => {
      const m = await measureStored(bucket, String(row.media_key)).catch(() => null);
      if (!m) return;
      const patch = { width: m.width, height: m.height, duration_s: m.durationS };
      const { error: e } = await db.from(table).update(patch).eq("id", row.id);
      if (!e) Object.assign(row, patch);
    }));
  }
  // Every measured film sits in the division its shape and length belong to.
  // A film someone filed where it does not fit is moved, not flagged.
  await Promise.all(rows.map(async (row) => {
    const film = filmOf(row as Parameters<typeof filmOf>[0]);
    if (!film || !isDivision(row.format)) return;
    const format = routeFilm(row.format, film);
    if (format === row.format) return;
    const { error: e } = await db.from(table).update({ format, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (!e) row.format = format;
  }));
  // Posts the platform could not confirm last time — or confirmed as private —
  // are asked about again, and every film's status is recomputed from its
  // posts, so a status is never stale and never someone's say-so.
  let budget = RECHECK_PER_LOAD;
  await Promise.all(rows.map(async (row) => {
    const posts = asPosts(row.posts);
    let changed = false;
    for (const [i, p] of posts.entries()) {
      if (budget <= 0 || !worthRechecking(p)) continue;
      budget--;
      const parsed = parsePostUrl(p.url);
      if ("error" in parsed) continue;
      const verdict = await verifyPost(parsed.platform, parsed.ref);
      // A refusal on a re-check (the video was deleted, say) is recorded as
      // an unproven post with the reason, never silently dropped.
      const next = "refuse" in verdict ? { verified: false, unverified_reason: verdict.refuse } : verdict;
      posts[i] = { ...p, verified: next.verified, verified_at: next.verified_at, evidence: next.evidence ?? p.evidence, unverified_reason: next.unverified_reason };
      changed = true;
    }
    const status = deriveStatus(posts);
    if (!changed && status === row.status) return;
    const { error: e } = await db.from(table).update({ posts, status, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (!e) Object.assign(row, { posts, status });
  }));
  // Why each film is or is not on its zyvorah.com page, in words — the same
  // rule the publisher applies — and what each live film did with shoppers
  // (people, not events: marketing_film_stats).
  for (const row of rows) row.site_refusal = siteRefusal(row as Parameters<typeof siteRefusal>[0]);
  const { data: statRows, error: statError } = await db.rpc("marketing_film_stats", { p_days: 3650 });
  if (statError) console.error("[library] film stats:", statError.message);
  const stats = Object.fromEntries(((statRows ?? []) as { film_id: string }[]).map((r) => [r.film_id, r]));
  return NextResponse.json({ assets: rows, stats, viewer: { email: staff.email, canClear: canClear(staff.email) } }, { headers: { "cache-control": "no-store" } });
}

// PUT avoids vinext treating a multipart POST as a progressive Server Action
// (and applying its 1 MB limit before this authenticated route is reached).
export async function PUT(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  if (!canClear(staff.email)) return err("Only Roheena can approve and add a finished film to the Library.", 403);
  if (!hasServiceRole()) return err("Marketing storage is unavailable", 503);
  const bucket = await privateBucket();
  if (!bucket) return err("Private media storage is unavailable", 503);

  const form = await req.formData().catch(() => null);
  if (!form) return err("Upload form is required");
  const title = String(form.get("title") ?? "").trim().slice(0, 180);
  const wallpaper = String(form.get("wallpaper") ?? "").trim().slice(0, 250);
  const productUrl = String(form.get("productUrl") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim().slice(0, 2000);
  const format = String(form.get("format") ?? "");
  const language = String(form.get("language") ?? "");
  const video = form.get("video");
  const cover = form.get("cover");
  if (!title || !wallpaper || !validUrl(productUrl)) return err("Title, wallpaper or concept, and a Zyvorah URL are required");
  if (!isDivision(format)) return err(`Choose where the film is for: ${DIVISIONS.map((d) => d.label).join(", ")}`);
  if (!isLanguage(language)) return err(`Choose what the film is spoken in: ${LANGUAGES.map((l) => l.label).join(", ")}`);
  if (!(video instanceof File) || video.type !== "video/mp4" || video.size < 1000 || video.size > 100_000_000) {
    return err("Choose an MP4 video under 100 MB");
  }
  if (cover && (!(cover instanceof File) || !["image/jpeg", "image/png"].includes(cover.type) || cover.size > 10_000_000)) {
    return err("Cover must be a JPG or PNG under 10 MB");
  }
  const id = randomUUID();
  const mediaKey = `marketing-library/${id}/film.mp4`;
  const coverKey = cover instanceof File ? `marketing-library/${id}/cover.${cover.type === "image/png" ? "png" : "jpg"}` : null;
  const { measured, digest } = await inspectLibraryFilm(video);
  if (!measured) return err("That file could not be read as an MP4 video (no size or length in its header). Export it again as H.264 MP4.");
  try {
    await bucket.put(mediaKey, video.stream(), { httpMetadata: { contentType: "video/mp4", cacheControl: "private, no-store" } });
    if (cover instanceof File && coverKey) await bucket.put(coverKey, cover.stream(), { httpMetadata: { contentType: cover.type, cacheControl: "private, no-store" } });
  } catch {
    await bucket.delete([mediaKey, ...(coverKey ? [coverKey] : [])]).catch(() => {});
    return err("Could not store the film", 500);
  }
  const parseJson = (key: string) => {
    try { return JSON.parse(String(form.get(key) ?? "{}")); } catch { return {}; }
  };
  const { data, error } = await serviceClient().from(table).insert({
    id, title, wallpaper, product_url: productUrl, notes,
    status: "not been posted yet", format: routeFilm(format, measured), language, media_key: mediaKey,
    width: measured.width, height: measured.height, duration_s: measured.durationS,
    cover_key: coverKey, media_sha256: digest, instagram: parseJson("instagram"),
    youtube: parseJson("youtube"), created_by: staff.email,
    clearance: clearanceOnApprovedUpload(staff.email, language, new Date().toISOString()),
  }).select("*").single();
  if (error) {
    await bucket.delete([mediaKey, ...(coverKey ? [coverKey] : [])]).catch(() => {});
    return err(error.message, 500);
  }
  return NextResponse.json({ asset: data }, { status: 201 });
}

// Retain compatibility with callers already using the original route.
export const POST = PUT;

type Row = Record<string, unknown> & { id: string };

/** Recording a post, removing one, clearing a film and linking versions are
 *  actions, each with its own check. `status` is not among them: it is
 *  computed from the posts, never set by hand. */
async function act(action: string, body: Record<string, unknown>, row: Row, email: string): Promise<Response> {
  const db = serviceClient();
  const now = new Date().toISOString();
  const save = async (patch: Record<string, unknown>) => {
    const { data, error } = await db.from(table).update({ ...patch, updated_at: now }).eq("id", row.id).select("*").single();
    return error ? err(error.message, 500) : NextResponse.json({ assets: [data] });
  };

  if (action === "record_post") {
    const parsed = parsePostUrl(String(body.url ?? ""));
    if ("error" in parsed) return err(parsed.error);
    const posts = asPosts(row.posts);
    if (posts.some((p) => p.url === parsed.url)) return err("That link is already recorded on this film.");
    const verdict = await verifyPost(parsed.platform, parsed.ref);
    if ("refuse" in verdict) return err(verdict.refuse, 422);
    const post: Post = { id: randomUUID(), platform: parsed.platform, url: parsed.url, recorded_at: now, recorded_by: email, ...verdict };
    const next = [...posts, post];
    return save({ posts: next, status: deriveStatus(next) });
  }

  if (action === "remove_post") {
    const posts = asPosts(row.posts);
    const gone = posts.find((p) => p.id === body.postId);
    if (!gone) return err("That post is not recorded on this film.");
    const next = posts.filter((p) => p.id !== gone.id);
    const removed = [...asPosts(row.removed_posts), { ...gone, removed_at: now, removed_by: email }];
    return save({ posts: next, removed_posts: removed, status: deriveStatus(next) });
  }

  if (action === "clear") {
    if (!canClear(email)) return err("Only Roheena can clear a film for public use.", 403);
    const item = CLEARANCE_ITEMS.find((i) => i.key === body.item);
    const state = body.state;
    if (!item || (state !== "cleared" && state !== "n/a" && state !== "pending")) return err("Unknown clearance item or state");
    const evidence = String(body.evidence ?? "").trim().slice(0, 500);
    if (state !== "pending" && evidence.length < 8) return err(`Write what proves the ${item.label.toLowerCase()} — a licence, a date, what you checked.`);
    const clearance = normaliseClearance(row.clearance);
    clearance[item.key] = state === "pending"
      ? { state, cleared_at: now, cleared_by: email, evidence: evidence || "Reopened" }
      : { state, cleared_at: now, cleared_by: email, evidence };
    return save({ clearance });
  }

  if (action === "publish_youtube") {
    // A public upload is a commitment only Roheena makes: her tap is the
    // approval, written on the film, and the pipeline runs at once. Anything
    // it cannot finish now is retried by the hourly marketing cron.
    if (!canClear(email)) return err("Only Roheena can approve a film for YouTube.", 403);
    try { await approveLongform(row.id, email, email); } catch (e) { return err((e as Error).message, 409); }
    const outcome = await runLongform(row.id);
    const { data } = await db.from(table).select("*").eq("id", row.id).single();
    if (outcome.state === "published") return NextResponse.json({ assets: [data], outcome });
    return NextResponse.json({ error: outcome.error ?? `Not published (${outcome.state})`, assets: [data], outcome }, { status: 422 });
  }

  if (action === "save_captions") {
    // A correction replaces the automatic captions. The site and YouTube
    // copies follow from the new file on their next pass.
    const checked = normaliseVtt(String(body.vtt ?? ""));
    if ("error" in checked) return err(checked.error);
    try {
      return save(await saveCaptions({ id: row.id, captions_key: (row.captions_key as string | null) ?? null }, checked.vtt));
    } catch (e) { return err((e as Error).message, 500); }
  }

  if (action === "retry_captions") {
    // Captions gave up after repeated failures; try again on the next pass.
    return save({ captions_attempts: 0, captions_error: null });
  }

  if (action === "link_version") {
    if (typeof body.otherId !== "string" || body.otherId === row.id) return err("Choose another film to link.");
    const { data: other } = await db.from(table).select("id,version_group").eq("id", body.otherId).maybeSingle();
    if (!other) return err("That film is not in the library.");
    const mine = row.version_group as string | null;
    const theirs = other.version_group as string | null;
    const group = theirs ?? mine ?? randomUUID();
    // Two existing groups become one: everything in mine joins theirs.
    if (mine && theirs && mine !== theirs) {
      const { error } = await db.from(table).update({ version_group: group, updated_at: now }).eq("version_group", mine);
      if (error) return err(error.message, 500);
    }
    const { error } = await db.from(table).update({ version_group: group, updated_at: now }).in("id", [row.id, other.id]);
    if (error) return err(error.message, 500);
    const { data, error: e } = await db.from(table).select("*").eq("version_group", group);
    return e ? err(e.message, 500) : NextResponse.json({ assets: data });
  }

  if (action === "unlink_version") {
    const group = row.version_group as string | null;
    if (!group) return err("This film is not linked to any other.");
    const { error } = await db.from(table).update({ version_group: null, updated_at: now }).eq("id", row.id);
    if (error) return err(error.message, 500);
    // A group of one is no group.
    const { data: left } = await db.from(table).select("id").eq("version_group", group);
    if ((left ?? []).length === 1) await db.from(table).update({ version_group: null, updated_at: now }).eq("version_group", group);
    const ids = [row.id, ...(left ?? []).map((r) => r.id as string)];
    const { data, error: e } = await db.from(table).select("*").in("id", ids);
    return e ? err(e.message, 500) : NextResponse.json({ assets: data });
  }

  return err("Unknown action");
}

export async function PATCH(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  if (!hasServiceRole()) return err("Marketing storage is unavailable", 503);
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string") return err("Asset ID is required");

  if (typeof body.action === "string") {
    const { data: row, error } = await serviceClient().from(table).select("*").eq("id", body.id).maybeSingle();
    if (error) return err(error.message, 500);
    if (!row) return err("That film is not in the library.", 404);
    return act(body.action, body, row as Row, staff.email);
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 2000);
  // The one switch that keeps a cleared film off zyvorah.com. Turning it back
  // on also clears a failed copy's count, so the publisher tries again.
  if (typeof body.site_enabled === "boolean") {
    patch.site_enabled = body.site_enabled;
    if (body.site_enabled) Object.assign(patch, { site_attempts: 0, site_error: null });
  }
  if (body.language !== undefined) {
    if (!isLanguage(body.language)) return err("Unknown language");
    patch.language = body.language;
  }
  if (body.format !== undefined) {
    if (!isDivision(body.format)) return err("Unknown division");
    // A film can only be moved to a division that takes its shape and length.
    const { data: current } = await serviceClient().from(table).select("width,height,duration_s").eq("id", body.id).maybeSingle();
    const film = current ? filmOf(current) : null;
    if (film && !divisionsFor(film).some((d) => d.key === body.format)) {
      return err(`This film belongs in ${divisionsFor(film).map((d) => d.label).join(", ")}.`);
    }
    patch.format = body.format;
  }
  const { data, error } = await serviceClient().from(table).update(patch).eq("id", body.id).select("*").single();
  if (error) return err(error.message, 500);
  return NextResponse.json({ asset: data, assets: [data] });
}
