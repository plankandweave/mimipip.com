import "server-only";
import { partnerCapabilities, type PartnerCapabilities } from "@/lib/partner-capabilities";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase-admin";
import { mediaFloorSqft } from "./print-types";

// Corporate portal auth: a login is proved by receiving a one-time code at an
// email on the account's own domain. Typing "someone@vijaysales.com" proves
// nothing — holding the inbox does. Codes and session tokens are only ever
// stored as SHA-256 hashes, so a database leak yields nothing replayable.

export const CORP_COOKIE = "zyv_corp";

// Printable size bounds moved to ./print-limits (pure module — the media
// container bundles corporate-band-compose, which needs MAX_RUN_MM without
// this file's next/headers + service-role machinery). Re-exported so every
// existing caller keeps working.
export { MAX_RUN_MM, MAX_BAND_MM, MAX_HEIGHT_MM, MIN_SIDE_MM, sizeRejection } from "./print-limits";
import { MAX_RUN_MM, MAX_HEIGHT_MM, MAX_BAND_MM, MIN_SIDE_MM } from "./print-limits";

/** Null when a MEASURED WALL is a plausible wall, else the reason it is not.
 *
 *  Deliberately NOT sizeRejection. That caps width at MAX_RUN_MM because it is
 *  validating one printed piece; a wall is split across pieces by
 *  composeBandPieces, so a real 45 m showroom run is legal here and would be
 *  wrongly refused by the stricter cap.
 *
 *  This is the gate that has to hold, because an unmeasured wall is not merely
 *  wrong data downstream: coverage is sum(aspect) × HEIGHT, so a wall stored
 *  with height 0 makes the allocator's top-up loop assign the ENTIRE approved
 *  library to that one wall, which then exceeds the composer's segment limit,
 *  fails, and (before 2026-08-19) was retried forever. */
export function wallSizeRejection(widthMm: number, heightMm: number): string | null {
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) return "width and height are required";
  if (widthMm < MIN_SIDE_MM || heightMm < MIN_SIDE_MM) return "each side must be at least 100 mm — check the measurement";
  if (heightMm > MAX_HEIGHT_MM) return `height must be ${MAX_HEIGHT_MM / 1000} m or less`;
  if (widthMm > MAX_BAND_MM) return `a single wall must be ${MAX_BAND_MM / 1000} m or less — split a longer run into two walls`;
  return null;
}
const CODE_TTL_MIN = 15;
/** A partner stays signed in for as long as they keep using the portal.
 *  Every visit slides the expiry forward by this much (renewCorporateSession,
 *  asked on each page load by PartnerProvider), so only a login left untouched
 *  for over a year lapses. 400 days is the longest any browser keeps a cookie.
 *  Vijay Sales keep the portal on a phone home screen like an app and were
 *  asked for a code every few weeks (Abhay, 8 October 2026). Revocation does
 *  not wait for this: currentCorporateSession re-checks the member row on
 *  every request, and Sign out deletes the session. */
const SESSION_TTL_DAYS = 400;
const MAX_CODE_ATTEMPTS = 5;
/** How often an open session's `last_seen_at` is refreshed (see
 *  currentCorporateSession). An hour is coarse enough to cost one write per
 *  working session per hour and fine enough to say which DAY it was used. */
const SEEN_TOUCH_MS = 60 * 60_000;

