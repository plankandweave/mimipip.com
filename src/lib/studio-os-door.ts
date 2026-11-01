/**
 * The Proposal Studio's door for the OS (os.magnitudegroup.in).
 *
 * The Studio route (`/api/admin/crm/studio`) was staff-only: a Google
 * sign-in or a Cloudflare Access identity, turned into the admin RPC key by
 * `staffKey`. The OS's Zyvorah design agent builds a customer's deck through
 * the same route with no browser and no person at the keyboard, so it
 * presents the shared server secret instead — `x-zyvorah-token`, the header
 * `/api/corporate/site-batch` already takes from it — and is treated as a
 * staff-equivalent caller whose name is "OS design agent".
 *
 * Everything decidable without a database lives here, pure, so it can be
 * tested: who the caller is, how a company is looked up from what the OS
 * knows about a customer, which deck file is current, and what the public
 * link for a recipient token looks like. The route does the reads and
 * writes.
 */

export const OS_ACTOR = "OS design agent";

export type StudioCaller = {
  /** The admin RPC key to present to the key-gated RPCs; "" when nobody. */
  key: string;
  /** Who is acting — a staff email, or OS_ACTOR. */
  actor: string;
  /** True when the caller is the OS on the shared token. */
  os: boolean;
};

type CallerDeps = {
  internalTokenOk: (req: Request) => boolean;
  staffKey: (req: Request) => Promise<string>;
  adminRpcKey: () => Promise<string | undefined>;
  staffEmail?: (req: Request) => Promise<string | null>;
};

/** The OS on the shared token first; otherwise exactly the staff path that
 *  every other caller took before this door existed. */
export async function resolveStudioCaller(req: Request, deps: CallerDeps): Promise<StudioCaller> {
  if (deps.internalTokenOk(req)) {
    return { key: (await deps.adminRpcKey()) ?? "", actor: OS_ACTOR, os: true };
  }
  const key = await deps.staffKey(req);
  const email = deps.staffEmail ? await deps.staffEmail(req) : null;
  return { key, actor: email ?? "", os: false };
}

/* ----------------------------- company lookup ----------------------------- */

const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "outlook.com",
  "hotmail.com", "live.com", "icloud.com", "rediffmail.com", "protonmail.com",
  "proton.me", "aol.com", "zoho.com", "zohomail.in", "me.com", "msn.com",
]);

export function isFreeMail(domain: string): boolean {
  return FREEMAIL.has(domain.trim().toLowerCase());
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function domainOf(email: string | null | undefined): string | null {
  const e = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(e)) return null;
  return e.slice(e.lastIndexOf("@") + 1);
}

/** A bare host: "www.rathinam.in" / "https://rathinam.in/" → "rathinam.in". */
export function normaliseDomain(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return null;
  return d;
}

export const COMPANY_KINDS = ["architect", "contractor", "developer", "hotel", "retail", "corporate", "pr", "other"] as const;
export type CompanyKind = (typeof COMPANY_KINDS)[number];

export type CompanyAsk = {
  name: string;
  domain: string | null;
  email: string | null;
  contactName: string | null;
  kind: CompanyKind;
  city: string | null;
};

/** The `company` object on a `create` body, read defensively. Null when it
 *  does not name a company — the one thing a proposal cannot do without. */
export function readCompanyAsk(raw: unknown): CompanyAsk | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = String(r.name ?? "").trim();
  if (!name) return null;
  const email = String(r.email ?? "").trim().toLowerCase();
  const kind = String(r.kind ?? "").trim().toLowerCase();
  return {
    name,
    domain: normaliseDomain(typeof r.domain === "string" ? r.domain : null),
    email: EMAIL_RE.test(email) ? email : null,
    contactName: String(r.contact_name ?? "").trim() || null,
    kind: (COMPANY_KINDS as readonly string[]).includes(kind) ? (kind as CompanyKind) : "other",
    city: String(r.city ?? "").trim() || null,
  };
}

export type CompanyLookupPlan = {
  /** crm_companies.match_key — lower(btrim(name)); how the dictation box dedupes. */
  matchKey: string;
  /** The company's own domain, when it has one: never a free-mail host. */
  domain: string | null;
  /** The contact to file under the company, when the OS gave an email. */
  contact: { email: string; name: string } | null;
};

/** How to find (or file) the company the OS describes: by a contact on its
 *  domain first, then by name. A free-mail address names a person, not a
 *  company, so it is a contact but never a domain match. */
export function companyLookupPlan(ask: CompanyAsk): CompanyLookupPlan {
  const fromEmail = domainOf(ask.email);
  const candidate = ask.domain ?? fromEmail;
  const domain = candidate && !isFreeMail(candidate) ? candidate : null;
  const contact = ask.email
    ? { email: ask.email, name: ask.contactName ?? ask.email.slice(0, ask.email.indexOf("@")) }
    : null;
  return { matchKey: ask.name.trim().toLowerCase(), domain, contact };
}

/* ------------------------------- the deck -------------------------------- */

/** The deck a reader should see now. A re-compose writes deck.html and leaves
 *  the older deck-reviewed.html untouched, so "reviewed first" would show
 *  prose already replaced; status is the tie-breaker (same rule as the
 *  studio's internal_share and restyle). */
export function currentDeckPath(p: {
  status: string; deck_path: string | null; reviewed_deck_path: string | null;
}): string | null {
  return p.status === "composed"
    ? (p.deck_path ?? p.reviewed_deck_path)
    : (p.reviewed_deck_path ?? p.deck_path);
}

/* ------------------------------ recipients ------------------------------- */

export type RecipientAsk = { presentationId: string; email: string; name: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readRecipientAsk(body: unknown): RecipientAsk | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const presentationId = String(b.presentation_id ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!UUID_RE.test(presentationId) || !EMAIL_RE.test(email)) return null;
  return { presentationId, email, name: String(b.name ?? "").trim() || null };
}

/** The public link a token opens. */
export function presentationLink(origin: string | undefined, token: string): string {
  return `${(origin || "https://zyvorah.com").replace(/\/$/, "")}/p/${token}`;
}

/** A token the recipient RPC accepts: the RPC refuses anything under 32
 *  characters, and mintToken makes 64 hex. */
export function tokenStrongEnough(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}
