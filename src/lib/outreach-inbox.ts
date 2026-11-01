import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "./supabase-admin";
import { isAiAccountError } from "./ai-account-error";
import {
  aiAssess,
  assessmentUnavailable,
  recordOutreachAssessment,
  type OutreachChecks,
  type OutreachSubmission,
} from "./outreach";
import { anthropicKeyFor, anthropicKeySource } from "@/lib/ai-keys";

// Collab and press pitches that arrive by EMAIL, not through /collaborate or
// /press. The mailbox sweep (a scheduled task holding the Gmail connection)
// drops each candidate into outreach_email_queue; /api/cron/outreach-inbox
// calls drainOutreachInbox, which turns a queued email into the same
// OutreachSubmission a form would have produced and runs it down the SAME
// path: verification → Claude assessment → outreach_record_check → the
// Collabs tab of the marketing desk.
//
// Before this existed (27 Sep 2026) the desk was form-only while creators
// wrote to hello@ — thirteen pitches unscored, three misfiled as CRM
// companies. See migration 20260927120000_outreach_email_inbox.


const MODEL = "claude-sonnet-5";
/** Each email costs a classification, an Instagram/MX/link check and an
 *  assessment (~20-30s together). The cron runs twice a day (08:00 and
 *  14:00 IST, founder 9 Oct 2026), so a tick takes up to PER_TICK rows and
 *  stops starting new ones once TICK_BUDGET_MS is spent — well inside the
 *  cron worker's five-minute ceiling. What it does not reach waits, queued,
 *  for the next tick. */
const PER_TICK = 20;
const TICK_BUDGET_MS = 200_000;
const MAX_ATTEMPTS = 3;
/** A placeholder assessment is retried on later ticks, one row per tick, this
 *  many times; after that it stays on the desk with its error showing. */
const MAX_REASSESS = 5;

type QueueRow = {
  message_id: string;
  thread_id: string | null;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  body: string;
  sent_at: string | null;
  attempts: number;
};

type Extracted =
  | { pitch: false; reason: string }
  | {
      pitch: true;
      kind: "influencer" | "press" | "artist";
      name: string;
      handle: string | null;
      outlet: string | null;
      links: string[];
      followers_claim: number | null;
      fields: Record<string, string>;
    };

const FOLLOWER_BAND_FOR = (n: number): string =>
  n < 5_000 ? "Under 5k" : n < 25_000 ? "5k–25k" : n < 100_000 ? "25k–100k" : n < 500_000 ? "100k–500k" : "500k+";

const SYSTEM = `You read one email sent to Zyvorah (an Indian mural wallpaper design house) and decide whether it is a NEW inbound pitch from a content creator/influencer, from an artist/designer, or from press/media, then extract its details.

It IS a pitch when a person or small studio proposes a collaboration, paid or gifted partnership, UGC, a room makeover feature, a review, or asks for press material/an interview/a feature. Influencer agencies pitching one named creator count as influencer.

kind "artist": an illustrator, painter, surface/pattern/textile designer or mural artist offering THEIR OWN artwork or design services for a Zyvorah wallpaper/mural — an artist collection, a licensing or royalty deal, a commission, a design collaboration. They are proposing to be a designer for Zyvorah, not to post about it. When a pitch offers both artwork and social posts, the artwork decides: artist.

It is NOT a pitch (reject, and say why in a few words): customer enquiries about buying or pricing a wallpaper, B2B/corporate sales conversations, suppliers, SaaS/platform mail, "pay us to be featured in our magazine/award list" sales mail, recruiters, spam, newsletters, or a reply inside a conversation that is already under way.

Return ONLY JSON, either
{"pitch": false, "reason": "…"}
or
{"pitch": true, "kind": "influencer"|"artist"|"press", "name": "sender's real name", "handle": "INSTAGRAM username without @ — only when the email names an Instagram account (an instagram.com link, or a handle labelled Instagram/IG). A TikTok, YouTube or Twitch handle is NOT an Instagram handle: use null and put it in fields.other_channels", "outlet": "publication name for press; the studio/brand name an artist works under (e.g. \"Kita\"); else null", "links": ["https://…", max 6, only URLs actually in the email"], "followers_claim": number or null, "fields": {"city": "…", "ask": "what they want: gifted/paid/affiliate/feature/licensing/royalty/commission…", "rate": "any fee quoted", "deadline": "press deadline", "other_channels": "TikTok/YouTube/etc. handles or links", "portfolio": "portfolio/Behance/website URL (artists)", "past_clients": "brands they say they have worked with (artists)", "attachments": "names of attached files, e.g. a portfolio PDF"} }
Only include fields keys you actually found. Never invent a handle, link or number.`;