export type CorporateAccount = {
  capabilities?: Partial<PartnerCapabilities> | null;
  id: string;
  slug: string;
  name: string;
  email_domain: string;
  /** Anyone on email_domain may sign in without being added first: proving
   *  the inbox creates their member row — upload + build, never order
   *  (migration 20261001120000). A revoked row is never re-created. */
  domain_self_join?: boolean | null;
  rate_per_sqft: number;
  gst_pct: number;
  logo_path: string | null;
  install_contact_name: string | null;
  install_contact_phone: string | null;
  active: boolean;
  // ── Commercial policy (migration 0038). Every per-tenant difference lives
  // here rather than in code, so onboarding partner #3 is a row, not a deploy.
  /** 'flat_rate' = rate_per_sqft. 'website' = live catalogue price − discount_pct. */
  pricing_mode: "flat_rate" | "website";
  discount_pct: number;
  /** 'credit' = print now, invoice after. 'payment_first' = no print until paid. */
  print_gate: "credit" | "payment_first";
  /** Accounts-payable contact: cc'd on the invoice, chased by the dunning agent. */
  followup_email: string | null;
  followup_active: boolean;
  /** Order-ref prefix ('VS', 'MOCO'). Null falls back to VS. */
  ref_prefix: string | null;
  proposal_validity_days: number;
  /** LEGACY (migration 0044). Library designs no longer need approving —
   *  they land ready to print — so nothing reads this. Kept on the row because
   *  it records who the account's owner was. */
  approver_email: string | null;
  /** The states this partner actually ships to. Null = no restriction; a list
   *  narrows the dispatch dropdown so a wrong-state GSTIN cannot be picked
   *  (migration 0053). */
  ship_states: string[] | null;
  /** Minimum order value (₹, ex-GST net) enforced at the commitment point —
   *  freeze for payment-first partners, batch commit for credit ones. Null =
   *  no minimum. Drafts and quoting are never blocked (migration 0094). */
  min_order_value_inr: number | null;
  /** Registered legal name of the partner entity, where it differs from the
   *  display name. The reseller agreement binds the entity, so it prefers
   *  this over `name` when prefilling the business being bound. */
  legal_name: string | null;
  /** Designs this partner has liked, in display order, for the portal's
   *  "Shortlisted for you" strip. Set from the OS partner card; read through
   *  parseShortlistHandles (lib/partner-shortlist.ts). Absent until the
   *  20261015120000 migration. */
  shortlist_handles?: unknown;
  /** What kind of account this is, and therefore what it pays — see
   *  lib/account-types. Since 0127 this is the field that decides pricing
   *  mode, discount, payment gate and Autograph access; a database trigger
   *  writes the first three from it on every write. */
  account_type: import("./account-types").AccountType;
  /** LEGACY (0038), kept in step by the 0127 trigger for anything still
   *  reading it. Autograph is decided by account_type now — this column was
   *  a two-value flag doing that job by side effect, which is why Vijay Sales
   *  was labelled 'offline' despite being a corporate consumer. */
  channel_kind: "online" | "offline";
  /** The owner's decision that this account prints without a ceiling (Vijay
   *  Sales, the only one). Deliberately distinct from an unset limit. */
  credit_limit_waived: boolean;
  /** Agreement version this account must have accepted before using the
   *  portal (e.g. 'reseller-1.0'). NULL = no agreement gate — both accounts
   *  that predate the gate stay NULL and see no change (migration 0095). */
  agreement_required: string | null;
  /** Date the entity signed, where it signed on paper rather than through the
   *  click-wrap gate. Display only. */
  agreement_signed_on: string | null;
  /** Credit ceiling (₹) and ageing terms. Breaching EITHER stops the OS
   *  printing for this partner. Set by us, never by the partner — the portal
   *  shows them to the account's owners and offers no way to edit them. */
  credit_limit_inr: number | null;
  credit_terms_days: number | null;
  /** Who is copied on this account's bills, next to followup_email
   *  (migration 0110). Editable by the account's own owners. */
  bill_cc_emails: string[] | null;
  /** True when this account's places are BUILDINGS with floors — a commercial
   *  property owner rather than a chain of stores (migration 0156). Chooses the
   *  portfolio dashboard and enables corporate_site_areas.
   *
   *  Presentation and shape only. Deliberately NOT account_type, which decides
   *  pricing mode, discount and payment gate through the 0127 trigger: picking
   *  a type to get a different dashboard would move money as a side effect. */
  portfolio_mode: boolean;
};

/** A dropdown is a courtesy, not a control: the dispatch state picks the GSTIN
 *  we bill, so the server checks it against the account's own list too. */
export function shipStateAllowed(account: Pick<CorporateAccount, "ship_states">, state: string): boolean {
  const allowed = account.ship_states;
  if (!allowed || allowed.length === 0) return true;
  return allowed.some(s => s.trim().toLowerCase() === state.trim().toLowerCase());
}

// ── Membership: who may sign in, and what they may do (migration 0084) ─────

/** One person on a partner account. */
export type CorporateMember = {
  id: string;
  account_id: string;
  email: string;
  /** How the person signs — what a dispatch email greets them by (0111).
   *  Null degrades to a plain "Hello" on the OS side, never a company name. */
  name: string | null;
  /** Bare 10-digit Indian mobile, or null (migration 0156). Lets this person
   *  sign in by SMS instead of an emailed code — the only door that works for a
   *  portfolio account, whose email_domain is a '.invalid' placeholder. Globally
   *  unique among active members, so a verified handset resolves to exactly one
   *  account. See lib/corporate-phone.ts. */
  phone: string | null;
  role: "admin" | "member";
  can_upload: boolean;
  can_build: boolean;
  /** File uploads to Vault only; absent during the schema-first rollout means false. */
  can_vault_upload?: boolean;
  can_order: boolean;
  /** Told about every shipment on the account, on top of whoever placed the
   *  order (0111). Distinct from followup_email (who owes us) and
   *  bill_cc_emails (who gets bills). */
  notify_dispatch: boolean;
  invited_by_email: string | null;
  active: boolean;
  created_at: string;
};

/** Independently granted portal capabilities. */
export type Capability = "upload" | "build" | "order" | "vault_upload";

