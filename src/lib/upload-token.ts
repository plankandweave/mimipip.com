// Signed upload targets for /api/media-upload — the replacement for Supabase
// Storage's createSignedUploadUrl now that product-images lives in R2.
//
// Same trust shape as before: a gated server route BUILDS the path and mints
// a token for exactly that path; the browser then sends bytes with the token
// and can neither choose nor change where they land. The token is an HMAC
// over {path, upsert, exp} with the service-role key — a secret that already
// lives only in the Worker's env and never in client JS.

import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("upload token secret not configured");
  return s;
};

const b64url = (b: Buffer) => b.toString("base64url");

/** `bucket` is absent for product-images (the default target),
 *  "corporate-art" for the private store and "presentations" for a client
 *  film — /api/media-upload routes on it. */
type UploadBucket = "corporate-art" | "presentations";
type Claims = { path: string; upsert: boolean; exp: number; bucket?: UploadBucket };

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

export function mintUploadToken(
  path: string,
  opts: { upsert: boolean; ttlSeconds: number; bucket?: UploadBucket },
): string {
  const claims: Claims = { path, upsert: opts.upsert, exp: Math.floor(Date.now() / 1000) + opts.ttlSeconds };
  if (opts.bucket) claims.bucket = opts.bucket;
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  return `${payload}.${sign(payload)}`;
}

/** The claims a token authorises, or null for anything invalid/expired. */
export function verifyUploadToken(token: string): Claims | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims: Claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  if (typeof claims.path !== "string" || typeof claims.exp !== "number") return null;
  if (claims.exp * 1000 < Date.now()) return null;
  return claims;
}
