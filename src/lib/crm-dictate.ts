import { estimateTemplate, ESTIMATE_HEADING } from "./crm-estimate";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropicKeyFor } from "@/lib/ai-keys";

// Turns one paragraph of dictated speech into the payload crm_capture() takes.
//
// This function READS ONLY. It returns a proposal; the caller shows it to
// Roheena and she presses save, which is what actually calls crm_capture. That
// split is the whole design: a CRM that writes what it thinks it heard becomes
// untrustworthy the first time it mishears a company name, and once you stop
// trusting the list you stop using it. Every write in this system is confirmed
// by a human, including the ones the inbox sweep proposes.
//
// The same parser serves both entry points — the dictation box and the daily
// inbox sweep — because an email thread and a spoken recap are the same problem
// (unstructured account talk in, structured account facts out).

const MODEL = "claude-opus-5";

// One capture = one company. Speech about three companies produces three of
// these; the model splits, we don't.
const CaptureSchema = z.object({
  company: z.string().describe("The company or firm name, tidied to how it would be written on an invoice. Never a person's name."),
  kind: z.enum(["architect", "contractor", "developer", "hotel", "retail", "corporate", "pr", "other"])
    .describe("What kind of business it is. 'other' when genuinely unclear."),
  city: z.string().describe("City, or empty string if not mentioned."),
  contact_name: z.string().describe("The person spoken to. Empty string if no person was named."),
  contact_email: z.string().describe("Their email if stated verbatim, else empty string. Never guess or construct one."),
  contact_phone: z.string().describe("Their phone if stated, else empty string."),
  contact_role: z.string().describe("Their job title if stated, else empty string."),
  deal_title: z.string().describe("Short name for the opportunity, in the words used — e.g. 'Lobby and two floors, Koramangala'. Empty string if this was just a conversation with no project attached."),
  stage: z.enum(["", "new", "qualified", "quoted", "negotiation", "won", "lost"])
    .describe("Explicitly stated deal stage or stage change only. Empty string when not stated, preserving an existing stage; new deals default to new at capture."),
  value_inr: z.string().describe("Actual stated deal/quote value in rupees, digits only, no separators or symbols. Preliminary, approximate, hypothetical and calculated ticket estimates belong only in the note; leave this empty for them. Empty string if no actual value was mentioned. Convert spoken lakhs/crores: '5 lakh' -> '500000'."),
  area_sqft: z.string().describe("Area in square feet, digits only. Empty string if not mentioned."),
  expected_close: z.string().describe("YYYY-MM-DD if a closing or decision date was given, else empty string."),
  kind_of_contact: z.enum(["call", "meeting", "email", "whatsapp", "site-visit", "note"])
    .describe("How the conversation happened."),
  note: z.string().describe("The substance of what was said, rewritten as two or three clean sentences in the third person. Keep specifics — numbers, names, objections, what was promised. Drop filler."),
  tasks: z.array(z.object({
    title: z.string().describe("One thing to do, phrased as an instruction: 'Send the quote', 'Call back after Diwali'."),
    due_on: z.string().describe("YYYY-MM-DD, resolved against today's date. Empty string if no deadline was implied."),
  })).describe("Everything the speaker committed to doing. Empty array if nothing was promised."),
});

const ProposalSchema = z.object({
  captures: z.array(CaptureSchema).describe("One entry per company discussed."),
  unclear: z.array(z.string()).describe("Anything heard but not confidently placed — an ambiguous name, a number without a unit. Shown to the user rather than guessed at."),
});

export type CrmCapture = z.infer<typeof CaptureSchema>;
export type CrmProposal = z.infer<typeof ProposalSchema>;

/**
 * @param text  Raw dictation, or the body of an email thread.
 * @param today ISO date used to resolve "Friday", "next week", "end of month".
 *              Passed in rather than read from the clock so the caller controls
 *              the timezone — the server runs in UTC and Roheena does not.
 */
export async function parseDictation(text: string, today: string): Promise<CrmProposal> {
  const anthropic = new Anthropic({ apiKey: anthropicKeyFor("crm") });

  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: [
      "You turn a wallpaper company founder's account of her day into CRM records.",
      "She sells printed wallpaper and wall art to architects, interior contractors, hotels and corporate offices in India.",
      `Today is ${today}. Resolve every relative date ("Friday", "next week", "after Diwali") against it, and never emit a date in the past.`,
      "",
      "Rules:",
      "- Record only what was said. Never invent an email address, a phone number, a value or a city.",
      "- Indian money words are common: 'lakh' = 100000, 'crore' = 10000000. '4.5 lakhs' is 450000.",
      "- Speech-to-text mangles company names. Write the most plausible real business name, and if you are not confident, add the raw phrase you heard to `unclear`.",
      "- A commitment she makes ('I'll send', 'I need to call') is a task. Something the OTHER side will do is not — that belongs in the note.",
      "- If several companies are discussed, emit one capture each. Never merge two companies into one record.",
      "- Use empty strings, not nulls, for anything absent.",
      "- For every inquiry/project, append a separate note block headed PRELIMINARY TICKET ESTIMATE · INR. Name the opportunity. This is planning only, never a client quote, award or approval.",
      "- If the source gives a usable scope/area AND a rate or an explicit approximate amount, suggest a ticket estimate in this block. Only multiply source-supported area and rate; do not invent coverage or reuse a rate from another lead. Include low/base/high when uncertain, and label every assumption. Keep discrepancies unresolved and show alternatives rather than silently choosing one.",
      "- In that block include area (sq ft), rate (INR/sq ft), source (verbatim reference or supplied recap), estimate date, confidence with reason, exclusions (GST/installation/site work if not confirmed included), and what still needs confirmation. If a source or unit is missing, say so.",
      "- If scope or pricing basis is insufficient, write Status: not yet estimated and explain what is missing. Never use zero or arbitrary predicted numbers. A missing rate is unknown, never 300 by default.",
      "- Never put preliminary/calculated amounts or assumed areas in value_inr or area_sqft. Do not advance a stage because an estimate exists. Preserve actual quoted/order values. The estimate suggestion is reviewed by a human before saving or a material decision.",
    ].join("\n"),
    messages: [{ role: "user", content: text }],
    output_config: { format: zodOutputFormat(ProposalSchema) },
  });

  // parsed_output is null when the model's JSON fails validation. Surfacing
  // that as an error beats returning half a proposal the UI would render as a
  // confident, empty form.
  if (!response.parsed_output) throw new Error("The parser returned nothing usable.");
  return {
    ...response.parsed_output,
    captures: response.parsed_output.captures.map((capture) => ({
      ...capture,
      note: capture.deal_title && !capture.note.includes(ESTIMATE_HEADING)
        ? [capture.note, estimateTemplate(today, capture.deal_title)].filter(Boolean).join("\n\n")
        : capture.note,
    })),
  };
}
