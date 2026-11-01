// The OS → website hand-off for real, consented, CEO-approved photos of
// finished installs (the "On real walls" strip on product pages).
//
// The Magnitude Group OS owns consent, the privacy gate and Roheena's
// approval; it PUSHES a photo here only once all three are done, and pulls it
// back through the takedown endpoint the moment the customer changes their
// mind. The website stores and shows — and, because nobody's word is taken on
// trust, re-checks everything it can: the token, that the customer's consent
// scope really covers the site, that the design is one we actually sell, that
// the bytes are a real JPEG of a sane size, and it strips every metadata
// segment (GPS!) itself rather than believing the OS already did.
//
// CONTRACT (fixed — the OS side is built against it):
//   POST /api/installed-walls/intake   x-zyvorah-token: $ZYVORAH_WEBHOOK_TOKEN
//     {osOrderId, productHandle, city, installedAt, scope[], approvedAt,
//      imageBase64, contentType:"image/jpeg"}          → 200 {id, url}
//     idempotent on osOrderId: a re-push replaces the image and the row.
//   POST /api/installed-walls/takedown x-zyvorah-token
//     {osOrderId}                                       → 200 always (idempotent)
//
// This module is framework-free with its storage injected, so the whole
// decision path is unit-tested (installed-walls-intake.test.ts); the two route
// files are thin wrappers that plug in Supabase, R2 and the cache bump.

import { timingSafeEqual } from "node:crypto";
import { looksLikeJpeg, stripJpegMetadata } from "./jpeg-strip";

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Hard ceiling on the raw request body: 4 MB base64-encoded is ~5.6 MB, plus
 *  the small JSON envelope. Anything larger is refused before it is parsed. */
export const MAX_BODY_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 64 * 1024;
export const R2_PREFIX = "installed-walls";
/** Short edge cache on purpose: a takedown must disappear within the hour
 *  even from a visitor's browser, not live on under an immutable policy. */
export const PHOTO_CACHE_CONTROL = "public, max-age=3600";

export type InstalledWallRow = {
  id: string;
  os_order_id: number;
  product_handle: string;
  city: string;
  installed_month: string; // YYYY-MM-01
  r2_key: string;
  url: string;
  scope: string[];
  status: "published" | "withdrawn";
  approved_at: string | null;
  withdrawn_at: string | null;
};

export type IntakeDeps = {
  secret: string;
  now: () => Date;
  /** Public URL for an R2 key in the media bucket. */
  publicUrl: (key: string) => string;
  productIsActive: (handle: string) => Promise<boolean>;
  findByOrder: (osOrderId: number) => Promise<InstalledWallRow | null>;
  upsert: (row: Omit<InstalledWallRow, "id" | "withdrawn_at"> & { withdrawn_at: null }) => Promise<{ id: string }>;
  markWithdrawn: (osOrderId: number, at: string) => Promise<void>;
  putObject: (key: string, bytes: Uint8Array, cacheControl: string) => Promise<void>;
  deleteObjects: (keys: string[]) => Promise<void>;
  bumpCache: () => Promise<void>;
};

export type HandlerResult = { status: number; body: Record<string, unknown> };

/** Constant-time comparison of the shared webhook token. An unset secret
 *  refuses everything. */
export function tokenOk(got: string | null | undefined, secret: string): boolean {
  if (!secret) return false;
  const a = Buffer.from(got ?? "");
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type IntakePayload = {
  osOrderId: number;
  productHandle: string;
  city: string;
  installedMonth: string;
  scope: string[];
  approvedAt: string;
  image: Uint8Array;
};

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{0,199}$/;

function validDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** First day of the install month, in India time (an install at 11 pm IST on
 *  the 30th is still that month). Only the month is ever stored: the exact
 *  day, next to a city, narrows a home down more than a shop window needs. */
export function installedMonthOf(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" })
    .formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}-01`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-09-01" → "September 2026". Parsed as text, not a Date, so no
 *  timezone can shift it into the previous month. */
export function formatInstalledMonth(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : null;
}

/** Shape + content checks that need no storage. Returns the parsed payload or
 *  the HTTP status and reason to refuse with. */
export function validateIntake(raw: unknown, now: Date): { ok: true; value: IntakePayload } | { ok: false; status: number; error: string } {
  const bad = (status: number, error: string) => ({ ok: false as const, status, error });
  if (!raw || typeof raw !== "object") return bad(400, "body must be a JSON object");
  const b = raw as Record<string, unknown>;

  const osOrderId = b.osOrderId;
  if (typeof osOrderId !== "number" || !Number.isSafeInteger(osOrderId) || osOrderId <= 0) {
    return bad(422, "osOrderId must be a positive integer");
  }
  const productHandle = typeof b.productHandle === "string" ? b.productHandle.trim().toLowerCase() : "";
  if (!HANDLE_RE.test(productHandle)) return bad(422, "productHandle is missing or malformed");

  const city = typeof b.city === "string" ? b.city.replace(/\s+/g, " ").trim() : "";
  if (!city || city.length > 60 || /[<>{}\d@]/.test(city)) return bad(422, "city is missing or not a city name");

  const installedAt = validDate(b.installedAt);
  if (!installedAt) return bad(422, "installedAt must be an ISO date");
  if (installedAt.getTime() > now.getTime() + 36 * 3600_000) return bad(422, "installedAt is in the future");

  const approvedAt = validDate(b.approvedAt);
  if (!approvedAt) return bad(422, "approvedAt must be an ISO date");

  if (!Array.isArray(b.scope) || !b.scope.every((s) => typeof s === "string")) {
    return bad(422, "scope must be an array of strings");
  }
  const scope = [...new Set((b.scope as string[]).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (!scope.includes("site")) return bad(422, "the customer's consent does not include the website (scope 'site')");

  if (b.contentType !== "image/jpeg") return bad(422, "contentType must be image/jpeg");
  const b64 = typeof b.imageBase64 === "string" ? b.imageBase64.replace(/\s+/g, "") : "";
  if (!b64) return bad(422, "imageBase64 is empty");
  // Decoded size from the encoded length, BEFORE decoding.
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const decodedLen = Math.floor((b64.length * 3) / 4) - pad;
  if (decodedLen > MAX_IMAGE_BYTES) return bad(413, `image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
  if (b64.length % 4 !== 0 || !BASE64_RE.test(b64)) return bad(422, "imageBase64 is not valid base64");
  const image = new Uint8Array(Buffer.from(b64, "base64"));
  if (!looksLikeJpeg(image)) return bad(422, "image is not a JPEG");

  return {
    ok: true,
    value: {
      osOrderId,
      productHandle,
      city,
      installedMonth: installedMonthOf(installedAt),
      scope,
      approvedAt: approvedAt.toISOString(),
      image,
    },
  };
}

