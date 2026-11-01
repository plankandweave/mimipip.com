/**
 * The morning brief's rules — which agents are expected, how fresh a section
 * must be, and what counts as missing.
 *
 * Deliberately free of any database import so it can be unit-tested directly.
 * `briefing.ts` holds the reads and writes and re-exports everything here; the
 * repo already splits this way for the marketing digest (digest-web.ts) and the
 * approval rules (approval.ts), for the same reason.
 *
 * THE HONESTY PROPERTY, which `classifySections` exists to guarantee:
 * a section that was never filed, or was filed for an older day, or has aged
 * past its own freshness window, is REPORTED as missing with a plain-English
 * reason. It is never silently dropped. Before this brief existed each agent
 * sent its own mail, so a dead agent announced itself by the mail not arriving.
 * Folding them into one brief removes that signal, and this file is what
 * replaces it.
 */

import { addIstDays } from "@/lib/ist";
import type { MailDeliveryEvidence } from "@/lib/brief-claim-proof";
import { presentBriefProse } from "@/lib/brief-presentation";

const previousDay = (dateKey: string) => addIstDays(dateKey, -1);
const CLOCK_SKEW_MS = 120_000;
const CLOCK_SKEW_H = CLOCK_SKEW_MS / 3_600_000;

export type BriefStatus = "green" | "amber" | "red" | "info";

/** Who may file a section, and where it sits in the brief.
 *
 *  `rank` is the print order. It is deliberately not alphabetical and not
 *  chronological: it is the order a founder needs to read things in. What broke
 *  comes before what it cost, which comes before what the market did.
 *
 *  `staleAfterHours` is each agent's own promise about its freshness. The
 *  patrol runs nightly and must be no more than ~30h old to be worth printing.
 *  The CRM sweep can lag a day without being useless. An agent that misses its
 *  window is reported missing rather than printed stale — a two-day-old ad
 *  number read as today's is worse than no number. */
export const BRIEF_SECTIONS = {
  "customer-service": { title: "Zyvorah — Requires your decision", rank: 15, staleAfterHours: 30 },
  "night-patrol": { title: "Overnight patrol", rank: 10, staleAfterHours: 30 },
  "day-watch": { title: "Yesterday's afternoon watch", rank: 20, staleAfterHours: 30 },
  "store-db": { title: "Database health and cost", rank: 30, staleAfterHours: 30 },
  "google-ads": { title: "Google Ads — what the agent did", rank: 60, staleAfterHours: 30 },
  crm: { title: "Customers and conversations", rank: 70, staleAfterHours: 54 },
  // Filed hourly by the voice-followups cron, so it is always fresh; 30h means
  // a dead cron shows as missing by the next morning rather than printing
  // yesterday's calls as today's. Sits after CRM: these are the same customers.
  // Filed by the brief's own 08:00 cron just before it reads the store
  // (lib/homelane-brief.ts), so it is always fresh; 30h still catches a day
  // the filing itself failed. After CRM: these are customers too — HomeLane
  // trained its designers on the portal on 30 September 2026 and the rollout
  // is watched here, designer by designer.
  "homelane-portal": { title: "HomeLane portal — designer logins", rank: 72, staleAfterHours: 30 },
  "call-followups": { title: "AI follow-up calls", rank: 75, staleAfterHours: 30 },
  // Filed by instagram-daily (08:00 and 14:00 IST): what each of the next four
  // days has out, approved, waiting on the founder, or held — and what is
  // still missing. Early in the brief: a silent Instagram day went unnoticed
  // for six days in October 2026 while every cron reported ok.
  "instagram-cadence": { title: "Instagram — today and the next three days", rank: 12, staleAfterHours: 30 },
  // Filed by portfolio-attention (08:00 and 14:00 IST): every campus
  // Blueprint's Pulse — walls ready, what the college still owes, and the
  // day a project is ready for Prism. After the Instagram picture, before
  // the overnight patrol: it is work for her when a campus turns ready.
  "campus-pulse": { title: "Campus projects — Pulse", rank: 14, staleAfterHours: 30 },
} as const;