export type CorporateSession = {
  account: CorporateAccount;
  email: string;
  /** Null for our own staff, and for accounts still running domain-open. */
  member: CorporateMember | null;
  /** True when this is one of ours (CORPORATE_STAFF_DOMAINS), not the partner. */
  staff: boolean;
  /** True when the ACCOUNT still owes an agreement acceptance (migration
   *  0095). A property of the account, not the person — until the entity has
   *  signed, nobody (staff included) may act on it: portal pages route to the
   *  agreement screen and mutating API routes refuse with 403
   *  `agreement_required`. Always false when agreement_required is NULL,
   *  resolved without touching the database. */
  agreementPending: boolean;
  /** The city this sign-in is working in (corporate_sessions.city). Asked on
   *  every sign-in for accounts held to the tier-1 list (HomeLane), and the
   *  only city an order from this session may deliver to — see
   *  lib/tier1-cities.ts. Null until chosen, and always null elsewhere. */
  city: string | null;
};

/** Has this account NOT yet accepted the agreement version it is required to?
 *
 *  The common case — agreement_required NULL, which is every account that
 *  predates the gate — answers false with ZERO extra queries; only flagged
 *  accounts pay the one lookup. An unreachable database keeps the gate CLOSED
 *  for flagged accounts: acceptance we cannot prove is acceptance we do not
 *  assume. */
export async function accountAgreementPending(
  account: Pick<CorporateAccount, "id" | "agreement_required">,
): Promise<boolean> {
  if (!account.agreement_required) return false;
  const sb = supabaseAdmin();
  if (!sb) return true;
  const { count } = await sb.from("corporate_agreements")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id).eq("version", account.agreement_required);
  return (count ?? 0) === 0;
}

/**
 * True when this account runs an allow-list.
 *
 * The list binds only where it exists. An account nobody has drawn up members
 * for keeps the old domain-open behaviour rather than locking every one of its
 * users out of a table they have never heard of — adding the first member is
 * what switches an account over. See migration 0084.
 */
export async function accountRunsAllowList(accountId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return true;
  const { count, error } = await sb.from("corporate_members")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId).eq("active", true);
  // Only a proved zero is domain-open. A failed count must not turn a
  // missing member lookup into an unrestricted session (including Vault-only).
  return Boolean(error) || count == null || count > 0;
}

/** This person's row on the account, if they have an active one. */
export async function memberFor(accountId: string, email: string): Promise<CorporateMember | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("corporate_members")
    .select("*").eq("account_id", accountId).eq("email", normaliseEmail(email))
    .eq("active", true).maybeSingle();
  return (data as CorporateMember | null) ?? null;
}

/** What invited_by_email says on a row this account's domain created for
 *  itself, so Team can show it was a self-join rather than an admin's grant. */
export const SELF_JOIN_INVITER = "self-join";

/** Does this address qualify to self-join this account? Exact domain only —
 *  no subdomains — and no plus-aliases, so one inbox is one seat. */
export function selfJoinEligible(
  account: Pick<CorporateAccount, "domain_self_join" | "email_domain">,
  email: string,
): boolean {
  if (isTraceOnlyAccount(account) || !account.domain_self_join) return false;
  const e = normaliseEmail(email);
  const at = e.lastIndexOf("@");
  if (at < 1) return false;
  const local = e.slice(0, at);
  return e.slice(at + 1) === account.email_domain.toLowerCase() && !local.includes("+");
}

/** Does this address have ANY row on the account, active or revoked? */
async function anyMemberRow(accountId: string, email: string): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return true; // can't prove there is no revoked row: fail closed
  const { count } = await sb.from("corporate_members")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId).eq("email", normaliseEmail(email));
  return (count ?? 0) > 0;
}

/**
 * May this address sign in to this account at all?
 *
 * Staff always may — the desk signs in with its own inbox to design and
 * prepare on the account (never to spend: see can()). A partner address must
 * hold an active member row once the account
 * runs a list; before that, holding the domain's inbox is still enough.
 */
/** Dedicated no-login Trace tenants. Ordinary .invalid portfolio accounts
 * retain their existing member/phone sign-ins; only this reserved subtype is
 * staff-only, even if a member or self-join flag is accidentally added. */
export function isTraceOnlyAccount(account: Pick<CorporateAccount, "email_domain">): boolean {
  return String(account.email_domain ?? "").trim().toLowerCase().endsWith(".trace.invalid");
}

export async function loginAllowed(account: CorporateAccount, email: string): Promise<boolean> {
  if (isStaffEmail(email)) return true;
  if (isTraceOnlyAccount(account)) return false;
  if (!(await accountRunsAllowList(account.id))) return true;
  if ((await memberFor(account.id, email)) !== null) return true;
  // Self-join: someone on the domain who has never had a row. A revoked row
  // keeps them out — an admin's removal is not undone by signing in again.
  return selfJoinEligible(account, email) && !(await anyMemberRow(account.id, email));
}

