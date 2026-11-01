import { brand } from "../../../brand/current";
import { publishingFetch as fetch } from "../../../brand/publishing-transport";
// Connecting the Zyvorah LinkedIn page from the desk, in the browser.
//
// The founder moved off her desktop on 5 October 2026, and the only way in was
// scripts/linkedin-connect.mjs: a laptop, a clipboard, a localhost callback and
// `wrangler secret put`. This is the same flow with the laptop taken out:
//
//   /admin/linkedin/connect   → LinkedIn's sign-in (state in a cookie)
//   /admin/linkedin/callback  → code → token → which page → admin_config
//
// Both paths sit under /admin, so Cloudflare Access fronts them and only staff
// reach them. The token, refresh token and page land in admin_config, which is
// readable by the service role only; the publisher reads them through
// loadConnection() (publish/linkedin.ts). Nothing here ever prints a secret.

import { serviceClient, hasServiceRole } from "../db";
import { LINKEDIN_ORG_KEY, LINKEDIN_REFRESH_KEY, LINKEDIN_TOKEN_KEY, candidateVersions } from "./linkedin";

const OAUTH = "https://www.linkedin.com/oauth/v2";
const API = "https://api.linkedin.com/rest";

/** Registered on the LinkedIn app as an authorised redirect URL. */
export const LINKEDIN_REDIRECT = `${brand.origin}/admin/linkedin/callback`;

/** Most to least ambitious. Posting needs only the first; the second reads the
 *  page's numbers; the third lets us find the page without being told it. An
 *  app not yet approved for one is refused the WHOLE request, so we step down. */
export const SCOPE_SETS: string[][] = [
  ["w_organization_social", "r_organization_social", "rw_organization_admin"],
  ["w_organization_social", "r_organization_social"],
  ["w_organization_social"],
];

export function authorizationUrl(clientId: string, scopes: string[], state: string): string {
  return (
    `${OAUTH}/authorization?` +
    new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: LINKEDIN_REDIRECT,
      state,
      scope: scopes.join(" "),
    })
  );
}

export type Preflight = "ok" | "scope" | "redirect" | "client" | "unknown";

/** What LinkedIn's sign-in page says about a request, read before anyone is
 *  sent to it. The four answers have four different owners. */
export function readPreflight(body: string): Preflight {
  if (/redirect_uri/i.test(body) && /does not match|not registered/i.test(body)) return "redirect";
  if (/not authorized for your application|unauthorized_scope|invalid.{0,20}scope/i.test(body)) return "scope";
  if (/invalid.{0,20}client_id|client.{0,3}id.{0,20}invalid/i.test(body)) return "client";
  return "ok";
}

async function preflight(clientId: string, scopes: string[]): Promise<Preflight> {
  try {
    const res = await fetch(authorizationUrl(clientId, scopes, "preflight"), { redirect: "follow" });
    return readPreflight(await res.text());
  } catch {
    return "unknown";
  }
}

/** The richest scope set LinkedIn will accept for this app, or why none. */
export async function chooseScopes(clientId: string): Promise<{ scopes: string[] } | { problem: Exclude<Preflight, "ok"> }> {
  let last: Exclude<Preflight, "ok"> = "unknown";
  for (const set of SCOPE_SETS) {
    const v = await preflight(clientId, set);
    if (v === "ok" || v === "unknown") return { scopes: set };
    last = v;
    if (v !== "scope") break; // a bad redirect or client is not cured by asking for less
  }
  return { problem: last };
}

/** What each refusal means, in the founder's words, and whose move it is. */
export function problemText(p: Exclude<Preflight, "ok">): string {
  switch (p) {
    case "scope":
      return "LinkedIn has not yet approved Zyvorah's app to post as a company page (the Community Management API). That approval is LinkedIn's; it arrives by email, and Connect will work the same day.";
    case "redirect":
      return `LinkedIn does not recognise ${LINKEDIN_REDIRECT} for this app. It must be added once under the app's Auth tab, "Authorized redirect URLs".`;
    case "client":
      return "LinkedIn does not recognise the app's client ID. Check the Client ID entered for the LinkedIn app.";
    default:
      return "LinkedIn could not be reached. Try again in a minute.";
  }
}

export async function exchangeCode(
  code: string,
  app: { clientId: string; clientSecret: string },
): Promise<{ access_token: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string }> {
  const res = await fetch(`${OAUTH}/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: LINKEDIN_REDIRECT,
      client_id: app.clientId,
      client_secret: app.clientSecret,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof j.access_token !== "string") {
    throw new Error(`LinkedIn refused the sign-in (${res.status}${j.error_description ? `: ${j.error_description}` : ""})`);
  }
  return j as { access_token: string };
}

async function get(url: string, token: string): Promise<Response | null> {
  for (const v of candidateVersions()) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "LinkedIn-Version": v, "X-Restli-Protocol-Version": "2.0.0" },
    });
    if (res.status !== 426) return res;
  }
  return null;
}

/** The company pages this member administers, as URNs. Empty when the token
 *  cannot list them (no rw_organization_admin) — the caller then needs the
 *  page named some other way. */
export async function administeredPages(token: string): Promise<string[]> {
  const res = await get(`${API}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`, token);
  if (!res?.ok) return [];
  const j = (await res.json().catch(() => ({}))) as { elements?: { organization?: string }[] };
  return (j.elements ?? []).map((e) => e.organization).filter((u): u is string => !!u);
}

/** Pick the Zyvorah page: the one stored or named, else the only one, else the
 *  one whose name says Zyvorah. */
export async function choosePage(token: string, named?: string): Promise<string | null> {
  if (named) return named;
  const pages = await administeredPages(token);
  if (pages.length <= 1) return pages[0] ?? null;
  for (const urn of pages) {
    const res = await get(`${API}/organizations/${urn.split(":").pop()}`, token);
    const j = res?.ok ? ((await res.json().catch(() => ({}))) as { localizedName?: string; vanityName?: string }) : {};
    if (/zyvorah/i.test(`${j.localizedName ?? ""} ${j.vanityName ?? ""}`)) return urn;
  }
  return null;
}

/** "12345", "urn:li:organization:12345" or a company admin URL → the URN. */
export function pageUrn(input: string): string | null {
  const s = input.trim();
  const m = s.match(/urn:li:organization:(\d+)/) ?? s.match(/company\/(\d+)/) ?? s.match(/^(\d{4,})$/);
  return m ? `urn:li:organization:${m[1]}` : null;
}

/** Store a fresh connection. Throws if the store refuses — a connection that
 *  was not written must not be reported as made. */
export async function saveConnection(t: {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  org?: string | null;
}): Promise<void> {
  if (!hasServiceRole()) throw new Error("the site cannot write its settings (no service role)");
  const now = Date.now();
  const rows = [
    { k: LINKEDIN_TOKEN_KEY, v: JSON.stringify({ access_token: t.access_token, expires_at: now + (t.expires_in ?? 5_184_000) * 1000 }) },
    ...(t.org ? [{ k: LINKEDIN_ORG_KEY, v: t.org }] : []),
    ...(t.refresh_token
      ? [{ k: LINKEDIN_REFRESH_KEY, v: JSON.stringify({ refresh_token: t.refresh_token, expires_at: now + (t.refresh_token_expires_in ?? 31_536_000) * 1000 }) }]
      : []),
  ];
  const { error } = await serviceClient().from("admin_config").upsert(rows, { onConflict: "k" });
  if (error) throw new Error(`could not store the LinkedIn connection: ${error.message}`);
}
