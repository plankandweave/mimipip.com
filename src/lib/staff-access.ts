import "server-only";

import {
  acceptableAccessClaims,
  accessHeaderTrustedFor,
  readCookie,
  signStaffSession,
  verifyStaffSession,
} from "./staff-access-claims";

// Who is signed in as staff — decided by Cloudflare Access (Google), never by a
// shared secret somebody types into the page.
//
// WHY THIS REPLACED THE ADMIN KEY. Access gated the /admin and /studio *pages*,
// but underneath, every page asked for an "admin key", kept it in localStorage,
// and sent it to ~22 API routes and ~46 SECURITY DEFINER RPCs. That key, not the
// sign-in, was the real lock: anyone holding it could read orders, CRM, vendor
// and royalty data from any browser on earth without ever signing in, and
// nothing about that would look unusual in a log. One sign-in, one gate.
//
// TWO WAYS A REQUEST PROVES ITSELF:
//
//  1. The staff session cookie, signed by us. Unforgeable without the signing
//     secret, and valid on every path — which is why /api/* reads this.
//
//  2. The Cloudflare Access identity: the injected header on the paths Access
//     actually fronts (see accessHeaderTrustedFor — the header is worthless
//     anywhere else), or a JWT whose signature verifies against the team's
//     published keys.
//
// /admin/staff-session is the bridge between them: an Access-fronted path that
// turns the verified identity into the cookie the rest of the app reads.

const TEAM_DOMAIN = "zyvorah.cloudflareaccess.com";

// The Access application's Audience tag ("Zyvorah Staff Admin"). Not a secret —
// it is the JWT `aud`, and pinning it stops a token minted for some other Access
// application in this account from being accepted here.
const ACCESS_AUD = "fe80bc262bc516b89d4ce64a11e23d0ae8b4727231b2142e1ea75840d445b0c3";

export const STAFF_COOKIE = "zyvorah_staff";
export const STAFF_SESSION_SECONDS = 60 * 60 * 12;

export type Staff = { email: string };

const now = () => Math.floor(Date.now() / 1000);

/** The secret the staff cookie is signed with. STAFF_SESSION_SECRET when set;
 *  otherwise the admin key already held in admin_config, which is server-only
 *  and never reaches a browser. The fallback exists so this cannot be deployed
 *  into a runtime that silently signs with nothing — and rotating the admin key
 *  simply ends every open session, which is the right direction to fail. */
async function sessionSecret(): Promise<string | null> {
  if (process.env.STAFF_SESSION_SECRET) return process.env.STAFF_SESSION_SECRET;
  const { elevatedKey } = await import("./elevated-key");
  return (await elevatedKey()) ?? null;
}

export async function mintStaffSession(email: string): Promise<string | null> {
  const secret = await sessionSecret();
  if (!secret) return null;
  return signStaffSession(secret, email, now() + STAFF_SESSION_SECONDS);
}

async function staffFromCookie(value: string | undefined): Promise<Staff | null> {
  if (!value) return null;
  const secret = await sessionSecret();
  if (!secret) return null;
  return verifyStaffSession(secret, value, now());
}

// --- Cloudflare Access JWT -------------------------------------------------

type Jwk = JsonWebKey & { kid?: string };
let jwksCache: { at: number; keys: Jwk[] } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function jwks(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  try {
    const res = await fetch(`https://${TEAM_DOMAIN}/cdn-cgi/access/certs`);
    if (!res.ok) return jwksCache?.keys ?? [];
    const body = (await res.json()) as { keys?: Jwk[] };
    jwksCache = { at: Date.now(), keys: body.keys ?? [] };
    return jwksCache.keys;
  } catch {
    return jwksCache?.keys ?? [];
  }
}

/** Verify an Access token end to end: signature against the team's published
 *  keys, audience against this application, and expiry. */
async function verifyAccessJwt(token: string | undefined): Promise<Staff | null> {
  if (!token) return null;
  const [headerPart, payloadPart, signaturePart, extra] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart || extra) return null;
  try {
    const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")) as {
      kid?: string;
      alg?: string;
    };
    if (header.alg !== "RS256") return null;

    const candidates = (await jwks()).filter((k) => !header.kid || k.kid === header.kid);
    if (!candidates.length) return null;

    const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    const signature = new Uint8Array(Buffer.from(signaturePart, "base64url"))
      .buffer as ArrayBuffer;
    let verified = false;
    for (const jwk of candidates) {
      const key = await crypto.subtle.importKey(
        "jwk",
        { ...jwk, key_ops: ["verify"], ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed)) verified = true;
    }
    if (!verified) return null;

    return acceptableAccessClaims(
      JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")),
      ACCESS_AUD,
      now(),
    );
  } catch {
    return null;
  }
}

/** The identity Cloudflare Access vouches for on THIS request, or null. */
export async function accessIdentity(req: Request): Promise<Staff | null> {
  if (accessHeaderTrustedFor(new URL(req.url).pathname)) {
    const email = req.headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase();
    if (email) return { email };
  }
  return verifyAccessJwt(
    req.headers.get("cf-access-jwt-assertion") ??
      readCookie(req.headers.get("cookie"), "CF_Authorization"),
  );
}

/**
 * The signed-in staff member behind this request, or null.
 *
 * In development there is no Cloudflare in front of localhost, so nothing could
 * ever sign in and every staff page would be untestable. NODE_ENV is fixed at
 * build time — a request cannot claim it — so the production bundle contains no
 * such branch at all.
 */
export async function currentStaff(req: Request): Promise<Staff | null> {
  if (process.env.NODE_ENV !== "production") {
    return { email: process.env.DEV_STAFF_EMAIL || "dev@localhost" };
  }
  return (
    (await staffFromCookie(readCookie(req.headers.get("cookie"), STAFF_COOKIE))) ??
    (await accessIdentity(req))
  );
}

/** 403 for a request with no staff identity. Names the one way in, so a stale
 *  tab says what to do instead of just failing. */
export function notStaff(): Response {
  return new Response(JSON.stringify({ error: "unauthorized", signIn: "/admin/staff-session" }), {
    status: 403,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Guard for a route handler: `const staff = await requireStaff(req); if (!staff)
 *  return notStaff();` */
export async function requireStaff(req: Request): Promise<Staff | null> {
  return currentStaff(req);
}
