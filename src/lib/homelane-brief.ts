import "server-only";

/**
 * HomeLane portal — counting designer logins for the morning brief.
 *
 * Called by the 08:00 IST brief itself (api/cron/daily-report) just before it
 * reads the section store, so the section is always filed for the brief that
 * prints it. The reading rules — what counts as signed in, as active, and
 * which colour that earns — are in lib/homelane-brief-rules.ts; this file only
 * gathers the evidence.
 *
 * THE EVIDENCE, and why there are several sources
 * A login leaves different traces depending on when and how it happened:
 *   - an email login consumes a `corporate_login_codes` row (complete history);
 *   - since 1 October 2026 every login, email or SMS, also writes a
 *     `corporate_audit` row with action `session.start` (lib/corporate-auth);
 *   - every login inserts a `corporate_sessions` row — the only trace an SMS
 *     login left before the audit row existed, and gone once they log out.
 * A designer who appears in any of the three on a day signed in that day.
 * "Active" adds the open sessions touched that day (`last_seen_at`), anyone
 * the audit log saw doing something, and anyone who started a project, added
 * a wall option or recorded a decision in the private workspace.
 *
 * Service-role reads: every corporate_* table has RLS on with no policies.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { isStaffEmail } from "@/lib/corporate-auth";
import { fileSection } from "@/lib/briefing";
import { addIstDays, istMidnight } from "@/lib/ist";
import {
  EMPTY_HOMELANE_ACTIVITY,
  HOMELANE_SLUG,
  HOMELANE_TRAINING_DAY,
  homelaneSection,
  type HomelaneActivity,
  type HomelaneMember,
} from "@/lib/homelane-brief-rules";

export * from "@/lib/homelane-brief-rules";

type Row = Record<string, unknown>;

const str = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** [from, to) on parsed instants — PostgREST prints "+00:00" where we print
 *  "Z", so the strings cannot be compared as text. */
function inWindow(v: unknown, fromIso: string, toIso: string): boolean {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) && t >= Date.parse(fromIso) && t < Date.parse(toIso);
}

/** Designer addresses only: distinct, lower-cased, our own staff removed. */
function designers(emails: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const e of emails) {
    const n = str(e);
    if (n && !isStaffEmail(n)) out.add(n);
  }
  return [...out].sort();
}

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? ([] as unknown as T)) as T;
}

/** Everything the rules need, for one IST day. Throws on a failed read so the
 *  caller can file the failure rather than a row of zeros. */
