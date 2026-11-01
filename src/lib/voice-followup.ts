import { serviceFetch } from "../brand/service-transport";
const fetch: typeof globalThis.fetch = (input,init) => serviceFetch("messaging",input,init);
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  allRows,
  chunk,
  firstRow,
  opsDb,
  parseJsonObject,
  placeholders,
  runBatch,
  runWrite,
  type D1Database,
  type D1Value,
} from "@/lib/ops-db";
import { normalisePhone } from "@/lib/google-ads";
import { isInternalOrder } from "@/lib/internal-orders";
import { isTestLead } from "@/lib/lead-rules";
import { IST_OFFSET_MS, istWeekday } from "@/lib/ist";
import { SITE_URL } from "@/lib/seo";
import { vapiTranscriber, vapiVoice } from "@/lib/vapi-speech";
import { VOICE_FOLLOWUP_ENABLED } from "@/lib/voice-flag";
import { probeVapiNumbers } from "@/lib/vapi-numbers";
import type { FollowupCallContext } from "@/lib/voice-concierge";
import { anthropicKeyFor } from "@/lib/ai-keys";

/**
 * OUTBOUND AI follow-up calls, placed through Vapi.
 *
 * Three moments are worth a phone call, and until 30 September 2026 none of
 * them got one unless somebody found the time:
 *
 *   sample   a printed design sample, PAID 20–72 hours ago. Long enough that it
 *            may have arrived; short enough that the design is still on their
 *            mind. The sample form has required a WhatsApp-able Indian mobile
 *            since it stopped being optional ("most samples arrived with
 *            nothing to follow up on" — OrderSample.tsx).
 *   enquiry  a bespoke / commercial enquiry in the last 48 hours that carried a
 *            mobile (EnquiryForm folds it into the message as "Phone: …";
 *            contact_messages has no phone column).
 *   cart     a cart with designs in it, or a web order that never got paid,
 *            left 20–72 hours ago by someone we have a mobile for — and who has
 *            not paid for anything since. The same source the intel agent's
 *            "abandoned carts with any known customer contact" reads (carts
 *            .contact_phone, then the linked customer), plus unpaid orders,
 *            which is where the stalled-checkouts cron found #54 and #56: a
 *            checkout that reached payment marks its cart 'ordered', so an
 *            open-cart read alone never sees the people closest to buying.
 *
 * This module only decides WHO and WHEN, and dials. What is said is the brain
 * in voice-concierge.ts (runVoiceFollowup), reached by Vapi through
 * /api/voice/followup; what happened is written back by /api/webhooks/vapi.
 *
 * WHERE. The work list (voice_followups) and the do-not-call list
 * (voice_optout) live in Cloudflare D1 — `zyvorah-ops`, bound as OPS_DB, schema
 * in d1/zyvorah-ops/ — not Supabase (why: src/lib/ops-db.ts). The SOURCE rows
 * (orders, contact_messages, carts, customers) are still read from Supabase
 * with supabaseAdmin(). The two never join; phones cross as bound values.
 *
 * THE GUARANTEES, each enforced in code below rather than hoped for:
 *  - Never outside Mon–Sat 10:30–19:30 IST (inCallingWindow, checked per call).
 *  - Never twice for one row: status 'queued' → 'calling' is a compare-and-set
 *    on (status, attempts); a lost race dials nothing.
 *  - Never an opted-out number: checked at enqueue AND immediately before
 *    dialling, so an opt-out recorded in between still wins.
 *  - Never the same number twice in a week, across every kind.
 *  - At most MAX_ATTEMPTS dials per row, the retry ≥ RETRY_AFTER_HOURS after a
 *    missed call; at most MAX_CALLS_PER_RUN dials per cron tick.
 *  - Never throws for missing config: every missing key or table is a named
 *    "inert" reason the cron files to the morning brief.
 */

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export const MAX_CALLS_PER_RUN = 6;
export const MAX_ATTEMPTS = 2;
export const RETRY_AFTER_HOURS = 4;
const COOLDOWN_DAYS = 7;
const SAMPLE_WINDOW_H = [20, 72] as const;
// An hour's grace so a human reply can land first and nobody is rung while
// still on the page they wrote from.
const ENQUIRY_WINDOW_H = [1, 48] as const;
const CART_WINDOW_H = [20, 72] as const;
/** Carts and unpaid orders are only rung if they were left after checkout
 *  started telling people we might call (the notice under the phone field,
 *  added 30 Sep 2026). Sample buyers and enquirers asked us about something;
 *  a cart owner before this date never heard a call was possible. 00:00 IST
 *  on 1 October, so the notice is live before the first eligible cart. */
const CART_CONSENT_SINCE = "2026-09-30T18:30:00.000Z";
/** A row not dialled within four days (a long weekend, a paused flag) is stale:
 *  "about the sample you ordered" a week later is a cold call. */
const EXPIRE_AFTER_H = 96;
/** A call whose end-of-call report never arrived. Marked failed, never redialled
 *  — a lost webhook must not become a second call. */
const STUCK_CALLING_H = 3;
/** Vapi hard stop; the brain is asked to finish in about four minutes. */
const MAX_CALL_SECONDS = 420;

/** Mon–Sat, from 10:30 until (not including) 19:30 IST. */
const WINDOW_START_MIN = 10 * 60 + 30;
const WINDOW_END_MIN = 19 * 60 + 30;

/** The number customers WhatsApp. Spoken digit by digit on a voicemail. */
export const WHATSAPP_NUMBER = "+91 74999 16485";
const WHATSAPP_SPOKEN = "plus nine one, seven four nine nine nine, one six four eight five";