export type BriefKey = keyof typeof BRIEF_SECTIONS;

export function isBriefKey(v: string): v is BriefKey {
  return Object.prototype.hasOwnProperty.call(BRIEF_SECTIONS, v);
}

export type BriefSection = {
  key: BriefKey;
  title: string;
  rank: number;
  status: BriefStatus;
  headline: string | null;
  bodyHtml: string | null;
  source: string | null;
  filedFor: string;
  updatedAt: string;
  observedAt: string | null;
};

/** A section the brief expected and did not get, with the reason in words the
 *  founder can act on. */
export type MissingSection = {
  key: BriefKey;
  title: string;
  rank: number;
  reason: string;
  /** A filed report held for evidence is different from an absent producer. */
  state?: "evidence-held";
};

export type SectionFiling = {
  key: BriefKey;
  status: BriefStatus;
  headline?: string | null;
  bodyHtml?: string | null;
  source?: string | null;
  /** The IST day the agent RAN. Every agent files for its own run day and
   *  nothing else — no agent has to reason about which brief will carry it.
   *  The brief accepts its own day and the day before (see `readSections`), so
   *  an afternoon watch on the 24th is carried by the 25th's brief. Freshness
   *  is enforced in hours, not by this date. Default: today IST. */
  filedFor?: string;
  /** Account/database observation time, independent of when prose was filed. */
  observedAt?: string;
  /** Exact message-read metadata; neither prose nor elapsed schedules qualify. */
  mailDeliveries?: MailDeliveryEvidence[];
};

/** A row as it comes back from the section store. Loose on purpose: this is the
 *  boundary with PostgREST, which hands back `any`-shaped JSON. */
export type RawSectionRow = {
  key?: unknown;
  title?: unknown;
  rank?: unknown;
  status?: unknown;
  headline?: unknown;
  body_html?: unknown;
  source?: unknown;
  filed_for?: unknown;
  stale_after_hours?: unknown;
  updated_at?: unknown;
};

/** Preserve observation provenance in the existing source column: no schema change.
 * Legacy prose-only sources are deliberately unverified for spend/DB advice. */
export function filingSource(source: string | null | undefined, observedAt?: string, mailDeliveries?: MailDeliveryEvidence[]): string | null {
  if (!observedAt && !mailDeliveries) return source ?? null;
  let existing: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(source ?? "null");
    if (parsed?.kind === "brief-evidence-v1") existing = parsed;
  } catch { /* Plain producer name; never infer evidence from it. */ }
  return JSON.stringify({
    kind: "brief-evidence-v1", source: source ?? null, ...existing,
    ...(observedAt ? { observedAt } : {}),
    ...(mailDeliveries ? { mailDeliveries } : {}),
  });
}

export function readFilingSource(raw: unknown): { source: string | null; observedAt: string | null } {
  const text = raw ? String(raw) : null;
  try {
    const value = JSON.parse(text ?? "null");
    if (value?.kind === "brief-evidence-v1") return {
      source: typeof value.source === "string" ? value.source : null,
      observedAt: typeof value.observedAt === "string" ? value.observedAt : null,
    };
  } catch { /* legacy plain source */ }
  return { source: text, observedAt: null };
}

/**
 * The honesty rule, as a pure function so it can be tested without a database.
 *
 * Every expected agent ends up in exactly one of the two lists. Nothing can
 * fall out of both — that is the whole point, and it is what the tests pin.
 */