/** Give a self-joining address its member row. Called only once the inbox is
 *  PROVED (never on code request, so asking for codes cannot mint seats).
 *  Race-safe: two sign-ins at once both land on the one unique row. */
async function ensureSelfJoinMember(
  account: CorporateAccount,
  email: string,
  ctx: SignInContext,
): Promise<void> {
  if (isStaffEmail(email) || !selfJoinEligible(account, email)) return;
  if (!(await accountRunsAllowList(account.id))) return; // domain-open: no rows needed
  if (await anyMemberRow(account.id, email)) return;
  const sb = supabaseAdmin();
  if (!sb) return;
  const { data, error } = await sb.from("corporate_members").upsert({
    account_id: account.id,
    email: normaliseEmail(email),
    role: "member",
    can_upload: true,
    can_build: true,
    can_order: false,
    invited_by_email: SELF_JOIN_INVITER,
    active: true,
  }, { onConflict: "account_id,email", ignoreDuplicates: true }).select("id");
  if (error) { console.error("[corp-auth] self-join insert failed:", error.message); return; }
  const id = (data as { id: string }[] | null)?.[0]?.id;
  if (!id) return; // another request created (or an admin revoked) it first
  await recordAuditRaw({
    accountId: account.id,
    actorEmail: email,
    action: "member.self_join",
    subject: { type: "member", id },
    detail: { can_upload: true, can_build: true, can_order: false, ip: ctx.ip ?? null, user_agent: ctx.userAgent ?? null },
  });
}

/** What this session may do. Our own staff sign in as DESIGNER sessions:
 *  they prepare — upload artwork, build and re-quote drafts — but never
 *  spend. "order" (placing, quoting the account's contracted rates, and
 *  freezing to production) belongs to the partner's own can_order member —
 *  e.g. HomeLane's procurement manager — and to a director (isDirectorEmail). */
export function can(session: CorporateSession, what: Capability): boolean {
  if (what === "upload" && !partnerCapabilities(session.account).artworkUpload) return false;
  if (session.staff) return what !== "order" || isDirectorEmail(session.email);
  // Domain-open account: no rows, so no restrictions — same rights everyone
  // on the domain had before 0084.
  if (!session.member) return true;
  // No shortcut for admins: the columns bind them too (migration 0126
  // backfilled existing admin rows to all-true, so the change moved nobody's
  // rights on deploy). Admin means "manages ACCESS", not "may spend" — an
  // account can now have an admin who lets colleagues in but cannot order.
  if (what === "vault_upload") return session.member.can_build || session.member.can_vault_upload === true;
  return what === "upload" ? session.member.can_upload
       : what === "build"  ? session.member.can_build
       :                     session.member.can_order;
}

/** A dedicated file-only grant is not a general portal login. Existing members,
 * staff and domain-open accounts retain their behaviour. Legacy session-only
 * routes must not silently grant this new class ordering, media or AI actions. */
export function isVaultUploadOnly(session: CorporateSession): boolean {
  const m = session.member;
  return !session.staff && m?.role === "member" && m.can_vault_upload === true
    && !m.can_build && !m.can_upload && !m.can_order;
}

/** Admins run their own access: they add and remove colleagues without us. */
export function isAccountAdmin(session: CorporateSession): boolean {
  return session.member?.role === "admin";
}

/** May this session edit the member list — grants, permissions, revokes?
 *
 *  Partner admins, plus our own staff: the desk fixing an account's access
 *  should not need a member row on it first. Deliberately NOT
 *  canAdministerAccount(), whose `!session.member` case would let anyone on a
 *  domain-open account grant the first row — "no rows yet" must not be a
 *  route to handing out logins that can spend money. */
export function canManageMembers(session: CorporateSession): boolean {
  return session.staff || isAccountAdmin(session);
}

/** May this person run the account's own operational surfaces — its stores,
 *  its measurement links, and the release that starts a survey costing money?
 *
 *  isAccountAdmin() alone is the wrong test here and has already cost us one
 *  live 401 (19 Aug 2026, allocate/compose). `member` is NULL in two innocent
 *  cases: our own staff, and an account still running domain-open with no
 *  member rows at all. Gating on member?.role === 'admin' locks both of them
 *  out of the account entirely.
 *
 *  Note what this deliberately does NOT relax: /api/corporate/members, which
 *  hands out portal logins that can spend money, stays on canManageMembers
 *  (admin row or our staff), because "no rows yet" must not be a route to
 *  granting the first one.
 */
export function canAdministerAccount(session: CorporateSession): boolean {
  return session.staff || !session.member || session.member.role === "admin";
}