const E164_IN_MOBILE = /^\+91[6-9]\d{9}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FollowupKind = "sample" | "enquiry" | "cart";

export type FollowupRow = {
  id: string;
  kind: FollowupKind;
  ref_id: string;
  name: string | null;
  phone: string;
  email: string | null;
  context: Record<string, unknown> | null;
  status: string;
  attempts: number;
  due_at: string;
  last_attempt_at: string | null;
  vapi_call_id: string | null;
  created_at: string;
};

/** A voice_followups row as D1 returns it: context is JSON TEXT there. A
 *  context that will not parse reads as null (the brain then works from the
 *  kind alone) rather than failing the call it belongs to. */
function toFollowupRow(r: Record<string, unknown>): FollowupRow {
  return {
    id: String(r.id),
    kind: r.kind as FollowupKind,
    ref_id: String(r.ref_id),
    name: (r.name as string | null) ?? null,
    phone: String(r.phone),
    email: (r.email as string | null) ?? null,
    context: parseJsonObject(r.context),
    status: String(r.status),
    attempts: Number(r.attempts),
    due_at: String(r.due_at),
    last_attempt_at: (r.last_attempt_at as string | null) ?? null,
    vapi_call_id: (r.vapi_call_id as string | null) ?? null,
    created_at: String(r.created_at),
  };
}

const byIdSql = "SELECT * FROM voice_followups WHERE id = ?";
const byCallIdSql = "SELECT * FROM voice_followups WHERE vapi_call_id = ?";

/** The same parse the sample form gates on (OrderSample.tsx): normalisePhone,
 *  then only an Indian MOBILE in E.164. Anything else is not dialled. */
export function toCallableMobile(raw: unknown): string | null {
  const p = normalisePhone(typeof raw === "string" ? raw : null);
  return p && E164_IN_MOBILE.test(p) ? p : null;
}

export function inCallingWindow(now: Date = new Date()): boolean {
  if (istWeekday(now) === 0) return false; // Sunday
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= WINDOW_START_MIN && mins < WINDOW_END_MIN;
}