export function classifySections(
  rows: RawSectionRow[],
  briefFor: string,
  now: Date,
): { sections: BriefSection[]; missing: MissingSection[] } {
  const expected = Object.entries(BRIEF_SECTIONS) as [BriefKey, (typeof BRIEF_SECTIONS)[BriefKey]][];
  const byKey = new Map(rows.map((r) => [String(r.key), r]));
  const sections: BriefSection[] = [];
  const missing: MissingSection[] = [];

  for (const [key, meta] of expected) {
    const row = byKey.get(key);
    if (!row) {
      missing.push({ key, title: meta.title, rank: meta.rank, reason: "has never filed a section" });
      continue;
    }

    const filedFor = String(row.filed_for ?? "");
    // A stored override may tighten freshness, never extend the contract.
    const requestedLimit = Number(row.stale_after_hours);
    const limit = requestedLimit > 0 ? Math.min(requestedLimit, meta.staleAfterHours) : meta.staleAfterHours;
    const stamp = Date.parse(String(row.updated_at ?? ""));
    const ageH = Number.isFinite(stamp) ? (now.getTime() - stamp) / 3_600_000 : Infinity;

    if (filedFor !== briefFor && filedFor !== previousDay(briefFor)) {
      missing.push({
        key,
        title: meta.title,
        rank: meta.rank,
        reason: filedFor ? `last reported on ${filedFor} — nothing since` : "filed without a date",
      });
      continue;
    }
    if (ageH < 0 || ageH > limit) {
      missing.push({
        key,
        title: meta.title,
        rank: meta.rank,
        reason: ageH < 0 ? "filed with a future timestamp" : Number.isFinite(ageH)
          ? `last filed ${Math.round(ageH)} hours ago, past its ${limit}-hour freshness`
          : "filed without a readable timestamp",
      });
      continue;
    }
    if (!row.body_html && !row.headline) {
      missing.push({ key, title: meta.title, rank: meta.rank, reason: "filed an empty section" });
      continue;
    }

    const provenance = readFilingSource(row.source);
    if (key === "google-ads" || key === "store-db") {
      const observed = Date.parse(provenance.observedAt ?? "");
      const observedAge = (now.getTime() - observed) / 3_600_000;
      // Two minutes of clock skew between the producer and the database is
      // not a check "after filing": the filing gate (migration
      // 20261009090000) stamps updated_at with the database's clock, and a
      // Mac agent's clock can run a few seconds ahead of it.
      if (!Number.isFinite(observed) || observedAge < -CLOCK_SKEW_H || observedAge > limit || observed > stamp + CLOCK_SKEW_MS) {
        missing.push({ key, title: meta.title, rank: meta.rank,
          state: "evidence-held",
          reason: "account evidence has no valid recent observation timestamp; filing time does not verify current recommendations" });
        continue;
      }
    }

    const presentation = presentBriefProse({ key,
      headline: row.headline ? String(row.headline) : null,
      bodyHtml: row.body_html ? String(row.body_html) : null,
      source: row.source, cutoff: new Date(stamp) });

    sections.push({
      key,
      title: String(row.title || meta.title),
      rank: Number(row.rank ?? meta.rank),
      status: presentation.held && row.status !== "red" ? "amber" : (["green", "amber", "red", "info"] as const).includes(row.status as BriefStatus)
        ? (row.status as BriefStatus)
        : "info",
      headline: presentation.headline,
      bodyHtml: presentation.bodyHtml,
      source: provenance.source,
      observedAt: provenance.observedAt,
      filedFor,
      updatedAt: String(row.updated_at ?? ""),
    });
  }

  sections.sort((a, b) => a.rank - b.rank);
  missing.sort((a, b) => a.rank - b.rank);
  return { sections, missing };
}

/** The brief's overall colour: the worst thing any agent reported.
 *  `info` sections do not colour the brief — they are context, not verdicts. */
export function worstStatus(sections: BriefSection[], missing: MissingSection[] = []): BriefStatus {
  if (sections.some((s) => s.status === "red")) return "red";
  if (missing.length || sections.some((s) => s.status === "amber")) return "amber";
  if (sections.some((s) => s.status === "green")) return "green";
  return "info";
}
