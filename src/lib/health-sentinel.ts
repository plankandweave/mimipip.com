// Health sentinel — is the print engine up, is the Magnitude OS up, and if
// not, has Roheena been told?
//
// 6 Oct 2026: the print engine was down from 01:09 to 02:13 IST. Nothing
// noticed. The OS job that had crashed it kept getting a 502, logged nothing
// and waited ten minutes to try again; the outage ended only because the
// night patrol happened to run at 02:08. At 11:00 on a working day the same
// hour is a factory that cannot print and nobody knowing why.
//
// This runs every ten minutes from the store, which is on Cloudflare — the one
// part of the estate that does not share a platform with the two services it
// watches (both are on Railway). It cannot watch the store itself: a dead
// site cannot report its own death.
//
// No table of its own. The run ledger every cron already writes (cron_runs,
// via withCronRun) is the memory: a tick that finds something down fails with
// "DOWN: engine", and the next tick reads that back.
//
// What reaches her, and when:
//   - down on two ticks running (10+ minutes — a deploy restart is ~1 minute
//     and must not page her): one mail, naming what is down and what stops;
//   - still down every 3 hours after that: one reminder;
//   - back up after a mail went out: one "recovered" mail.

import { isAiAccountError } from "./ai-account-error";

export type Target = {
  key: string;
  name: string;
  url: string;
  /** What stops while this is down, in her words. */
  stops: string;
};

export const TARGETS: Target[] = [
  {
    key: "engine",
    name: "Print engine",
    url: "https://mgi-print-backend-production.up.railway.app/health",
    stops: "No wall can be rendered or sent to the printer, and paid orders wait at the print step.",
  },
  {
    key: "os",
    name: "Magnitude OS",
    url: "https://os.magnitudegroup.in/api/healthz",
    stops: "The desks are unreachable: orders, dispatch, invoices and purchase orders all stop.",
  },
];

/** The only cron_runs rows that are the sentinel's own ticks: 200 when all was
 *  up, 500 when it threw DOWN. Anything else (a 401 from a request without the
 *  secret) never probed anything and must not count as memory. */
export const SENTINEL_TICK_STATUSES = [200, 500];

export const ALERT_AFTER_TICKS = 2;
/** 18 ticks of 10 minutes. */
export const REMIND_EVERY_TICKS = 18;

export type ProbeResult = { key: string; ok: boolean; detail: string };

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;

/** Both health endpoints answer 200 with JSON `{"status":"ok",…}`. A 200 that
 *  is not that (a platform error page, a checkpoint page) is not healthy. */
export function looksHealthy(status: number, body: string): boolean {
  if (status !== 200) return false;
  try {
    return (JSON.parse(body) as { status?: unknown }).status === "ok";
  } catch {
    return false;
  }
}

