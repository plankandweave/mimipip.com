// The pure half of the `presentations` store (lib/presentation-store.ts):
// signing, the legacy-URL rewrite and Range parsing. No bindings and no Supabase client, so node:test covers it.
//
// Signed URLs replace storage's createSignedUrl: an HMAC (keyed by the
// service-role key, which never reaches a client) over exactly
// `presentations/<path>|<exp>`, verified by /api/files/presentations/[...path].

import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "presentations/";
/** Absolute, because signed links leave the app: they are embedded in decks
 *  served from a sandboxed (opaque) origin and handed to the AI passes. */
export const PRES_SITE_BASE = "https://zyvorah.com";

const secret = () => {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("presentations signing secret not configured");
  return s;
};

export function presSign(path: string, exp: number): string {
  return createHmac("sha256", secret()).update(`${PREFIX}${path}|${exp}`).digest("base64url");
}

/** Constant-time check of a presented signature for exactly path/exp. */
export function presVerify(path: string, exp: number, sig: string): boolean {
  let expected: string;
  try {
    expected = presSign(path, exp);
  } catch {
    return false;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function presSignedUrlFor(path: string, expiresInSeconds: number, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + Math.max(60, Math.round(expiresInSeconds));
  const q = new URLSearchParams({ exp: String(exp), sig: presSign(path, exp) });
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${PRES_SITE_BASE}/api/files/presentations/${encodedPath}?${q}`;
}

// Decks composed before the move to R2 carry Supabase signed URLs for their
// pictures, minted for ten years. Each one a recipient's browser follows is
// storage egress, so a deck is rewritten as it is read: the same object, the
// same bearer-URL trust, served from R2 instead. `&amp;` never appears — a
// storage signed URL has the one `token` parameter.
const LEGACY_SIGNED =
  /https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/sign\/presentations\/([^?"'\s<>)]+)\?token=[A-Za-z0-9._-]+/g;

/** How long a rewritten deck picture stays valid. The deck itself is served
 *  no-store and re-signed on every open, so this only has to outlive a tab. */
const REWRITE_TTL = 7 * 24 * 60 * 60;

export function rewriteLegacySignedUrls(html: string, now = Date.now()): string {
  if (!html.includes("/storage/v1/object/sign/presentations/")) return html;
  return html.replace(LEGACY_SIGNED, (whole, encoded: string) => {
    let path: string;
    try {
      path = encoded.split("/").map(decodeURIComponent).join("/");
    } catch {
      return whole;
    }
    if (!path || path.split("/").includes("..")) return whole;
    return presSignedUrlFor(path, REWRITE_TTL, now);
  });
}

export type ByteRange = { offset: number; length: number };

/** One `bytes=` range against an object of `size`, or null for "serve it
 *  whole" (absent, multi-range, malformed). "unsatisfiable" is a 416. */
export function parseRange(header: string | null, size: number): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return "unsatisfiable";
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const start = Number(m[1]);
  if (start >= size) return "unsatisfiable";
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (end < start) return null;
  return { offset: start, length: end - start + 1 };
}
