import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { prepareQuotation, type PrepareResult } from "./prepare";
import { anthropicKeyFor } from "@/lib/ai-keys";

/**
 * The quotation desk — on demand only since 11 October 2026 (no schedule
 * calls it; see /api/cron/quotation-desk).
 *
 * It reads every
 * thread whose last word was the customer's, asks whether that message asks
 * for a quotation, a price or rates, and for each one that does, has the
 * desk prepare the quotation (or the request for measurements) under a task
 * for Roheena's Send. It sends nothing — see the quotation-desk doc,
 * question 1, for the rules under which it one day may.
 *
 * Idempotent by construction: crm_quotation_candidates excludes a company
 * with a draft or sent quotation newer than the message, and a company with
 * an open "Send quotation" or "Ask … for the measured drawing" task is
 * skipped here. Three a morning is plenty — each is an Opus read of a whole
 * company — and the rest come round tomorrow.
 */

const CLASSIFIER = "claude-sonnet-5";
const PER_RUN = 3;
/** How far back a request may be and still be acted on: the sync records
 *  only the latest message per thread, so a two-day window catches a weekend. */
const WINDOW_HOURS = 60;

const AskSchema = z.object({
  asks_for_quotation: z.boolean().describe("True when the customer's latest message asks Zyvorah for a quotation, a quote, a price, rates, a commercial proposal or costing, for specific walls or a project — in any words. False for a reply that is about something else, a thank-you, a meeting time, a question we have already answered with a quotation, or a message from us."),
  evidence: z.string().describe("One sentence quoting or paraphrasing the ask with its date: 'Priyanka Singh asked for the quotation for the Parel common areas by email on 6 October.' Empty when false."),
});

async function asksForQuotation(c: { company_name: string; subject: string; last_at: string | null; excerpt: string | null }): Promise<z.infer<typeof AskSchema>> {
  const anthropic = new Anthropic({ apiKey: anthropicKeyFor("quotations") });
  const res = await anthropic.messages.parse({
    model: CLASSIFIER,
    max_tokens: 400,
    system: "You read one email thread between Zyvorah (an Indian mural wallpaper design house) and a business customer, newest message first, and say whether the customer's LATEST message asks for a quotation. Be literal about who wrote the latest message: a line tagged as from Roheena is ours, not theirs.",
    messages: [{ role: "user", content: JSON.stringify({ company: c.company_name, subject: c.subject, last_at: c.last_at, thread_excerpt_newest_first: (c.excerpt ?? "").slice(0, 6000) }) }],
    output_config: { format: zodOutputFormat(AskSchema) },
  });
  return res.parsed_output ?? { asks_for_quotation: false, evidence: "" };
}

export type DeskRun = {
  looked_at: number;
  prepared: { company: string; result: PrepareResult }[];
  skipped: { company: string; why: string }[];
};

export async function runQuotationDesk(now = new Date()): Promise<DeskRun> {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("quotation desk: service role not configured");
  if (!anthropicKeyFor("quotations")) throw new Error("quotation desk: ANTHROPIC_API_KEY not set");

  const since = new Date(now.getTime() - WINDOW_HOURS * 3_600_000).toISOString();
  const { data, error } = await sb.rpc("crm_quotation_candidates", { p_since: since });
  if (error) throw new Error(`quotation desk: candidates: ${error.message}`);
  const candidates = (data ?? []) as {
    company_id: string; company_name: string; gmail_thread_id: string; subject: string; last_at: string | null; excerpt: string | null;
  }[];

  const run: DeskRun = { looked_at: candidates.length, prepared: [], skipped: [] };
  const seen = new Set<string>();
  for (const c of candidates) {
    if (run.prepared.length >= PER_RUN) { run.skipped.push({ company: c.company_name, why: "left for tomorrow's run" }); continue; }
    if (seen.has(c.company_id)) continue;
    seen.add(c.company_id);

    const { data: open } = await sb.from("crm_tasks").select("id, title")
      .eq("company_id", c.company_id).is("done_at", null)
      .or("title.ilike.Send quotation%,title.ilike.Ask % for the measured drawing%");
    if (open?.length) { run.skipped.push({ company: c.company_name, why: `already waiting: “${open[0].title}”` }); continue; }

    const ask = await asksForQuotation(c);
    if (!ask.asks_for_quotation) { run.skipped.push({ company: c.company_name, why: "latest message does not ask for a quotation" }); continue; }

    try {
      const result = await prepareQuotation({
        companyId: c.company_id, preparedBy: "desk",
        sourceThreadId: c.gmail_thread_id, evidence: ask.evidence,
      });
      run.prepared.push({ company: c.company_name, result });
    } catch (e) {
      run.skipped.push({ company: c.company_name, why: `could not prepare: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return run;
}
