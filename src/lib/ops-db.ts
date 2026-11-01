import "server-only";
import { serviceAvailable } from "../brand/services";

// The store's own operational tables, in Cloudflare D1 (`zyvorah-ops`, bound
// as OPS_DB in wrangler.jsonc) rather than Supabase.
//
// Why D1: the Supabase project is on the Free plan (~335 of 500 MB on 30 Sep
// 2026) and shared with other apps, so a table that only this Worker reads and
// writes is better kept out of it; and a D1 schema can be applied through the
// Cloudflare API, where nothing in the automation can run SQL on Supabase —
// which is exactly why supabase/migrations/20260930062746_voice_followups.sql
// was never applied and the follow-up caller sat inert. The schema lives in
// d1/zyvorah-ops/ and is applied by hand (`wrangler d1 execute`), never by CI.
//
// Reached through `cloudflare:workers` the way r2-media.ts reaches R2. Off
// workerd (next dev, scripts, tests) opsDb() is null and every caller must
// treat that as "not ready" — the follow-up caller dials nothing without it.
//
// D1 throws where supabase-js returns { error }. The helpers below turn a
// throw back into { data, error } so callers keep the fail-closed shape they
// had, and a D1 fault in a cron tick is a named note, not an unhandled 500.
//
// SQLite, not Postgres: timestamps are ISO-8601 UTC TEXT written only by
// `Date.toISOString()` (always ms + 'Z'), so `<` / `>=` compare them correctly
// as strings — write every timestamp in that one format or comparisons lie.
// JSON columns are TEXT (JSON.stringify in, parseJsonObject out). Every value
// is BOUND, never interpolated; D1 allows at most 100 bound parameters per
// statement (see chunk()).

type D1Meta = { changes?: number };
export type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean; meta?: D1Meta };
export type D1PreparedStatement = {
  bind(...values: D1Value[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
};
export type D1Database = {
  prepare(sql: string): D1PreparedStatement;
  /** Runs the statements in order as one transaction: all land or none do. */
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
};
/** What D1 accepts as a bound value. `undefined` is refused, so map it to null. */
export type D1Value = string | number | null;

type Env = { OPS_DB?: D1Database };

/** The `zyvorah-ops` database, or null off-workerd / when unbound. */
export async function opsDb(): Promise<D1Database | null> {
  if (!serviceAvailable("database")) return null;
  try {
    const mod = (await import(/* @vite-ignore */ "cloudflare:workers")) as { env?: Env };
    return mod.env?.OPS_DB ?? null;
  } catch {
    return null;
  }
}

export type OpsResult<T> = { data: T; error: null } | { data: null; error: { message: string } };

async function attempt<T>(fn: () => Promise<T>): Promise<OpsResult<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

/** Every matching row. */
export const allRows = <T = Record<string, unknown>>(stmt: D1PreparedStatement) =>
  attempt(async () => (await stmt.all<T>()).results ?? []);

/** The first matching row, or null. */
export const firstRow = <T = Record<string, unknown>>(stmt: D1PreparedStatement) => attempt(() => stmt.first<T>());

/** A write; data is the number of rows it changed. */
export const runWrite = (stmt: D1PreparedStatement) => attempt(async () => (await stmt.run()).meta?.changes ?? 0);

/** Several writes as one transaction; data is each statement's changed-row count. */
export const runBatch = (db: D1Database, stmts: D1PreparedStatement[]) =>
  attempt(async () => (stmts.length ? await db.batch(stmts) : []).map((r) => r.meta?.changes ?? 0));

/** Split a list for an `IN (?, ?, …)` so no statement passes D1's 100-parameter cap. */
export function chunk<T>(list: T[], size = 80): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** `?, ?, ?` for n values. */
export const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(", ");

/** A JSON TEXT column back to an object. Anything unparsable or not an object
 *  (an array, a bare string) reads as null rather than throwing mid-call. */
export function parseJsonObject(v: unknown): Record<string, unknown> | null {
  if (v == null) return null;
  if (typeof v === "object") return Array.isArray(v) ? null : (v as Record<string, unknown>);
  if (typeof v !== "string") return null;
  try {
    const o = JSON.parse(v) as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