const hoursAgo = (now: Date, h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

function firstNameOf(name: unknown): string | null {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  // Letters only, and short: this is spoken aloud by a TTS voice, and a name
  // field holding "ABC Interiors Pvt Ltd" or an email must not be.
  const clean = first.replace(/[^\p{L}'-]/gu, "");
  return clean.length >= 2 && clean.length <= 20 ? clean[0].toUpperCase() + clean.slice(1) : null;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

// ---------------------------------------------------------------------------
// Inert: say exactly what is missing, never throw
// ---------------------------------------------------------------------------

export type Readiness =
  | { ok: true; db: SupabaseClient; ops: D1Database }
  | { ok: false; reason: string; db: SupabaseClient | null };

/** Everything the calls need, checked in the order a person would fix it.
 *  `db` is Supabase (source reads only); `ops` is D1 (every follow-up row). */
export async function followupReadiness(): Promise<Readiness> {
  if (!VOICE_FOLLOWUP_ENABLED) {
    return { ok: false, db: supabaseAdmin(), reason: "VOICE_FOLLOWUP_ENABLED is false in src/lib/voice-flag.ts — calls are paused" };
  }
  const db = supabaseAdmin();
  if (!db) return { ok: false, db: null, reason: "SUPABASE_SERVICE_ROLE_KEY not set — orders, enquiries and carts cannot be read" };
  if (!process.env.VAPI_API_KEY) {
    return { ok: false, db, reason: "VAPI_API_KEY not set — outbound calling credentials are not configured" };
  }
  if (!process.env.VAPI_PHONE_NUMBER_ID) {
    // The one missing piece: say what Vapi already owns and whether the rest
    // is ready, so the brief answers "what exactly is left" in one line.
    const numbers = await probeVapiNumbers(process.env.VAPI_API_KEY);
    const rest = [
      !process.env.VOICE_LLM_SECRET && "VOICE_LLM_SECRET",
      !anthropicKeyFor("shoppers") && "ANTHROPIC_API_KEY",
      !(await opsDb()) && "OPS_DB binding",
    ].filter(Boolean);
    return {
      ok: false,
      db,
      reason:
        `VAPI_PHONE_NUMBER_ID not set — no outbound calling number is configured; ${numbers}; ` +
        (rest.length ? `also missing: ${rest.join(", ")}` : "everything else is configured"),
    };
  }
  if (!process.env.VOICE_LLM_SECRET) {
    return { ok: false, db, reason: "VOICE_LLM_SECRET not set — the follow-up brain and the Vapi webhook both refuse every request without it" };
  }
  if (!anthropicKeyFor("shoppers")) {
    return { ok: false, db, reason: "ANTHROPIC_API_KEY not set — the follow-up brain cannot answer" };
  }
  const ops = await opsDb();
  if (!ops) {
    return { ok: false, db, reason: "OPS_DB D1 binding missing — the call queue is unavailable" };
  }
  for (const table of ["voice_followups", "voice_optout"]) {
    // Table names are the two literals above, never input.
    const { error } = await firstRow(ops.prepare(`SELECT 1 AS ok FROM ${table} LIMIT 1`));
    if (error && /no such table/i.test(error.message)) {
      return { ok: false, db, reason: `${table} table missing in D1 zyvorah-ops — apply d1/zyvorah-ops/0001_voice_followups.sql` };
    }
    if (error) return { ok: false, db, reason: `${table} unreadable in D1 zyvorah-ops: ${error.message}` };
  }
  return { ok: true, db, ops };
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

type Candidate = {
  kind: FollowupKind;
  ref_id: string;
  name: string | null;
  phone: string;
  email: string | null;
  context: Record<string, unknown>;
  /** When the moment happened — a cart is dropped if its owner paid after it. */
  at: string;
};

const PRIORITY: Record<FollowupKind, number> = { sample: 0, enquiry: 1, cart: 2 };

const cmToFt = (cm: unknown) => {
  const n = Number(cm);
  return Number.isFinite(n) && n > 0 ? Math.round((n / 30.48) * 10) / 10 : null;
};

async function sampleCandidates(db: SupabaseClient, now: Date, notes: string[]): Promise<Candidate[]> {
  const { data, error } = await db
    .from("orders")
    .select("id, order_number, email, phone, shipping_address, notes, paid_at")
    .eq("placed_via", "sample")
    .eq("payment_status", "paid")
    .gte("paid_at", hoursAgo(now, SAMPLE_WINDOW_H[1]))
    .lte("paid_at", hoursAgo(now, SAMPLE_WINDOW_H[0]))
    .limit(200);
  if (error) {
    notes.push(`samples: ${error.message}`);
    return [];
  }
  const out: Candidate[] = [];
  for (const o of data ?? []) {
    const phone = toCallableMobile(o.phone);
    if (!phone) continue;
    const addr = (o.shipping_address ?? {}) as { name?: string; city?: string };
    // "Printed design sample — {title} ({handle})" — sample-order/route.ts.
    const m = /Printed design sample — (.+) \(([a-z0-9-]+)\)/.exec(String(o.notes ?? ""));
    out.push({
      kind: "sample",
      ref_id: String(o.id),
      name: addr.name ?? null,
      phone,
      email: o.email ?? null,
      at: String(o.paid_at),
      context: {
        design_title: m?.[1] ?? null,
        design_handle: m?.[2] ?? null,
        city: addr.city ?? null,
        order_number: o.order_number ?? null,
        paid_at: o.paid_at,
      },
    });
  }
  return out;
}

async function enquiryCandidates(db: SupabaseClient, now: Date, notes: string[]): Promise<Candidate[]> {
  // contact_messages was created outside this repo's migrations; submit_contact
  // (p_name, p_email, p_message, p_topic) and 0011_intelligence.sql's
  // created_at filter are what we know of its shape. select("*") so a column
  // that is not there cannot fail the read.
  const { data, error } = await db
    .from("contact_messages")
    .select("*")
    .gte("created_at", hoursAgo(now, ENQUIRY_WINDOW_H[1]))
    .lte("created_at", hoursAgo(now, ENQUIRY_WINDOW_H[0]))
    .limit(200);
  if (error) {
    notes.push(`enquiries: ${error.message}`);
    return [];
  }
  const out: Candidate[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const message = String(r.message ?? "");
    const phone = toCallableMobile(/^Phone:\s*(.+)$/m.exec(message)?.[1]);
    if (!phone || r.id == null) continue;
    const org = /^Organisation:\s*(.+)$/m.exec(message)?.[1]?.trim() ?? null;
    const asked = message
      .split("\n")
      .filter((l) => !/^(Organisation|Phone):/.test(l))
      .join("\n")
      .trim()
      .slice(0, 600);
    out.push({
      kind: "enquiry",
      ref_id: String(r.id),
      name: (r.name as string) ?? null,
      phone,
      email: (r.email as string) ?? null,
      at: String(r.created_at),
      context: { topic: r.topic ?? null, organisation: org, what_they_asked: asked, sent_at: r.created_at },
    });
  }
  return out;
}

async function cartCandidates(db: SupabaseClient, now: Date, notes: string[]): Promise<Candidate[]> {
  const windowStart = hoursAgo(now, CART_WINDOW_H[1]);
  const from = windowStart > CART_CONSENT_SINCE ? windowStart : CART_CONSENT_SINCE;
  const to = hoursAgo(now, CART_WINDOW_H[0]);
  const out: Candidate[] = [];
  if (from >= to) return out;

  const carts = await db
    .from("carts")
    .select(
      "id, updated_at, contact_phone, contact_name, contact_email, customers(phone, name, email), cart_items(width_cm, height_cm, products(title, handle), materials(name))",
    )
    .eq("status", "open")
    .gte("updated_at", from)
    .lte("updated_at", to)
    .limit(300);
  if (carts.error) notes.push(`carts: ${carts.error.message}`);
  for (const c of carts.data ?? []) {
    const cu = one(c.customers as unknown as { phone?: string; name?: string; email?: string } | null);
    const phone = toCallableMobile(c.contact_phone ?? cu?.phone);
    const items = (c.cart_items ?? []) as unknown as {
      width_cm: number | null;
      height_cm: number | null;
      products: { title?: string; handle?: string } | null;
      materials: { name?: string } | null;
    }[];
    if (!phone || !items.length) continue;
    // The e-mail chaser (cron/cart-followups) has always skipped staff checks
    // and example.com test carts; the phone did not, so a checkout test whose
    // cart reopened could be rung like a customer. Same two rules, here too.
    const email = c.contact_email ?? cu?.email ?? null;
    if (isInternalOrder(email) || isTestLead(email)) continue;
    out.push({
      kind: "cart",
      ref_id: `cart:${c.id}`,
      name: c.contact_name ?? cu?.name ?? null,
      phone,
      email: c.contact_email ?? cu?.email ?? null,
      at: String(c.updated_at),
      context: {
        stage: "left designs in the cart",
        items: items.slice(0, 4).map((i) => ({
          design_title: one(i.products)?.title ?? null,
          design_handle: one(i.products)?.handle ?? null,
          finish: one(i.materials)?.name ?? null,
          wall_width_ft: cmToFt(i.width_cm),
          wall_height_ft: cmToFt(i.height_cm),
        })),
      },
    });
  }

  const orders = await db
    .from("orders")
    .select("id, email, phone, shipping_address, created_at, order_items(product_title, material_name, width_cm, height_cm)")
    .eq("placed_via", "web")
    .in("payment_status", ["pending", "failed"])
    .neq("status", "cancelled")
    .not("phone", "is", null)
    .gte("created_at", from)
    .lte("created_at", to)
    .limit(200);
  if (orders.error) notes.push(`unpaid orders: ${orders.error.message}`);
  for (const o of orders.data ?? []) {
    const phone = toCallableMobile(o.phone);
    const items = (o.order_items ?? []) as {
      product_title: string | null;
      material_name: string | null;
      width_cm: number | null;
      height_cm: number | null;
    }[];
    if (!phone || !items.length) continue;
    const addr = (o.shipping_address ?? {}) as { name?: string; city?: string };
    out.push({
      kind: "cart",
      ref_id: `order:${o.id}`,
      name: addr.name ?? null,
      phone,
      email: o.email ?? null,
      at: String(o.created_at),
      context: {
        stage: "reached payment but did not pay",
        city: addr.city ?? null,
        items: items.slice(0, 4).map((i) => ({
          design_title: i.product_title,
          finish: i.material_name,
          wall_width_ft: cmToFt(i.width_cm),
          wall_height_ft: cmToFt(i.height_cm),
        })),
      },
    });
  }

  if (!out.length) return out;

  // "Excluding anyone who has since paid": a paid order (any kind but a
  // sample, which is not the cart being finished) by the same phone or email
  // at or after the moment the cart was left. Compared on the normalised phone,
  // because orders.phone is stored as typed.
  const paid = await db
    .from("orders")
    .select("phone, email, paid_at, placed_via")
    .eq("payment_status", "paid")
    .neq("placed_via", "sample")
    .gte("paid_at", from)
    .limit(1000);
  if (paid.error) {
    // Unknown who has paid — calling a customer who just bought, about the
    // cart they bought, is the one mistake this must not make. Skip carts.
    notes.push(`carts skipped, paid-order check failed: ${paid.error.message}`);
    return [];
  }
  const paidRows = (paid.data ?? []).map((p) => ({
    phone: toCallableMobile(p.phone),
    email: String(p.email ?? "").trim().toLowerCase() || null,
    at: Date.parse(String(p.paid_at)),
  }));
  return out.filter((c) => {
    const at = Date.parse(c.at);
    const email = c.email?.trim().toLowerCase() || null;
    return !paidRows.some((p) => p.at >= at && ((p.phone && p.phone === c.phone) || (email && p.email === email)));
  });
}

export type EnqueueResult = { found: number; queued: number; optedOut: number; recentlyCalled: number; notes: string[] };

/** Columns an enqueue writes, in bind order. */
const INSERT_COLS = ["id", "kind", "ref_id", "name", "phone", "email", "context", "status", "attempts", "due_at", "created_at", "updated_at"];
/** Rows per multi-row INSERT: 12 bound values each, under D1's 100 per statement. */
const INSERT_ROWS_PER_STMT = 8;

/**
 * Find everyone worth a call and queue them once. Safe to run every hour: the
 * unique (kind, ref_id) makes a second sighting a no-op, and the one-call-a-
 * week-per-number rule is applied here as well as at dial time.
 *
 * `db` (Supabase) is read for the candidates; `ops` (D1) holds the queue.
 */
export async function enqueueCandidates(db: SupabaseClient, ops: D1Database, now: Date = new Date()): Promise<EnqueueResult> {
  const notes: string[] = [];
  const all = [
    ...(await sampleCandidates(db, now, notes)),
    ...(await enquiryCandidates(db, now, notes)),
    ...(await cartCandidates(db, now, notes)),
  ].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);

  // One number, one follow-up: the sample outranks the enquiry outranks the
  // cart, because it is the most specific thing we can talk about.
  const byPhone = new Map<string, Candidate>();
  for (const c of all) if (!byPhone.has(c.phone)) byPhone.set(c.phone, c);
  const phones = [...byPhone.keys()];
  const result: EnqueueResult = { found: all.length, queued: 0, optedOut: 0, recentlyCalled: 0, notes };
  if (!phones.length) return result;

  // Both lookups run in chunks (D1's 100-parameter cap); ANY chunk failing
  // fails the whole check, exactly as the single read used to.
  const blocked = new Set<string>();
  for (const part of chunk(phones)) {
    const optout = await allRows<{ phone: string }>(
      ops.prepare(`SELECT phone FROM voice_optout WHERE phone IN (${placeholders(part.length)})`).bind(...part),
    );
    if (optout.error) {
      // Fail closed: if we cannot read the do-not-call list we queue nobody.
      notes.push(`opt-out list unreadable: ${optout.error.message}`);
      return result;
    }
    for (const r of optout.data) blocked.add(r.phone);
  }

  const since = hoursAgo(now, COOLDOWN_DAYS * 24);
  const recentPhones = new Set<string>();
  for (const part of chunk(phones)) {
    const recent = await allRows<{ phone: string }>(
      ops
        .prepare(
          `SELECT DISTINCT phone FROM voice_followups WHERE phone IN (${placeholders(part.length)}) AND (created_at >= ? OR last_attempt_at >= ?)`,
        )
        .bind(...part, since, since),
    );
    if (recent.error) {
      notes.push(`recent-call check failed: ${recent.error.message}`);
      return result;
    }
    for (const r of recent.data) recentPhones.add(r.phone);
  }

  const stamp = now.toISOString();
  const rows: D1Value[][] = [];
  for (const [phone, c] of byPhone) {
    if (blocked.has(phone)) {
      result.optedOut++;
      continue;
    }
    if (recentPhones.has(phone)) {
      result.recentlyCalled++;
      continue;
    }
    rows.push([
      crypto.randomUUID(),
      c.kind,
      c.ref_id,
      c.name?.slice(0, 120) ?? null,
      phone,
      c.email ?? null,
      JSON.stringify(c.context ?? {}),
      "queued",
      0,
      stamp,
      stamp,
      stamp,
    ]);
  }
  if (!rows.length) return result;

  // ON CONFLICT (kind, ref_id) DO NOTHING: a row already queued, called or
  // skipped for this sample/enquiry/cart is never queued again. One batch, so
  // the enqueue lands whole or not at all, as the single upsert did.
  const rowSql = `(${placeholders(INSERT_COLS.length)})`;
  const stmts = chunk(rows, INSERT_ROWS_PER_STMT).map((part) =>
    ops
      .prepare(
        `INSERT INTO voice_followups (${INSERT_COLS.join(", ")}) VALUES ${part.map(() => rowSql).join(", ")} ON CONFLICT (kind, ref_id) DO NOTHING`,
      )
      .bind(...part.flat()),
  );
  const ins = await runBatch(ops, stmts);
  if (ins.error) notes.push(`enqueue failed: ${ins.error.message}`);
  else result.queued = ins.data.reduce((n, c) => n + c, 0);
  return result;
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

function designOf(row: Pick<FollowupRow, "kind" | "context">): string | null {
  const ctx = row.context ?? {};
  if (row.kind === "sample") return (ctx.design_title as string) ?? null;
  if (row.kind === "cart") {
    const items = (ctx.items as { design_title?: string | null }[] | undefined) ?? [];
    return items.find((i) => i.design_title)?.design_title ?? null;
  }
  return null;
}

/** The line Vapi speaks the moment they pick up. Discloses the AI in the first
 *  sentence and asks permission before anything else is said. */
export function firstMessageFor(row: Pick<FollowupRow, "kind" | "context" | "name">): string {
  const hi = `Hi ${firstNameOf(row.name) ?? "there"}, this is Zyvorah's AI assistant`;
  const design = designOf(row);
  if (row.kind === "sample") {
    return `${hi}, calling about the ${design ? `${design} ` : ""}sample you ordered. Is this a good time for two minutes?`;
  }
  if (row.kind === "enquiry") {
    return `${hi}, calling about the enquiry you sent us on our website. Is this a good time for two minutes?`;
  }
  return `${hi}. You were looking at ${design ? `our ${design} design` : "a few of our designs"} on the website, and I'm calling to see if I can help with anything. Is this a good time for two minutes?`;
}

function voicemailFor(kind: FollowupKind): string {
  const about =
    kind === "sample" ? "the design sample you ordered" : kind === "enquiry" ? "the enquiry you sent us" : "your visit to our website";
  return `Hi, this is Zyvorah's AI assistant, calling about ${about}. No need to call back. If you would like any help, just WhatsApp us on ${WHATSAPP_SPOKEN}. Thank you.`;
}

/** What Vapi extracts from the transcript after the call; /api/webhooks/vapi
 *  stores it as voice_followups.outcome. */
export const OUTCOME_SCHEMA = {
  type: "object",
  properties: {
    interested: { type: "boolean", description: "The customer showed genuine interest in buying or getting a quote." },
    room: { type: "string", description: "The room or space the wall is in, if mentioned." },
    wall_width_ft: { type: "number", description: "Wall width in feet, converted if given in other units." },
    wall_height_ft: { type: "number", description: "Wall height in feet, converted if given in other units." },
    timeline: { type: "string", description: "When they want it done, in their words." },
    wants_quote: { type: "boolean", description: "They asked for, or accepted, a price or formal quote." },
    wants_designer_call: { type: "boolean", description: "They asked for, or accepted, a call from a designer." },
    preferred_callback: { type: "string", description: "When or how they prefer to be contacted next." },
    opted_out: { type: "boolean", description: "They asked not to be called again, or to be removed." },
    notes: { type: "string", description: "Anything else the team should know, one or two sentences." },
  },
} as const;

/**
 * The transient assistant for ONE call. Built in code rather than saved in the
 * Vapi dashboard so every field is reviewed in a diff, and so the custom-LLM
 * url can carry this row's id (&f=) — the brain needs to know who it rang.
 *
 * Field names checked against Vapi's API as of mid-2026 from memory, not from
 * a live call; see docs/voice-followup-agent.md "Unverified" for the ones that
 * a 400 from POST /call would point at first.
 */
export function buildAssistant(row: FollowupRow, secret: string) {
  return {
    name: "Zyvorah follow-up",
    firstMessage: firstMessageFor(row),
    model: {
      provider: "custom-llm",
      url: `${SITE_URL}/api/voice/followup?k=${encodeURIComponent(secret)}&f=${row.id}`,
      model: "zyvorah-followup",
    },
    transcriber: vapiTranscriber(),
    voice: vapiVoice(),
    // Same reasons as the inbound assistant (scripts/vapi-setup.ts): clean the
    // caller's audio, and let a person finish a thought before we answer.
    backgroundDenoisingEnabled: true,
    startSpeakingPlan: { waitSeconds: 0.8 },
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: MAX_CALL_SECONDS,
    // The brain closes every call with FOLLOWUP_GOODBYE ("Thank you,
    // goodbye.") and is told never to say "goodbye" otherwise. A custom LLM
    // cannot hang up by itself; this is how the call ends when it should.
    endCallPhrases: ["goodbye"],
    voicemailDetection: { provider: "vapi" },
    voicemailMessage: voicemailFor(row.kind),
    // End-of-call report and status updates. The secret rides as a header so
    // the webhook can refuse anyone else (x-vapi-secret, constant-time).
    server: {
      url: `${SITE_URL}/api/webhooks/vapi`,
      headers: { "x-vapi-secret": secret },
    },
    serverMessages: ["end-of-call-report", "status-update"],
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: "system",
            content:
              "You summarise an outbound follow-up call from Zyvorah, an Indian mural wallpaper design house, for the founder. In two to four plain sentences: did they answer and engage, what they think and need (room, wall size, timeline, budget), any objection, and the exact next step promised. No preamble.",
          },
          {
            role: "user",
            content: "Here is the transcript:\n\n{{transcript}}\n\nHere is the ended reason of the call:\n\n{{endedReason}}\n\n",
          },
        ],
      },
      structuredDataPlan: { enabled: true, schema: OUTCOME_SCHEMA },
    },
    // Second route back to the row if the end-of-call report beats our write
    // of vapi_call_id (a call that fails instantly can).
    metadata: { followupId: row.id },
  };
}

/** Remove the shared secret from anything we store or log. Vapi's error
 *  bodies can echo request fields; the secret is in two of them. */
function scrub(s: string, secret: string): string {
  if (!secret) return s;
  return s.split(secret).join("***").split(encodeURIComponent(secret)).join("***");
}

/**
 * Dial one claimed row. Returns the Vapi call id, or an error string that is
 * safe to store (secret scrubbed). Never throws.
 */
export async function placeCall(row: FollowupRow): Promise<{ ok: true; callId: string } | { ok: false; error: string }> {
  const apiKey = process.env.VAPI_API_KEY ?? "";
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID ?? "";
  const secret = process.env.VOICE_LLM_SECRET ?? "";
  if (!apiKey || !phoneNumberId || !secret) return { ok: false, error: "vapi not configured" };
  const name = firstNameOf(row.name);
  try {
    const res = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        phoneNumberId,
        customer: { number: row.phone, ...(name ? { name } : {}) },
        assistant: buildAssistant(row, secret),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: scrub(`vapi ${res.status}: ${text.slice(0, 400)}`, secret) };
    let id: unknown = null;
    try {
      id = (JSON.parse(text) as { id?: unknown }).id;
    } catch {
      /* handled below */
    }
    return typeof id === "string" && id ? { ok: true, callId: id } : { ok: false, error: "vapi returned no call id" };
  } catch (e) {
    return { ok: false, error: scrub(`vapi request failed: ${(e as Error)?.message ?? String(e)}`, secret) };
  }
}