export async function probe(
  target: Target,
  fetchImpl: FetchLike,
  opts: { tries?: number; gapMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<ProbeResult> {
  const tries = opts.tries ?? 3;
  const gapMs = opts.gapMs ?? 12_000;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let detail = "";
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleep(gapMs);
    try {
      const res = await fetchImpl(target.url, { signal: AbortSignal.timeout(timeoutMs) });
      const body = await res.text();
      if (looksHealthy(res.status, body)) return { key: target.key, ok: true, detail: "200 ok" };
      detail = `answered ${res.status}: ${body.replace(/\s+/g, " ").slice(0, 120)}`;
    } catch (e) {
      detail = `no answer (${(e as Error)?.name === "TimeoutError" ? `nothing in ${timeoutMs / 1000}s` : String((e as Error)?.message ?? e).slice(0, 120)})`;
    }
  }
  return { key: target.key, ok: false, detail };
}

/** The line a failing tick leaves in cron_runs.error, and how it is read back. */
export function downLine(keys: string[]): string {
  return `DOWN: ${[...keys].sort().join(", ")}`;
}
export function parseDownLine(error: string | null | undefined): string[] {
  const m = /^DOWN: (.+)$/.exec((error ?? "").trim());
  return m ? m[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}

export type PastTick = { started_at: string; error: string | null };

export type Decision = {
  /** Down long enough to tell her now, for the first time this incident. */
  alert: { key: string; since: string }[];
  /** Still down; time for the 3-hourly reminder. */
  remind: { key: string; since: string }[];
  /** Back up after she was told it was down. */
  recovered: { key: string; since: string }[];
};

/**
 * `past` is this job's FINISHED ticks, newest first, not including the one
 * running now. Pure, so the paging rules can be tested without a database.
 */
export function decide(nowDown: string[], past: PastTick[], nowIso: string): Decision {
  const d: Decision = { alert: [], remind: [], recovered: [] };
  const keys = new Set([...nowDown, ...parseDownLine(past[0]?.error)]);
  for (const key of keys) {
    // How many ticks in a row, ending with the previous one, had it down.
    let before = 0;
    let since = nowIso;
    for (const t of past) {
      if (!parseDownLine(t.error).includes(key)) break;
      before++;
      since = t.started_at;
    }
    if (nowDown.includes(key)) {
      const streak = before + 1;
      if (streak === ALERT_AFTER_TICKS) d.alert.push({ key, since });
      else if (streak > ALERT_AFTER_TICKS && (streak - ALERT_AFTER_TICKS) % REMIND_EVERY_TICKS === 0) d.remind.push({ key, since });
    } else if (before >= ALERT_AFTER_TICKS) {
      d.recovered.push({ key, since });
    }
  }
  return d;
}

const istTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type Mail = { subject: string; html: string; idempotencyKey: string };

/** The mails a decision calls for. Kept apart from sending so tests can read them. */
export function mailsFor(d: Decision, results: ProbeResult[], nowIso: string): Mail[] {
  const byKey = new Map(TARGETS.map((t) => [t.key, t]));
  const detail = new Map(results.map((r) => [r.key, r.detail]));
  const mails: Mail[] = [];
  for (const kind of ["alert", "remind"] as const) {
    for (const { key, since } of d[kind]) {
      const t = byKey.get(key);
      if (!t) continue;
      mails.push({
        subject: kind === "alert" ? `${t.name} is DOWN — since ${istTime(since)} IST` : `${t.name} is STILL down — since ${istTime(since)} IST`,
        html:
          `<p><strong>${esc(t.name)} has not answered since about ${esc(istTime(since))} IST.</strong></p>` +
          `<p>${esc(t.stops)}</p>` +
          `<p>Last check, ${esc(istTime(nowIso))} IST: ${esc(detail.get(key) ?? "no answer")}.</p>` +
          `<p>It is checked every ten minutes. You will get one mail when it is back, and a reminder every three hours until then.</p>`,
        // One mail per incident per step, however many times a tick is retried.
        idempotencyKey: `sentinel/${key}/${since}/${kind === "alert" ? "down" : `still-${nowIso.slice(0, 13)}`}`,
      });
    }
  }
  for (const { key, since } of d.recovered) {
    const t = byKey.get(key);
    if (!t) continue;
    mails.push({
      subject: `${t.name} is back up`,
      html: `<p><strong>${esc(t.name)} is answering again</strong> (${esc(istTime(nowIso))} IST). It had been down since about ${esc(istTime(since))} IST.</p>`,
      idempotencyKey: `sentinel/${key}/${since}/up`,
    });
  }
  return mails;
}

// ---------------------------------------------------------------------------
// The AI account. 9 October 2026: Anthropic refused the site's key ("invalid
// x-api-key"). Eight outreach-inbox runs failed over two days, the OS's AI
// desks were refused the same way, and every one of those was a cron_runs row
// or a log line that nobody reads at the time. The night patrol found it a day
// late; the day watch a day after that. The sentinel has the run ledger open
// every ten minutes anyway — it reads the last half hour of failed runs and,
// when the account (not the item) is the reason, mails her once a day while
// it lasts. A replaced key stops the mails on its own: no refusals, no mail.

/** How far back a tick looks for refused runs: three ticks, so a job that runs
 *  every half hour is seen by the tick after it fails. */
export const AI_ACCOUNT_WINDOW_MS = 30 * 60 * 1000;

export type FailedRun = { job: string; started_at: string; error: string | null };

/** Failed runs the AI account refused — the key or the credit, never the item.
 *  The sentinel's own DOWN ticks and a died-mid-way row are not that. */
export function aiAccountRefusals(rows: FailedRun[]): FailedRun[] {
  return rows.filter((r) => r.job !== "sentinel" && isAiAccountError(r.error));
}

const istDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** The one mail a day the refusals call for, or null when the account is fine. */
export function aiAccountMail(rows: FailedRun[], nowIso: string): Mail | null {
  const refused = aiAccountRefusals(rows);
  if (!refused.length) return null;
  const errors = refused.map((r) => r.error ?? "").join("\n");
  const noCredit = /credit balance/i.test(errors);
  const what = noCredit ? "has no credit" : "refused the key";
  const jobs = [...new Set(refused.map((r) => r.job))].sort();
  const earliest = refused.map((r) => r.started_at).sort()[0];
  return {
    subject: noCredit
      ? `Anthropic account has no credit — ${jobs.length} website job${jobs.length === 1 ? "" : "s"} stopped`
      : `Anthropic refused the website's AI key — ${jobs.length} job${jobs.length === 1 ? "" : "s"} stopped`,
    html:
      `<p><strong>The Anthropic account ${esc(what)}, so the website's AI steps are failing</strong> (first seen this tick at ${esc(istTime(earliest))} IST).</p>` +
      `<p>Jobs refused in the last half hour: ${jobs.map(esc).join(", ")}. They record the failure and skip the item; nothing is lost, nothing is drafted either.</p>` +
      (noCredit
        ? `<p>What fixes it: top up the Anthropic balance (prepaid — never auto-reload). The jobs pick up on their next run.</p>`
        : `<p>What fixes it: a new API key from console.anthropic.com for the workflow that was refused, set on the <code>zyvorah-store</code> Worker under that workflow's name (<code>ANTHROPIC_KEY_OUTREACH</code>, <code>ANTHROPIC_KEY_QUOTATIONS</code> and so on — the list is in <code>src/lib/ai-keys.ts</code>), or as <code>ANTHROPIC_API_KEY</code> for a workflow that has no key of its own yet.</p>`) +
      `<p>Last refusal: ${esc((refused[0].error ?? "").slice(0, 200))}</p>` +
      `<p>You get this once a day while it lasts, from the ten-minute sentinel.</p>`,
    // Once per IST day however many ticks see it; a new day says it again.
    idempotencyKey: `sentinel/ai-account/${istDay(nowIso)}`,
  };
}