export async function fetchHomelaneActivity(dateKey: string): Promise<HomelaneActivity> {
  const db = supabaseAdmin();
  if (!db) throw new Error("no service-role key configured");

  const from = istMidnight(dateKey).toISOString();
  const to = istMidnight(addIstDays(dateKey, 1)).toISOString();
  const sinceTraining = istMidnight(HOMELANE_TRAINING_DAY).toISOString();

  const account = await db.from("corporate_accounts").select("id")
    .eq("slug", HOMELANE_SLUG).eq("active", true).maybeSingle();
  if (account.error) throw new Error(`corporate_accounts: ${account.error.message}`);
  const id = (account.data as { id?: string } | null)?.id;
  if (!id) return { ...EMPTY_HOMELANE_ACTIVITY, accountFound: false };

  // Read from the earlier of the two starts so one pass serves both the day
  // and the since-training roster. The training was days ago, not months,
  // so this is a few hundred rows at most.
  const earliest = sinceTraining < from ? sinceTraining : from;

  const [codes, audit, sessions, projects, members, options, decisions] = await Promise.all([
    db.from("corporate_login_codes").select("email, consumed_at")
      .eq("account_id", id).gte("consumed_at", earliest).lt("consumed_at", to),
    db.from("corporate_audit").select("actor_email, action, created_at")
      .eq("account_id", id).gte("created_at", earliest).lt("created_at", to),
    // Any session that could have been alive on the day; filtered below.
    db.from("corporate_sessions").select("email, created_at, last_seen_at")
      .eq("account_id", id).gt("expires_at", earliest),
    db.from("partner_private_projects").select("created_by")
      .eq("account_id", id).gte("created_at", from).lt("created_at", to),
    db.from("corporate_members").select("email, name, created_at")
      .eq("account_id", id).eq("active", true).order("created_at", { ascending: true }),
    // Work in the private workspace is recorded here and NOT in the audit
    // log, so it is evidence of use in its own right: on 30 September 2026 a
    // designer started a project on a login from before the training, and
    // the brief read "0 active · 1 project started".
    db.from("partner_private_options").select("created_by")
      .eq("account_id", id).gte("created_at", from).lt("created_at", to),
    db.from("partner_private_decisions").select("actor")
      .eq("account_id", id).gte("created_at", from).lt("created_at", to),
  ]);

  const codeRows = must(codes, "corporate_login_codes") as Row[];
  const auditRows = must(audit, "corporate_audit") as Row[];
  const sessionRows = must(sessions, "corporate_sessions") as Row[];
  const projectRows = must(projects, "partner_private_projects") as Row[];
  const memberRows = must(members, "corporate_members") as Row[];
  const optionRows = must(options, "partner_private_options") as Row[];
  const decisionRows = must(decisions, "partner_private_decisions") as Row[];

  const loginsBetween = (f: string, t: string): string[] =>
    designers([
      ...codeRows.filter((r) => inWindow(r.consumed_at, f, t)).map((r) => String(r.email)),
      ...auditRows.filter((r) => r.action === "session.start" && inWindow(r.created_at, f, t)).map((r) => String(r.actor_email)),
      ...sessionRows.filter((r) => inWindow(r.created_at, f, t)).map((r) => String(r.email)),
    ]);

  const signedIn = loginsBetween(from, to);
  const dayAudit = auditRows.filter((r) => inWindow(r.created_at, from, to));
  const active = designers([
    ...signedIn,
    ...sessionRows.filter((r) => inWindow(r.last_seen_at, from, to)).map((r) => String(r.email)),
    ...dayAudit.map((r) => String(r.actor_email)),
    ...projectRows.map((r) => String(r.created_by)),
    ...optionRows.map((r) => String(r.created_by)),
    ...decisionRows.map((r) => String(r.actor)),
  ]);

  // First-timers: signed in on the day and never seen on the portal before it.
  // The three sources are checked from the beginning of time, not from the
  // training day — a designer who tried the portal in September is not new.
  let firstTime: string[] = [];
  if (signedIn.length) {
    const [priorCodes, priorAudit, priorSessions] = await Promise.all([
      db.from("corporate_login_codes").select("email").eq("account_id", id)
        .in("email", signedIn).not("consumed_at", "is", null).lt("consumed_at", from),
      db.from("corporate_audit").select("actor_email").eq("account_id", id)
        .in("actor_email", signedIn).lt("created_at", from),
      db.from("corporate_sessions").select("email").eq("account_id", id)
        .in("email", signedIn).lt("created_at", from),
    ]);
    const seenBefore = new Set(
      designers([
        ...(must(priorCodes, "corporate_login_codes") as Row[]).map((r) => String(r.email)),
        ...(must(priorAudit, "corporate_audit") as Row[]).map((r) => String(r.actor_email)),
        ...(must(priorSessions, "corporate_sessions") as Row[]).map((r) => String(r.email)),
      ]),
    );
    firstTime = signedIn.filter((e) => !seenBefore.has(e));
  }

  const count = (pred: (action: string) => boolean) =>
    dayAudit.filter((r) => !isStaffEmail(str(r.actor_email)) && pred(String(r.action))).length;

  const memberList: HomelaneMember[] = memberRows
    .map((r) => ({ email: str(r.email), name: r.name ? String(r.name) : null }))
    .filter((m) => m.email && !isStaffEmail(m.email));

  return {
    accountFound: true,
    error: null,
    signedIn,
    firstTime,
    active,
    // Designers' projects only: on the training day our own desk created the
    // demonstration project, and counting it read as "0 active, 1 project".
    projectsCreated: projectRows.filter((r) => !isStaffEmail(str(r.created_by))).length,
    designsUploaded: count((a) => a === "design.upload"),
    ordersPlaced: count((a) => a === "order.place"),
    otherActions: count((a) => a !== "design.upload" && a !== "order.place" && a !== "session.start"),
    members: memberList,
    signedInSinceTraining: loginsBetween(sinceTraining, to),
  };
}

/** Count the day and file the section. A failed count is filed as amber with
 *  the reason — the brief must never print "nobody came" because a query
 *  failed. Never throws. */
export async function fileHomelaneSection(dateKey: string): Promise<{ ok: boolean; error?: string }> {
  let activity: HomelaneActivity;
  try {
    activity = await fetchHomelaneActivity(dateKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[brief] homelane count failed:", msg);
    activity = { ...EMPTY_HOMELANE_ACTIVITY, accountFound: true, error: msg };
  }
  // The count was read from the database just now; that read is the evidence.
  const observedAt = new Date().toISOString();
  return fileSection({
    key: "homelane-portal",
    ...homelaneSection(activity, dateKey),
    source: "the brief's own count (daily-report cron)",
    observedAt,
  });
}
