/**
 * One service account, several Google APIs — the shared token minter.
 *
 * The Analytics client (lib/ga-data.ts) already had a dependency-free
 * service-account JWT flow: the official googleapis SDK is enormous and assumes
 * Node's crypto, and this runs on Cloudflare's workerd too, so the JWT is signed
 * with WebCrypto and everything else is plain fetch.
 *
 * Search Console needs the same key with a DIFFERENT scope, and a Google access
 * token is scoped at mint time. Copying the JWT code would have meant two
 * implementations of the one piece of cryptography in this codebase that has to
 * be exactly right, so it lives here once and takes the scope as an argument.
 *
 * Tokens are cached PER SCOPE. That detail matters: a single cache slot would
 * hand an Analytics-scoped token to a Search Console call, which fails with a
 * 403 that looks exactly like "the service account has no access" — sending
 * whoever debugs it to the Google admin console for a permission that was never
 * the problem.
 *
 * Env:
 *   GA_SA_CLIENT_EMAIL  the service account's email
 *   GA_SA_PRIVATE_KEY   its PEM private key; \n-escaped or real newlines
 *
 * The names keep their GA_ prefix because they are already set in production
 * and renaming a live secret to tidy a prefix is a needless outage.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const SCOPE_ANALYTICS = "https://www.googleapis.com/auth/analytics.readonly";
export const SCOPE_SEARCH_CONSOLE = "https://www.googleapis.com/auth/webmasters.readonly";

export function serviceAccountConfigured(): boolean {
  return Boolean(process.env.GA_SA_CLIENT_EMAIL && process.env.GA_SA_PRIVATE_KEY);
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

/** One token per scope per isolate, refreshed 5 minutes early. Tokens last an
 *  hour and a single brief makes several calls; without this it would mint one
 *  per call. */
const cache = new Map<string, { token: string; expiresAt: number }>();

export async function googleAccessToken(scope: string): Promise<string | null> {
  const email = process.env.GA_SA_CLIENT_EMAIL;
  const pem = process.env.GA_SA_PRIVATE_KEY;
  if (!email || !pem) return null;

  const hit = cache.get(scope);
  if (hit && hit.expiresAt > Date.now() + 5 * 60_000) return hit.token;

  try {
    const now = Math.floor(Date.now() / 1000);
    const enc = new TextEncoder();
    const header = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
    const claims = b64url(
      enc.encode(JSON.stringify({ iss: email, scope, aud: TOKEN_URL, iat: now, exp: now + 3600 })),
    );
    const unsigned = `${header}.${claims}`;
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToPkcs8(pem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned));
    const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!res.ok) {
      // The body can quote the key back in an error; log the status only.
      console.error("[google-auth] token exchange failed:", res.status, scope);
      return null;
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;

    cache.set(scope, {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    });
    return json.access_token;
  } catch (e) {
    console.error("[google-auth] token error for scope", scope, e);
    return null;
  }
}
