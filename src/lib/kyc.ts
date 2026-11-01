import { randomUUID } from "node:crypto";

// PAN/GSTIN identity verification for the trade partner apply flow, via
// Cashfree Secure ID (the "Verification Suite" product) — recommended vendor
// per ~/Zyvorah/docs/trade-partner-program-spec.md (Sandbox/sandbox.co.in is
// the documented fallback; swap the implementation behind these three
// exports if we ever switch). Razorpay does NOT offer PAN/GSTIN verification,
// which is why this is a second vendor alongside razorpay.ts.
//
// Contract mirrors razorpay.ts: every function degrades to `null` when the
// vendor keys aren't configured, or when the vendor call itself fails/errors.
// null means "verification unavailable, try later" — callers must NEVER treat
// null as a pass. Only an explicit verified=true/exists=true result is a pass.
//
// Env: CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET (server-only). Optional
// CASHFREE_API_BASE_URL override for pointing at the sandbox
// (https://sandbox.cashfree.com/verification) during Phase 6-style test-mode
// verification — defaults to production.
//
// ── Endpoints — VERIFIED against Cashfree's live Verification Suite V2 docs
// (cashfree.com/docs/api-reference/vrs/v2/…) 2026-07-30, fixing three real
// discrepancies the first draft of this file guessed wrong: PAN's response
// carries `pan_status` (not `status`) and match quality in `name_match_result`
// (not a boolean `name_pan_match`, which doesn't exist); GSTIN's status field
// is `gst_in_status` (not `gstin_status`); and GST-search-by-PAN is
// `POST /pan-gstin` with a `{pan, verification_id}` body returning
// `{status, gstin_list: [{gstin, status, state}]}` — NOT a `GET
// /gstin/pan/{pan}` as originally guessed, which would have 404'd against the
// real API and left every "not GST-registered" declaration permanently stuck
// on "verification unavailable".
const CASHFREE_BASE_URL = process.env.CASHFREE_API_BASE_URL || "https://api.cashfree.com/verification";
const PAN_VERIFY_PATH = "/pan";                     // POST — PAN + name match
const GSTIN_VERIFY_PATH = "/gstin";                 // POST — GSTIN details/status
const GSTIN_BY_PAN_PATH = "/pan-gstin";             // POST — every GSTIN registered against a PAN
const API_VERSION_HEADER = "2022-09-01";
// ─────────────────────────────────────────────────────────────────────────

function credentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function cashfreeFetch<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> },
): Promise<T | null> {
  const creds = credentials();
  if (!creds) return null;
  try {
    const res = await fetch(`${CASHFREE_BASE_URL}${path}`, {
      method: init.method,
      headers: {
        "x-client-id": creds.clientId,
        "x-client-secret": creds.clientSecret,
        "x-api-version": API_VERSION_HEADER,
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      console.error(`cashfree ${path} failed:`, res.status, await res.text().catch(() => ""));
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error(`cashfree ${path} error:`, e);
    return null;
  }
}

export type PanVerification = {
  valid: boolean;
  /** true only when the supplied name matched the registered PAN name closely enough. */
  nameMatched: boolean;
  /** The name Cashfree has on file for this PAN, when returned. */
  registeredName: string | null;
  raw: unknown;
};

// Cashfree's own match-quality grading (name_match_result) — DIRECT and GOOD
// partial matches pass; MODERATE/POOR/NO_MATCH don't. This is what actually
// exists on the wire; a plain boolean "name_pan_match" field does not.
const PASSING_NAME_MATCH_RESULTS = new Set(["DIRECT_MATCH", "GOOD_PARTIAL_MATCH"]);

/** Verify a PAN and check the supplied name against the registered name.
 *  Returns null when unconfigured or the vendor call fails — never a pass. */
export async function verifyPan(pan: string, name: string): Promise<PanVerification | null> {
  const data = await cashfreeFetch<{
    valid?: boolean;
    pan_status?: string; // VALID | INVALID | DELETED | DEACTIVATED
    registered_name?: string;
    name_match_result?: string; // DIRECT_MATCH | GOOD_PARTIAL_MATCH | MODERATE_PARTIAL_MATCH | POOR_PARTIAL_MATCH | NO_MATCH
  }>(PAN_VERIFY_PATH, { method: "POST", body: { pan, name } });
  if (!data) return null;
  const valid = data.valid === true || data.pan_status === "VALID";
  const registeredName = data.registered_name ?? null;
  const nameMatched = data.name_match_result
    ? PASSING_NAME_MATCH_RESULTS.has(data.name_match_result)
    : registeredName != null && normalizeNameForMatch(registeredName) === normalizeNameForMatch(name);
  return { valid, nameMatched, registeredName, raw: data };
}

export type GstinVerification = {
  valid: boolean;
  status: string | null; // e.g. Active / Cancelled
  legalName: string | null;
  raw: unknown;
};

/** Verify a GSTIN's registration status and legal name. */
export async function verifyGstin(gstin: string): Promise<GstinVerification | null> {
  const data = await cashfreeFetch<{
    valid?: boolean;
    gst_in_status?: string;
    legal_name_of_business?: string;
    trade_name_of_business?: string;
  }>(GSTIN_VERIFY_PATH, { method: "POST", body: { GSTIN: gstin } });
  if (!data) return null;
  const status = data.gst_in_status ?? null;
  return {
    valid: data.valid === true || status?.toLowerCase() === "active",
    status,
    legalName: data.legal_name_of_business ?? data.trade_name_of_business ?? null,
    raw: data,
  };
}

/** GST-search-by-PAN: every GSTIN registered against a PAN, so a "not
 *  GST-registered" declaration can be auto-rejected when one actually exists.
 *  Returns an empty array (not null) when the vendor confirms no GSTINs
 *  exist; null only on "verification unavailable" — including an unexpected
 *  `status` value neither SUCCESS nor GSTIN_NOT_FOUND, since guessing which
 *  way that should fail is worse than surfacing "try again". */
export async function gstinsByPan(pan: string): Promise<string[] | null> {
  const data = await cashfreeFetch<{
    status?: string; // SUCCESS | GSTIN_NOT_FOUND
    gstin_list?: Array<{ gstin?: string; status?: string; state?: string }>;
  }>(GSTIN_BY_PAN_PATH, { method: "POST", body: { pan, verification_id: randomUUID() } });
  if (!data) return null;
  if (data.status === "GSTIN_NOT_FOUND") return [];
  if (data.status !== "SUCCESS") return null;
  return (data.gstin_list ?? []).map((entry) => entry.gstin).filter((g): g is string => !!g);
}

/** Loose normalization for PAN-name / bank-registered-name matching — case,
 *  punctuation and extra whitespace shouldn't fail an honest applicant. */
export function normalizeNameForMatch(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,]/g, "")
    .replace(/\b(MR|MRS|MS|DR|M\/S|PVT|LTD|LLP|PRIVATE|LIMITED)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token-overlap check tolerant of minor variations (middle names, word
 *  order, legal suffixes already stripped by normalizeNameForMatch). Used to
 *  match the RazorpayX penny-drop registered name against the PAN name. */
export function namesLooselyMatch(a: string, b: string): boolean {
  const na = normalizeNameForMatch(a);
  const nb = normalizeNameForMatch(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const tokensA = new Set(na.split(" ").filter((t) => t.length > 1));
  const tokensB = new Set(nb.split(" ").filter((t) => t.length > 1));
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  let shared = 0;
  for (const t of tokensA) if (tokensB.has(t)) shared++;
  const overlap = shared / Math.min(tokensA.size, tokensB.size);
  return overlap >= 0.6;
}
