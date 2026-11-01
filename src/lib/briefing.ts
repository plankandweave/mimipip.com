/**
 * The morning brief's section store.
 *
 * WHY THIS EXISTS
 * Five agents used to mail Roheena separately every day — the Night Patrol at
 * 2 AM, the Ads review at 9, the CRM sweep at 9, the daily traffic report at 8,
 * the Evening Post at 8 PM — each written at a different hour by a different
 * author, none aware of the others. The work was good; the delivery was five
 * inboxes' worth of assembly the founder had to do herself.
 *
 * Now an agent FILES its section here and stops. One cron at 08:00 IST reads
 * whatever has been filed and sends a single brief.
 *
 * THE HONESTY PROPERTY
 * `readSections` never quietly drops anything. A section that was never filed,
 * or was filed for an older day, or has aged past its own `stale_after_hours`,
 * comes back in `missing` with a plain-English reason. The brief prints those.
 * A brief that silently omitted a dead agent's section would read green while
 * the agent was broken — precisely the failure this business has been burned by
 * before.
 *
 * Service-role only: the tables have RLS on with no policies, so anon and
 * authenticated cannot see them even though PostgREST exposes the names.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import { istDateKey } from "@/lib/ist";

export * from "@/lib/briefing-rules";

import {
  BRIEF_SECTIONS,
  classifySections,
  filingSource,
  type BriefKey,
  type BriefSection,
  type MissingSection,
  type SectionFiling,
} from "@/lib/briefing-rules";

/** File (or replace) one agent's current section. Upsert on `key`, so an agent
 *  that runs twice in a day leaves one row, not two, and the brief reads its
 *  latest word. Every filing also appends to `briefing_section_log`, which is
 *  how we can later see that an agent went quiet and for how long. */
export async function fileSection(input: SectionFiling): Promise<{ ok: boolean; error?: string }> {
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "no service-role key configured" };

  const meta = BRIEF_SECTIONS[input.key];
  const filedFor = input.filedFor ?? istDateKey();

  const { error } = await db.from("briefing_sections").upsert(
    {
      key: input.key,
      title: meta.title,
      rank: meta.rank,
      status: input.status,
      headline: input.headline ?? null,
      body_html: input.bodyHtml ?? null,
      source: filingSource(input.source, input.observedAt, input.mailDeliveries),
      filed_for: filedFor,
      stale_after_hours: meta.staleAfterHours,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: error.message };

  // Best-effort history. A failed log line must not fail the filing — losing
  // the audit trail is worse than nothing, but losing the section is worse.
  await db.from("briefing_section_log").insert({
    key: input.key,
    status: input.status,
    headline: input.headline ?? null,
    filed_for: filedFor,
  });

  return { ok: true };
}

/**
 * Read every section for a brief, and say plainly what is absent.
 *
 * `briefFor` is the IST day the brief is SENT. A section counts as present only
 * if all three hold:
 *   - it was filed on `briefFor` or the day before. The day before is allowed
 *     because the afternoon watch legitimately runs after the previous brief
 *     and before this one; anything older is yesterday's news wearing today's
 *     clothes. Freshness is really enforced by the hours test below — this date
 *     test only stops a section jumping a whole brief.
 *   - it is younger than its own `stale_after_hours`,
 *   - it has a body or a headline to print.
 *
 * Anything else lands in `missing` with the reason, and the brief prints that.
 */
export async function readSections(
  briefFor: string,
  now: Date = new Date(),
): Promise<{ sections: BriefSection[]; missing: MissingSection[] }> {
  const db = supabaseAdmin();
  const expected = Object.entries(BRIEF_SECTIONS) as [BriefKey, (typeof BRIEF_SECTIONS)[BriefKey]][];

  if (!db) {
    return {
      sections: [],
      missing: expected.map(([key, m]) => ({
        key,
        title: m.title,
        rank: m.rank,
        reason: "the brief could not reach the database to look for it",
      })),
    };
  }

  const { data, error } = await db
    .from("briefing_sections")
    .select("key,title,rank,status,headline,body_html,source,filed_for,stale_after_hours,updated_at");

  if (error) {
    return {
      sections: [],
      missing: expected.map(([key, m]) => ({
        key,
        title: m.title,
        rank: m.rank,
        reason: `the brief could not read the section store (${error.message})`,
      })),
    };
  }

  return classifySections(data ?? [], briefFor, now);
}

/** Has the brief for this day already gone out? Cloudflare re-fires a failed
 *  scheduled invocation, and a founder reading the same brief twice loses
 *  confidence in all of them. */
export async function alreadySent(briefFor: string): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { data } = await db.from("briefing_sends").select("brief_for").eq("brief_for", briefFor).maybeSingle();
  return Boolean(data);
}

export async function markSent(input: {
  briefFor: string;
  subject: string;
  sections: string[];
  missing: string[];
}): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  await db.from("briefing_sends").upsert(
    {
      brief_for: input.briefFor,
      kind: "morning",
      subject: input.subject,
      sections: input.sections,
      missing: input.missing,
      sent_at: new Date().toISOString(),
    },
    { onConflict: "brief_for" },
  );
}