async function extract(row: QueueRow): Promise<Extracted> {
  const anthropic = new Anthropic({ apiKey: anthropicKeyFor("outreach") });
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          from_name: row.from_name,
          from_email: row.from_email,
          subject: row.subject,
          body: row.body.slice(0, 8000),
        }),
      },
    ],
  });
  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  if (!json.pitch) return { pitch: false, reason: String(json.reason ?? "not a pitch").slice(0, 300) };
  const handle = typeof json.handle === "string" ? json.handle.replace(/^@/, "").trim() : "";
  return {
    pitch: true,
    kind: json.kind === "press" ? "press" : json.kind === "artist" ? "artist" : "influencer",
    name: String(json.name || row.from_name || row.from_email.split("@")[0]).slice(0, 200),
    handle: /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null,
    outlet: json.outlet ? String(json.outlet).slice(0, 200) : null,
    links: Array.isArray(json.links)
      ? json.links.map(String).filter((l: string) => /^https?:\/\/\S+$/i.test(l) && l.length <= 300).slice(0, 6)
      : [],
    followers_claim: typeof json.followers_claim === "number" && json.followers_claim >= 0 ? json.followers_claim : null,
    fields:
      json.fields && typeof json.fields === "object"
        ? Object.fromEntries(
            Object.entries(json.fields as Record<string, unknown>)
              .filter(([, v]) => v !== null && v !== "")
              .slice(0, 10)
              .map(([k, v]) => [k.slice(0, 40), String(v).slice(0, 300)]),
          )
        : {},
  };
}

/** Quoted history below the new text is the thread, not the pitch. */
function stripQuoted(body: string): string {
  const cut = body.search(/\n(On .{5,200}wrote:|-{2,} ?Original Message|From: .+\n(Sent|Date): )/i);
  return (cut > 0 ? body.slice(0, cut) : body).trim();
}

async function processOne(row: QueueRow): Promise<{ status: "ingested" | "rejected"; reason?: string; inquiryId?: string }> {
  const admin = supabaseAdmin()!;

  // A reply in a thread we already hold, or a "Re:" from someone already on
  // the desk, is a conversation — the desk row for it already exists.
  if (row.thread_id) {
    const { data } = await admin
      .from("outreach_inquiries")
      .select("reference")
      .eq("source_thread_id", row.thread_id)
      .limit(1);
    if (data?.length) return { status: "rejected", reason: `later message in a thread already on the desk (${data[0].reference})` };
  }
  if (/^\s*re\s*:/i.test(row.subject ?? "")) {
    const { data } = await admin
      .from("outreach_inquiries")
      .select("reference")
      .ilike("email", row.from_email)
      .limit(1);
    if (data?.length) return { status: "rejected", reason: `reply from a sender already on the desk (${data[0].reference})` };
  }

  const x = await extract(row);
  if (!x.pitch) return { status: "rejected", reason: x.reason };

  const fields: Record<string, string> = { ...x.fields };
  if (x.followers_claim !== null) fields.followers = FOLLOWER_BAND_FOR(x.followers_claim);
  const message = stripQuoted(row.body).slice(0, 4000);

  const { data, error } = await admin.rpc("outreach_insert_from_email", {
    p: {
      kind: x.kind,
      name: x.name,
      email: row.from_email,
      handle: x.handle,
      outlet: x.outlet,
      links: x.links,
      fields,
      message,
      message_id: row.message_id,
      thread_id: row.thread_id,
      subject: row.subject,
      sent_at: row.sent_at,
    },
  });
  if (error) throw new Error(`insert failed: ${error.message}`);
  const r = data as { ok?: boolean; error?: string; id?: string; token?: string; reference?: string };
  if (r.error === "duplicate") return { status: "ingested", inquiryId: r.id, reason: `already ${r.reference}` };
  if (r.error === "open") return { status: "rejected", reason: `sender already has an open inquiry (${r.reference})` };
  if (!r.ok) throw new Error(`insert refused: ${r.error}`);

  const sub: OutreachSubmission = {
    id: r.id!,
    token: r.token!,
    reference: r.reference!,
    kind: x.kind,
    name: x.name,
    email: row.from_email,
    handle: x.handle,
    outlet: x.outlet,
    links: x.links,
    fields,
    message,
    origin: { subject: row.subject ?? "", threadId: row.thread_id },
  };

  const assessed = await recordOutreachAssessment(sub);
  // The row exists either way; an unassessed row shows as "Checking…" on the
  // desk rather than vanishing. It is not retried here — a second insert would
  // be a duplicate — so the failure is recorded on the queue row.
  if (!assessed) return { status: "ingested", inquiryId: r.id, reason: "stored, but the assessment failed — review manually" };
  return { status: "ingested", inquiryId: r.id };
}