/** Append to the partner audit log without a session.
 *
 *  Needed because not every auditable actor has one: a store employee holding a
 *  measurement link writes real rows for a real account and is identified only
 *  by the email the link was issued to. recordAudit delegates here so there is
 *  still exactly one insert into corporate_audit. */
export async function recordAuditRaw(entry: {
  accountId: string;
  actorEmail: string;
  action: string;
  subject?: { type: string; id: string } | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const { error } = await sb.from("corporate_audit").insert({
    account_id: entry.accountId,
    actor_email: entry.actorEmail,
    action: entry.action,
    subject_type: entry.subject?.type ?? null,
    subject_id: entry.subject?.id ?? null,
    detail: entry.detail ?? null,
  });
  if (error) console.error("[corp-audit]", entry.action, error.message);
}

/** Append to the partner audit log. Never throws — a lost log line must not
 *  fail the action it was describing. */
export async function recordAudit(
  session: CorporateSession,
  action: string,
  subject: { type: string; id: string } | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  await recordAuditRaw({
    accountId: session.account.id,
    actorEmail: session.email,
    action, subject, detail,
  });
}

/** Where this account's portal lives. One place so every redirect agrees. */
export function partnerHome(account: Pick<CorporateAccount, "slug">): string {
  return `/partners/${account.slug}`;
}

/** True when a signed-in account may view the portal at `slug`. A partner
 *  reaching another tenant's URL must be sent to their own, never shown someone
 *  else's branding wrapped around their data. */
export function slugMatchesSession(session: CorporateSession, slug: string): boolean {
  return session.account.slug === slug;
}

/** Exported so every credential in the estate is hashed and compared the same
 *  way. Measurement links (src/lib/measure-link.ts) and the OS bridge token
 *  both reuse these rather than rolling their own — the bridge used a plain
 *  `===` until 2026-08-19. */
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Our own people, by email domain. Staff sign in to a partner's portal with
 *  THEIR OWN inbox and their own one-time code — never the partner's — so a
 *  desk order is always attributable to the person who placed it. Domains are
 *  configurable so onboarding a new staff domain is env, not a deploy. */
const STAFF_DOMAINS = (process.env.CORPORATE_STAFF_DOMAINS || "zyvorah.com,plankandweave.com,magnitudegroup.in")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

export function isStaffEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  return at > 0 && STAFF_DOMAINS.includes(email.slice(at + 1).toLowerCase());
}

/** The directors who may place an order on a partner's account from their own
 *  sign-in. Roheena is the one approver (24 Oct 2026: "I need to send this
 *  order directly to print"); every other staff session stays a designer
 *  session. The order still records placed_by_email, so it is hers on paper. */
const DIRECTOR_EMAILS = (process.env.CORPORATE_DIRECTOR_EMAILS || "roheena@plankandweave.com")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

export function isDirectorEmail(email: string): boolean {
  return isStaffEmail(email) && DIRECTOR_EMAILS.includes(normaliseEmail(email));
}

/** True when this session is one of ours acting inside a partner's portal.
 *  The portal shows it plainly — nobody should place an order on a partner's
 *  account without seeing whose account it is. */
export function isStaffSession(session: CorporateSession): boolean {
  return isStaffEmail(session.email);
}

/** "savita@magnitudegroup.in" → "Savita" — desk mails name the person, not the inbox. */
export function nameFromEmail(email: string): string {
  const at = email.lastIndexOf("@");
  const local = at > 0 ? email.slice(0, at) : email;
  const name = local.split(/[._-]+/).filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
  return name || email;
}

/** Who a desk mail should credit for an action in a partner's portal. A
 *  partner's own user acts AS the account ("Vijay Sales placed…"); our staff
 *  act as themselves ("Savita placed… for Vijay Sales") so the desk can always
 *  tell a partner's order from one of ours keyed in on their account. */
export function sessionActor(session: CorporateSession): { name: string; isStaff: boolean } {
  return isStaffSession(session)
    ? { name: nameFromEmail(session.email), isStaff: true }
    : { name: session.account.name, isStaff: false };
}

/** The account a staff member asked to enter, by slug. */
export async function accountForSlug(slug: string): Promise<CorporateAccount | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("corporate_accounts")
    .select("*").eq("slug", slug).eq("active", true).maybeSingle();
  return (data as CorporateAccount | null) ?? null;
}

/** The account this address belongs to, if it is allowed in.
 *
 *  Checked in two steps, exact match first:
 *
 *  1. An exact corporate_members row for this address. This is the ONLY path
 *     in for a partner with no company domain of their own (a personal Gmail/
 *     Yahoo/etc. address) — their account's email_domain is a non-resolvable
 *     '.invalid' placeholder (see migration 0116) specifically so step 2 can
 *     never match it for anyone else. Domain-based partners can also have
 *     member rows (0084's allow-list); resolving those here first is a no-op
 *     for them, since the row already points at the same account step 2 would
 *     find.
 *  2. Fall back to matching the account whose email_domain equals this
 *     address's domain — the original, and still the common, path.
 */