/** Every object a stored photo can have left behind: the master and the
 *  renditions the /media route generates on first request. */
export function objectKeysFor(masterKey: string): string[] {
  return [masterKey, `${masterKey}@480.webp`, `${masterKey}@1200.webp`];
}

export async function handleIntake(
  token: string | null,
  bodyText: string,
  deps: IntakeDeps,
): Promise<HandlerResult> {
  if (!tokenOk(token, deps.secret)) return { status: 401, body: { error: "unauthorised" } };
  if (bodyText.length > MAX_BODY_CHARS) return { status: 413, body: { error: "request too large" } };

  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return { status: 400, body: { error: "body is not JSON" } };
  }
  const now = deps.now();
  const v = validateIntake(raw, now);
  if (!v.ok) return { status: v.status, body: { error: v.error } };
  const p = v.value;

  if (!(await deps.productIsActive(p.productHandle))) {
    return { status: 422, body: { error: `productHandle '${p.productHandle}' is not an active product` } };
  }

  const cleaned = stripJpegMetadata(p.image);
  if (!cleaned.ok) return { status: 422, body: { error: `image rejected: ${cleaned.error}` } };

  const previous = await deps.findByOrder(p.osOrderId);
  const key = `${R2_PREFIX}/${p.osOrderId}/after-${now.getTime()}.jpg`;
  const url = deps.publicUrl(key);

  await deps.putObject(key, cleaned.bytes, PHOTO_CACHE_CONTROL);
  let id: string;
  try {
    ({ id } = await deps.upsert({
      os_order_id: p.osOrderId,
      product_handle: p.productHandle,
      city: p.city,
      installed_month: p.installedMonth,
      r2_key: key,
      url,
      scope: p.scope,
      status: "published",
      approved_at: p.approvedAt,
      withdrawn_at: null,
    }));
  } catch (err) {
    // Never leave an orphan object on the public bucket.
    await deps.deleteObjects([key]).catch(() => {});
    throw err;
  }

  // Replace: the row now points at the new object; the old one goes.
  if (previous?.r2_key && previous.r2_key !== key) {
    await deps.deleteObjects(objectKeysFor(previous.r2_key)).catch((err) => {
      console.error("[installed-walls] could not delete replaced photo", previous.r2_key, err);
    });
  }
  await deps.bumpCache();
  return { status: 200, body: { id, url, removedMetadata: cleaned.removed } };
}

export async function handleTakedown(
  token: string | null,
  bodyText: string,
  deps: Pick<IntakeDeps, "secret" | "now" | "findByOrder" | "markWithdrawn" | "deleteObjects" | "bumpCache">,
): Promise<HandlerResult> {
  if (!tokenOk(token, deps.secret)) return { status: 401, body: { error: "unauthorised" } };
  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return { status: 400, body: { error: "body is not JSON" } };
  }
  const osOrderId = (raw as { osOrderId?: unknown } | null)?.osOrderId;
  if (typeof osOrderId !== "number" || !Number.isSafeInteger(osOrderId) || osOrderId <= 0) {
    return { status: 422, body: { error: "osOrderId must be a positive integer" } };
  }

  const row = await deps.findByOrder(osOrderId);
  if (!row) return { status: 200, body: { ok: true, withdrawn: false } };

  // Delete the bytes first: a withdrawn photo must stop being servable even
  // if the row update below fails and the OS has to retry.
  await deps.deleteObjects(objectKeysFor(row.r2_key));
  if (row.status !== "withdrawn") {
    await deps.markWithdrawn(osOrderId, deps.now().toISOString());
  }
  await deps.bumpCache();
  return { status: 200, body: { ok: true, withdrawn: true } };
}