/**
 * A pitch whose assessment could not run sits on the desk as a placeholder
 * ("consider 50", no real summary, a generic draft). Re-run the assessment on
 * the stored checks for the oldest such row that is still undecided, so a
 * transient failure heals itself instead of waiting for someone to notice.
 */
async function reassessOne(): Promise<"reassessed" | "still-failing" | "none"> {
  const admin = supabaseAdmin()!;
  const { data } = await admin
    .from("outreach_inquiries")
    .select("id, kind, name, email, handle, outlet, links, fields, message, source, source_subject, source_thread_id, checks, ai")
    .eq("status", "checked")
    .order("created_at", { ascending: true })
    .limit(50);
  const row = (data ?? []).find(
    (r) => assessmentUnavailable(r.ai) && ((r.ai as { retries?: number })?.retries ?? 0) < MAX_REASSESS,
  );
  if (!row || !row.checks) return "none";

  const sub: OutreachSubmission = {
    id: row.id,
    token: "",
    reference: "",
    kind: row.kind,
    name: row.name,
    email: row.email,
    handle: row.handle,
    outlet: row.outlet,
    links: row.links ?? [],
    fields: row.fields ?? {},
    message: row.message,
    origin: row.source === "email" ? { subject: row.source_subject ?? "", threadId: row.source_thread_id } : undefined,
  };
  const ai = await aiAssess(sub, row.checks as OutreachChecks);
  const next = ai.unavailable ? { ...ai, retries: ((row.ai as { retries?: number })?.retries ?? 0) + 1 } : ai;
  // Only while still undecided: never rewrite the assessment behind a reply
  // that has already gone out.
  await admin.from("outreach_inquiries").update({ ai: next }).eq("id", row.id).eq("status", "checked");
  return ai.unavailable ? "still-failing" : "reassessed";
}

export async function drainOutreachInbox(): Promise<{
  processed: number;
  ingested: number;
  rejected: number;
  failed: number;
  reassessed?: string;
}> {
  const admin = supabaseAdmin();
  if (!admin) throw new Error("service role not configured");
  if (!anthropicKeyFor("outreach")) throw new Error("ANTHROPIC_API_KEY not configured — cannot classify");

  const { data, error } = await admin
    .from("outreach_email_queue")
    .select("message_id, thread_id, from_name, from_email, subject, body, sent_at, attempts")
    .in("status", ["queued", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    // Oldest mail first, so a backlog is worked through in the order it came.
    .order("sent_at", { ascending: true, nullsFirst: false })
    .limit(PER_TICK);
  if (error) throw new Error(`queue read failed: ${error.message}`);

  const out: Awaited<ReturnType<typeof drainOutreachInbox>> = { processed: 0, ingested: 0, rejected: 0, failed: 0 };
  const deadline = Date.now() + TICK_BUDGET_MS;
  for (const row of (data ?? []) as QueueRow[]) {
    if (Date.now() > deadline) break;
    out.processed++;
    try {
      const res = await processOne(row);
      out[res.status]++;
      await admin
        .from("outreach_email_queue")
        .update({
          status: res.status,
          reason: res.reason ?? null,
          inquiry_id: res.inquiryId ?? null,
          attempts: row.attempts + 1,
          processed_at: new Date().toISOString(),
        })
        .eq("message_id", row.message_id);
    } catch (e) {
      const msg = ((e as Error)?.message ?? String(e)).slice(0, 500);
      if (isAiAccountError(msg)) {
        // Our key or credit, not this email: keep its attempts, record why,
        // and fail the run so cron health shows it (see ai-account-error.ts).
        await admin.from("outreach_email_queue").update({ reason: msg }).eq("message_id", row.message_id);
        throw new Error(`Anthropic account refused the outreach classifier (${anthropicKeySource("outreach")}): ${msg}`);
      }
      out.failed++;
      console.error("[outreach-inbox]", row.message_id, msg);
      await admin
        .from("outreach_email_queue")
        .update({ status: "failed", reason: msg, attempts: row.attempts + 1, processed_at: new Date().toISOString() })
        .eq("message_id", row.message_id);
    }
  }
  // Spare time in this tick goes to healing one placeholder assessment.
  if (out.processed < PER_TICK && Date.now() < deadline) {
    try {
      out.reassessed = await reassessOne();
    } catch (e) {
      console.error("[outreach-inbox] reassess", (e as Error)?.message ?? e);
      out.reassessed = "error";
    }
  }
  return out;
}