export type DialResult = { placed: number; skipped: number; failed: number; expired: number; stuck: number; outsideWindow: boolean; notes: string[] };

/**
 * Housekeeping, then at most MAX_CALLS_PER_RUN dials of due rows. Every
 * guarantee in the header is enforced here, per row, immediately before the
 * POST — nothing relies on the enqueue having been right.
 */
export async function placeDueCalls(ops: D1Database, now: Date = new Date()): Promise<DialResult> {
  const r: DialResult = { placed: 0, skipped: 0, failed: 0, expired: 0, stuck: 0, outsideWindow: false, notes: [] };
  const stamp = () => new Date().toISOString();

  // A call with no end-of-call report after three hours: record it, never redial.
  const stuck = await runWrite(
    ops
      .prepare("UPDATE voice_followups SET status = 'failed', ended_reason = ?, updated_at = ? WHERE status = 'calling' AND last_attempt_at < ?")
      .bind("no end-of-call report received", stamp(), hoursAgo(now, STUCK_CALLING_H)),
  );
  r.stuck = stuck.data ?? 0;

  const expired = await runWrite(
    ops
      .prepare("UPDATE voice_followups SET status = 'skipped', ended_reason = ?, updated_at = ? WHERE status = 'queued' AND created_at < ?")
      .bind("expired before a calling window", stamp(), hoursAgo(now, EXPIRE_AFTER_H)),
  );
  r.expired = expired.data ?? 0;

  if (!inCallingWindow(now)) {
    r.outsideWindow = true;
    return r;
  }

  const due = await allRows(
    ops
      .prepare("SELECT * FROM voice_followups WHERE status = 'queued' AND due_at <= ? AND attempts < ? ORDER BY due_at ASC LIMIT ?")
      .bind(now.toISOString(), MAX_ATTEMPTS, MAX_CALLS_PER_RUN),
  );
  if (due.error) {
    r.notes.push(`due read failed: ${due.error.message}`);
    return r;
  }

  const since = hoursAgo(now, COOLDOWN_DAYS * 24);
  for (const row of due.data.map(toFollowupRow)) {
    // The window is re-read per call: a slow run must not spill past 19:30.
    if (!inCallingWindow(new Date())) {
      r.outsideWindow = true;
      break;
    }
    const skip = async (why: string) => {
      await runWrite(
        ops
          .prepare("UPDATE voice_followups SET status = 'skipped', ended_reason = ?, updated_at = ? WHERE id = ? AND status = 'queued'")
          .bind(why, stamp(), row.id),
      );
      r.skipped++;
    };

    if (!E164_IN_MOBILE.test(row.phone)) {
      await skip("not an Indian mobile");
      continue;
    }
    const opt = await firstRow(ops.prepare("SELECT phone FROM voice_optout WHERE phone = ?").bind(row.phone));
    if (opt.error) {
      // Fail closed on the do-not-call list.
      r.notes.push(`opt-out check failed: ${opt.error.message}`);
      break;
    }
    if (opt.data) {
      await skip("opted out before the call");
      continue;
    }
    const other = await firstRow(
      ops
        .prepare("SELECT id FROM voice_followups WHERE phone = ? AND id != ? AND last_attempt_at >= ? LIMIT 1")
        .bind(row.phone, row.id, since),
    );
    if (other.error) {
      r.notes.push(`cooldown check failed: ${other.error.message}`);
      break;
    }
    if (other.data) {
      await skip(`number already called in the last ${COOLDOWN_DAYS} days`);
      continue;
    }

    // THE CLAIM. Matches only while this row is still queued at the attempt
    // count we read — an overlapping run, or a webhook that re-queued it, makes
    // this update change nothing, and nothing is dialled. Exactly one changed
    // row is the only answer that dials; an error or 0 does not.
    const t = stamp();
    const claim = await runWrite(
      ops
        .prepare(
          "UPDATE voice_followups SET status = 'calling', attempts = attempts + 1, last_attempt_at = ?, updated_at = ? WHERE id = ? AND status = 'queued' AND attempts = ?",
        )
        .bind(t, t, row.id, row.attempts),
    );
    if (claim.error || claim.data !== 1) continue;

    const call = await placeCall(row);
    if (call.ok) {
      const { error } = await runWrite(
        ops.prepare("UPDATE voice_followups SET vapi_call_id = ?, updated_at = ? WHERE id = ?").bind(call.callId, stamp(), row.id),
      );
      // The webhook can still find the row by metadata.followupId.
      if (error) r.notes.push(`call ${row.id} placed but id not stored: ${error.message}`);
      r.placed++;
    } else {
      // Not retried: a 5xx that in fact placed the call must not become two.
      await runWrite(
        ops
          .prepare("UPDATE voice_followups SET status = 'failed', ended_reason = ?, updated_at = ? WHERE id = ? AND status = 'calling'")
          .bind(call.error.slice(0, 500), stamp(), row.id),
      );
      r.failed++;
      r.notes.push(`${row.id}: ${call.error.slice(0, 200)}`);
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// The brain's view of a row (/api/voice/followup)
// ---------------------------------------------------------------------------

/** Look a call's row up for the custom-LLM endpoint: by the &f= id we put in
 *  its url, or by Vapi's call id. Null when neither finds a live row. */
export async function loadFollowupContext(
  followupId: string | null,
  vapiCallId: string | null,
): Promise<{ ctx: FollowupCallContext; status: string } | null> {
  const ops = await opsDb();
  if (!ops) return null;
  let row: FollowupRow | null = null;
  if (followupId && UUID.test(followupId)) {
    const { data } = await firstRow(ops.prepare(byIdSql).bind(followupId));
    row = data ? toFollowupRow(data) : null;
  }
  if (!row && vapiCallId) {
    const { data } = await firstRow(ops.prepare(byCallIdSql).bind(vapiCallId));
    row = data ? toFollowupRow(data) : null;
  }
  if (!row) return null;
  return {
    status: row.status,
    ctx: {
      kind: row.kind,
      firstName: firstNameOf(row.name),
      details: row.context ?? {},
      attempt: Math.max(1, row.attempts),
    },
  };
}

// ---------------------------------------------------------------------------
// End of call (/api/webhooks/vapi)
// ---------------------------------------------------------------------------

export type CallOutcome = {
  interested?: boolean;
  room?: string;
  wall_width_ft?: number;
  wall_height_ft?: number;
  timeline?: string;
  wants_quote?: boolean;
  wants_designer_call?: boolean;
  preferred_callback?: string;
  opted_out?: boolean;
  notes?: string;
};

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

const NO_ANSWER = /did-not-answer|no-answer|not-answered|busy|voicemail/i;
const CALL_FAILED = /error|failed|fault|could-not|invalid|unavailable|insufficient|exceeded-concurrency/i;

/** Vapi's endedReason → our status. Exported for the brief and for tests. */
export function classifyEnded(reason: string | null | undefined): "done" | "no_answer" | "failed" {
  const r = String(reason ?? "");
  if (NO_ANSWER.test(r)) return "no_answer";
  if (CALL_FAILED.test(r)) return "failed";
  return "done";
}

export const isHotLead = (o: CallOutcome | null | undefined) =>
  !!o && !o.opted_out && (o.interested === true || o.wants_quote === true || o.wants_designer_call === true);

export type EndOfCall = {
  row: FollowupRow;
  status: string;
  outcome: CallOutcome | null;
  summary: string | null;
  recordingUrl: string | null;
};

type VapiMessage = {
  type?: string;
  endedReason?: string;
  call?: { id?: string; endedReason?: string; metadata?: { followupId?: string }; assistant?: { metadata?: { followupId?: string } } };
  assistant?: { metadata?: { followupId?: string } };
  metadata?: { followupId?: string };
  analysis?: { summary?: string; structuredData?: unknown };
  artifact?: { transcript?: string; recordingUrl?: string; recording?: { mono?: { combinedUrl?: string } } };
  summary?: string;
  transcript?: string;
  recordingUrl?: string;
};

/**
 * Write an end-of-call report onto its row. Only a row still 'calling' is
 * touched, so a report Vapi retries is a no-op and the hot-lead mail cannot go
 * out twice. Returns null when there is nothing (new) to act on.
 */
export async function recordEndOfCall(msg: VapiMessage, now: Date = new Date()): Promise<EndOfCall | null> {
  const ops = await opsDb();
  if (!ops) return null;

  const callId = typeof msg.call?.id === "string" ? msg.call.id : null;
  const followupId =
    msg.call?.assistant?.metadata?.followupId ??
    msg.assistant?.metadata?.followupId ??
    msg.call?.metadata?.followupId ??
    msg.metadata?.followupId ??
    null;

  let row: FollowupRow | null = null;
  if (callId) {
    const { data } = await firstRow(ops.prepare(byCallIdSql).bind(callId));
    row = data ? toFollowupRow(data) : null;
  }
  if (!row && followupId && UUID.test(followupId)) {
    const { data } = await firstRow(ops.prepare(byIdSql).bind(followupId));
    row = data ? toFollowupRow(data) : null;
  }
  if (!row || row.status !== "calling") return null;

  const raw = msg.analysis?.structuredData;
  const outcome = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as CallOutcome) : null;
  // Strings or null only: these are bound into D1, which refuses an object,
  // and the body is Vapi's JSON, not a type we control.
  const endedReason = str(msg.endedReason) ?? str(msg.call?.endedReason);
  const summary = str(msg.analysis?.summary) ?? str(msg.summary);
  const transcript = str(msg.artifact?.transcript) ?? str(msg.transcript);
  const recordingUrl = str(msg.artifact?.recordingUrl) ?? str(msg.recordingUrl) ?? str(msg.artifact?.recording?.mono?.combinedUrl);

  const cls = classifyEnded(endedReason);
  let status: string = cls;
  let dueAt: string | undefined;
  if (outcome?.opted_out === true) status = "opted_out";
  else if (cls === "no_answer" && row.attempts < MAX_ATTEMPTS) {
    // Back in the queue for one more try, no sooner than RETRY_AFTER_HOURS.
    status = "queued";
    dueAt = new Date(now.getTime() + RETRY_AFTER_HOURS * 3_600_000).toISOString();
  }

  // One transaction: the row's result and, for an opt-out, the do-not-call
  // entry land together or not at all. Only a row still 'calling' is written;
  // the opt-out is inserted FROM that row only if the update just made it
  // 'opted_out' at this exact updated_at, so a retried or late report (the
  // row already moved on) writes nothing here, as before.
  const stampNow = now.toISOString();
  const stmts = [
    ops
      .prepare(
        `UPDATE voice_followups
            SET status = ?, due_at = COALESCE(?, due_at), vapi_call_id = ?, outcome = ?, summary = ?,
                transcript = ?, recording_url = ?, ended_reason = ?, updated_at = ?
          WHERE id = ? AND status = 'calling'`,
      )
      .bind(
        status,
        dueAt ?? null,
        row.vapi_call_id ?? callId,
        outcome ? JSON.stringify(outcome) : null,
        summary,
        transcript ? transcript.slice(0, 20_000) : null,
        recordingUrl,
        endedReason,
        stampNow,
        row.id,
      ),
  ];
  if (status === "opted_out") {
    stmts.push(
      ops
        .prepare(
          `INSERT INTO voice_optout (phone, created_at, source)
             SELECT phone, ?, 'ai-call' FROM voice_followups WHERE id = ? AND status = 'opted_out' AND updated_at = ?
           ON CONFLICT (phone) DO NOTHING`,
        )
        .bind(stampNow, row.id, stampNow),
    );
  }
  const upd = await runBatch(ops, stmts);
  if (upd.error || upd.data[0] !== 1) return null;

  return { row, status, outcome, summary, recordingUrl };
}

// ---------------------------------------------------------------------------
// The morning brief
// ---------------------------------------------------------------------------

export type Last24h = { placed: number; answered: number; noAnswer: number; failed: number; optOuts: number; hot: { name: string | null; kind: string; room: string | null; summary: string | null }[]; queued: number };

export async function last24h(ops: D1Database, now: Date = new Date()): Promise<Last24h | null> {
  const { data, error } = await allRows<{
    name: string | null;
    kind: string;
    status: string;
    outcome: string | null;
    ended_reason: string | null;
    summary: string | null;
  }>(
    ops
      .prepare("SELECT name, kind, status, outcome, ended_reason, summary FROM voice_followups WHERE last_attempt_at >= ? LIMIT 500")
      .bind(hoursAgo(now, 24)),
  );
  if (error) return null;
  const q = await firstRow<{ n: number }>(ops.prepare("SELECT COUNT(*) AS n FROM voice_followups WHERE status = 'queued'"));
  const out: Last24h = { placed: 0, answered: 0, noAnswer: 0, failed: 0, optOuts: 0, hot: [], queued: Number(q.data?.n ?? 0) };
  for (const r of data) {
    out.placed++;
    const cls = r.ended_reason ? classifyEnded(r.ended_reason) : null;
    if (r.status === "opted_out") out.optOuts++;
    if (r.status === "failed") out.failed++;
    else if (cls === "no_answer") out.noAnswer++;
    else if (r.status === "done" || r.status === "opted_out") out.answered++;
    const o = parseJsonObject(r.outcome) as CallOutcome | null;
    if (isHotLead(o)) out.hot.push({ name: r.name, kind: r.kind, room: o?.room ?? null, summary: r.summary });
  }
  return out;
}