export async function accountForEmail(email: string): Promise<CorporateAccount | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const normalised = normaliseEmail(email);

  const { data: members } = await sb.from("corporate_members")
    .select("account_id").eq("email", normalised).eq("active", true).limit(1);
  const memberAccountId = members?.[0]?.account_id as string | undefined;
  if (memberAccountId) {
    const { data: acc } = await sb.from("corporate_accounts")
      .select("*").eq("id", memberAccountId).eq("active", true).maybeSingle();
    if (acc) return acc as CorporateAccount;
  }

  const domain = email.slice(at + 1);
  const { data } = await sb.from("corporate_accounts")
    .select("*").eq("email_domain", domain).eq("active", true).maybeSingle();
  return (data as CorporateAccount | null) ?? null;
}

/** Mint + store a login code. Returns the PLAINTEXT code for emailing (it is
 *  never persisted or returned to the browser). */
export async function issueLoginCode(account: CorporateAccount, email: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await sb.from("corporate_login_codes").insert({
    account_id: account.id,
    email,
    code_hash: sha256(code),
    expires_at: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(),
  });
  if (error) { console.error("[corp-auth] issue code failed:", error.message); return null; }
  return code;
}

/** Mint the session cookie for an address that has ALREADY been proved.
 *
 *  Extracted so there is exactly one place that decides how long a portal
 *  session lasts and what is stored for it, no matter which door proved the
 *  person: an emailed code (verifyLoginCode, below) or an SMS code to a
 *  member's handset (lib/corporate-phone.ts).
 *
 *  Proving is the CALLER's job and this function cannot check it — so never
 *  call it with an address that arrived in a request body. */
export type SignInContext = { ip?: string | null; userAgent?: string | null };

export async function startCorporateSession(
  account: CorporateAccount,
  email: string,
  method: "email" | "phone" = "email",
  ctx: SignInContext = {},
): Promise<CorporateSession | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  // Re-checked at the moment the session is minted, not only when the code was
  // sent: access can be revoked in the minutes a code stays live.
  if (!(await loginAllowed(account, email))) return null;
  await ensureSelfJoinMember(account, email, ctx);
  // A self-joiner whose row could not be written would otherwise fall through
  // to a session with member = null, which reads as full rights. Refuse.
  if (!isStaffEmail(email) && (await accountRunsAllowList(account.id))
      && (await memberFor(account.id, email)) === null) return null;

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await sb.from("corporate_sessions").insert({
    account_id: account.id, email, token_hash: sha256(token), expires_at: expires.toISOString(),
  });
  // The login itself goes on the audit log. Until 1 October 2026 the only
  // trace of a sign-in was the consumed email code (phone logins left none at
  // all) and the session row, which logging out deletes — so "how many
  // HomeLane designers signed in yesterday" had no honest answer. The morning
  // brief (lib/homelane-brief.ts) counts these rows. Staff sign-ins are
  // recorded too and told apart by isStaffEmail at read time.
  await recordAuditRaw({
    accountId: account.id,
    actorEmail: email,
    action: "session.start",
    detail: { method },
  });
  (await cookies()).set(CORP_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", expires,
  });
  return {
    account,
    email,
    member: await memberFor(account.id, email),
    staff: isStaffEmail(email),
    agreementPending: await accountAgreementPending(account),
    // A fresh sign-in has not chosen yet: that is what makes the city asked
    // every time rather than once.
    city: null,
  };
}

/** Verify a submitted code and, on success, mint a session cookie. */
export async function verifyLoginCode(email: string, code: string, ctx: SignInContext = {}): Promise<CorporateSession | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data: rows } = await sb.from("corporate_login_codes")
    .select("*").eq("email", email).is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1);
  const row = rows?.[0] as
    | { id: string; account_id: string; code_hash: string; attempts: number }
    | undefined;
  if (!row) return null;
  if (row.attempts >= MAX_CODE_ATTEMPTS) return null;

  if (!safeEqual(sha256(code.trim()), row.code_hash)) {
    // Count the miss so a 6-digit code cannot be brute-forced.
    await sb.from("corporate_login_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return null;
  }
  await sb.from("corporate_login_codes").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

  const { data: acc } = await sb.from("corporate_accounts").select("*").eq("id", row.account_id).maybeSingle();
  if (!acc) return null;

  // The code is spent and matched: this address is proved. Session minting —
  // including the re-check that access still stands — lives in one place.
  return startCorporateSession(acc as CorporateAccount, email, "email", ctx);
}

