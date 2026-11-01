// The decisions that decide whether a request is staff — separated from the
// environment (secrets, JWKS fetch, Next) so they can be tested for real rather
// than reasoned about. staff-access.ts composes these; the rules live here.

/**
 * Paths Cloudflare Access fronts, and therefore the ONLY paths where the
 * `cf-access-authenticated-user-email` header means anything.
 *
 * This is the sharp edge of the whole change. On a path inside an Access
 * application, Cloudflare sets that header itself and overwrites any copy the
 * caller sent, so it is proof. On every other path — /api/admin/* included — it
 * is an ordinary header that anyone can type, and trusting it there would hand
 * the entire admin surface to a one-line curl. The Access application covers
 * zyvorah.com/admin and /studio; nothing else.
 */
const ACCESS_FRONTED_RE = /^\/(?:admin|studio)(?:\/|$)/;

export function accessHeaderTrustedFor(pathname: string): boolean {
  return ACCESS_FRONTED_RE.test(pathname);
}

export type Claims = { email?: unknown; aud?: unknown; exp?: unknown };

/** Are a Cloudflare Access token's claims acceptable — right application, not
 *  expired, carries an identity? Signature checking is the caller's job. */
export function acceptableAccessClaims(
  claims: Claims,
  expectedAud: string,
  nowSeconds: number,
): { email: string } | null {
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(expectedAud)) return null;
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) return null;
  if (typeof claims.email !== "string" || !claims.email.trim()) return null;
  return { email: claims.email.trim().toLowerCase() };
}

// --- our own staff session cookie ------------------------------------------

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const fromB64url = (value: string) => new Uint8Array(Buffer.from(value, "base64url"));

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signStaffSession(
  secret: string,
  email: string,
  expSeconds: number,
): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ email, exp: expSeconds })));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${b64url(new Uint8Array(signature))}`;
}

export async function verifyStaffSession(
  secret: string,
  value: string | undefined,
  nowSeconds: number,
): Promise<{ email: string } | null> {
  if (!value) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromB64url(signature).buffer as ArrayBuffer,
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: unknown;
      exp?: unknown;
    };
    if (typeof claims.email !== "string" || !claims.email) return null;
    if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) return null;
    return { email: claims.email };
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