/** The signed-in corporate user, or null. Safe to call from pages and routes. */
export async function currentCorporateSession(
  options: { allowVaultUploadOnly?: boolean } = {},
): Promise<CorporateSession | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const token = (await cookies()).get(CORP_COOKIE)?.value;
  if (!token) return null;
  // "*" rather than a column list so the city column (20261008084838) can be
  // read the moment it exists without a missing column ever signing everyone
  // out in the window between deploy and migration.
  const { data } = await sb.from("corporate_sessions")
    .select("*")
    .eq("token_hash", sha256(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;

  // Use, not just entry. A session lives as long as it is used, so a designer
  // who signed in a fortnight ago and works in the portal every day never "logs in"
  // again; counting logins alone would read as silence while HomeLane's team
  // was busy. `last_seen_at` (a column 0037 created and nothing wrote until
  // 1 October 2026) is refreshed at most once an hour, and the morning brief
  // reads it as "used the portal that day".
  const seen = Date.parse(String((data as { last_seen_at?: string | null }).last_seen_at ?? ""));
  if (!Number.isFinite(seen) || Date.now() - seen > SEEN_TOUCH_MS) {
    await sb.from("corporate_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("token_hash", sha256(token));
  }
  const { data: acc } = await sb.from("corporate_accounts")
    .select("*").eq("id", (data as { account_id: string }).account_id).eq("active", true).maybeSingle();
  if (!acc) return null;
  const account = acc as CorporateAccount;
  const email = (data as { email: string }).email;

  const staff = isStaffEmail(email);
  if (!staff && isTraceOnlyAccount(account)) return null;
  const member = staff ? null : await memberFor(account.id, email);
  // Revocation bites on the next request, not whenever the cookie finally
  // lapses: an admin who removes a colleague has removed them.
  if (!staff && !member && (await accountRunsAllowList(account.id))) return null;

  const city = (data as { city?: string | null }).city;
  const session: CorporateSession = {
    account, email, member, staff,
    agreementPending: await accountAgreementPending(account),
    city: typeof city === "string" && city ? city : null,
  };
  // Explicit opt-in only at Vault, sign-in and session-display boundaries.
  // Every other existing (or future) portal action fails closed for this grant.
  if (isVaultUploadOnly(session) && !options.allowVaultUploadOnly) return null;
  return session;
}

/** Record the city this sign-in is working in. Only for the session holding
 *  the cookie, so nobody can choose a city for somebody else's sign-in. The
 *  caller has already checked the city is allowed for the account. */
export async function setSessionCity(session: CorporateSession, city: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const token = (await cookies()).get(CORP_COOKIE)?.value;
  if (!sb || !token) return false;
  const { data, error } = await sb.from("corporate_sessions")
    .update({ city })
    .eq("token_hash", sha256(token))
    .eq("account_id", session.account.id)
    .eq("email", session.email)
    .gt("expires_at", new Date().toISOString())
    .select("token_hash").maybeSingle();
  if (error || !data) {
    if (error) console.error("[corp-auth] could not save the session city", error.message);
    return false;
  }
  await recordAudit(session, "session.city", null, { city, from: session.city });
  return true;
}

/** Keep an actively used partner login alive. Called from a route handler,
 * where the refreshed browser cookie can be written alongside the database
 * expiry. An expired or revoked session never reaches this point. */
export async function renewCorporateSession(session: CorporateSession): Promise<void> {
  const jar = await cookies();
  const token = jar.get(CORP_COOKIE)?.value;
  const sb = supabaseAdmin();
  if (!token || !sb) return;
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  const { data, error } = await sb.from("corporate_sessions")
    .update({ expires_at: expires.toISOString() })
    .eq("token_hash", sha256(token))
    .eq("account_id", session.account.id)
    .eq("email", session.email)
    .gt("expires_at", new Date().toISOString())
    .select("token_hash").maybeSingle();
  if (!error && data) jar.set(CORP_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", expires,
  });
}

export async function endCorporateSession(): Promise<void> {
  const sb = supabaseAdmin();
  const jar = await cookies();
  const token = jar.get(CORP_COOKIE)?.value;
  if (sb && token) await sb.from("corporate_sessions").delete().eq("token_hash", sha256(token));
  jar.delete(CORP_COOKIE);
}

// ── Pricing ────────────────────────────────────────────────────────────────
const round2 = (n: number) => Math.round(n * 100) / 100;

export type CorporateQuote = {
  /** The area actually CHARGED. Equals fullAreaSqft unless openings were
   *  excluded (the chargeable remainder) or the media floor bound (the web
   *  the piece consumes, which can EXCEED the artwork rectangle). */
  areaSqft: number;
  /** The plain wall rectangle, before any opening exclusion — kept so the
   *  proposal and invoice can show the saving as a sourced line. */
  fullAreaSqft: number;
  /** Sq ft neither printed nor billed because it was marked as an opening. */
  excludedSqft: number;
  /** Ex-GST value before any partner discount. Equals `amount` when there is none. */
  listAmount: number;
  discountPct: number;
  discountAmount: number;
  /** Ex-GST value actually charged (list − discount). */
  amount: number;
  gstAmount: number;
  total: number;
  /** Ex-GST ₹/sq ft the quote was built from — stored on the order for audit. */
  ratePerSqft: number;
  /** The media billing floor in force when this was priced (print_product_types
   *  media_width_mm − billing_trim_mm), stored on the order for audit. Null =
   *  no floor: a nest-capable type, or priced before migration 0106. */
  minBillableWidthMm: number | null;
  /** True when the floor RAISED the bill above the artwork's chargeable area —
   *  the flag every quote/proposal surface uses to say so out loud, because a
   *  partner billed 48 sq ft for 24 sq ft of art deserves the arithmetic. */
  mediaFloorApplied: boolean;
};

/** Area/amount for a wall at the account's contracted rate. Single source of
 *  truth so the quote shown on screen and the invoice can never disagree.
 *
 *  `chargeableSqft` is the opening-excluded area from lib/corporate-openings.ts
 *  — pass it and the partner is billed for exactly what prints (a glass return
 *  or a full-height door comes off both the film and the bill). Null/omitted
 *  bills the plain rectangle, which is every order placed before 0087 and every
 *  wall with nothing marked. It is never recomputed from the openings here:
 *  the plan already did that arithmetic, and two derivations of one number is
 *  how billed area and printed area drift apart. */
export function priceWall(
  widthMm: number, heightMm: number, ratePerSqft: number, gstPct: number, discountPct = 0,
  chargeableSqft: number | null = null,
  minBillableWidthMm: number | null = null,
): CorporateQuote {
  const fullAreaSqft = (widthMm * heightMm) / 92_903.04;
  // Guard the override rather than trust it: a chargeable area above the wall
  // itself, or below zero, means the plan and the size disagree — bill the
  // rectangle instead of inventing a number in the partner's favour or ours.
  const usable = chargeableSqft != null && Number.isFinite(chargeableSqft)
    && chargeableSqft >= 0 && chargeableSqft <= fullAreaSqft + 0.001;
  const artworkSqft = usable ? chargeableSqft! : fullAreaSqft;
  // The media floor (migration 0106): a one-lane piece consumes the full web
  // for every running metre, so the bill can never fall below run length ×
  // billable width — no matter how narrow the artwork, and openings included:
  // a skipped door saves no paper on a piece already narrower than the roll.
  const floorSqft = minBillableWidthMm != null && minBillableWidthMm > 0
    ? mediaFloorSqft(widthMm, heightMm, minBillableWidthMm) : 0;
  const mediaFloorApplied = floorSqft > artworkSqft + 0.001;
  const areaSqft = mediaFloorApplied ? floorSqft : artworkSqft;
  const listAmount = round2(areaSqft * ratePerSqft);
  const discountAmount = round2((listAmount * discountPct) / 100);
  const amount = round2(listAmount - discountAmount);
  const gstAmount = round2((amount * gstPct) / 100);
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    areaSqft: round3(areaSqft),
    fullAreaSqft: round3(fullAreaSqft),
    // The opening saving as PLANNED, even when the floor then swallowed it —
    // excludedSqft says what was left unprinted, not what came off the bill.
    excludedSqft: usable ? round3(fullAreaSqft - artworkSqft) : 0,
    listAmount,
    discountPct,
    discountAmount,
    amount,
    gstAmount,
    total: round2(amount + gstAmount),
    ratePerSqft: round2(ratePerSqft),
    minBillableWidthMm: minBillableWidthMm != null && minBillableWidthMm > 0 ? minBillableWidthMm : null,
    mediaFloorApplied,
  };
}

/**
 * Price a wall for a `pricing_mode='website'` partner (e.g. an architectural
 * firm on catalogue pricing less a partner discount).
 *
 * The catch this exists to handle: storefront `product_materials.price_per_sqft`
 * is **GST-INCLUSIVE** (see pricing.ts), whereas corporate accounts quote
 * ex-GST and add GST on top. Feeding the storefront rate straight into
 * priceWall() would tax the same amount twice — roughly 18% too high. So the
 * rate is converted to ex-GST first, unrounded, and rounding happens once at
 * the amount level.
 */
export function priceWallFromCatalogue(
  widthMm: number,
  heightMm: number,
  inclusiveRatePerSqft: number,
  gstPct: number,
  discountPct: number,
  chargeableSqft: number | null = null,
  minBillableWidthMm: number | null = null,
): CorporateQuote {
  const exRate = inclusiveRatePerSqft / (1 + gstPct / 100);
  return priceWall(widthMm, heightMm, exRate, gstPct, discountPct, chargeableSqft, minBillableWidthMm);
}
