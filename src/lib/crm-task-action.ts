import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropicKeyFor } from "@/lib/ai-keys";

// A CRM task that does itself. "Send Studio Dotbox the company profile" should
// not be a reminder to go and write an email; it should BE the email, sitting
// under the task, written from everything the CRM knows about that company,
// waiting for Roheena to read it and press Send.
//
// This module only writes. It never sends — /api/admin/crm/task-action does
// that, and only when Roheena presses the button. Nothing here can reach a
// customer on its own.
//
// Context comes from crm_task_context (migration 20260928100000): the task,
// the company, its contacts, deals, notes, and — the part that makes a reply a
// REPLY — the email threads the 06:00 inbox sync recorded, with subject line,
// who was copied and the last few messages.

const MODEL = "claude-opus-5-5";

export type CrmTaskContext = {
  task: { id: string; title: string; due_on: string | null; created_at: string };
  company: { id: string; name: string; kind: string; city: string | null; status: string; website: string | null; is_customer: boolean } | null;
  contacts: { name: string; email: string | null; role: string | null; is_primary: boolean }[];
  deals: { title: string; stage: string; value_inr: number | null; area_sqft: number | null; expected_close: string | null }[];
  notes: { kind: string; body: string; happened_at: string; source: string }[];
  threads: {
    gmail_thread_id: string; subject: string; last_message_id: string | null;
    to: { name?: string; email: string }[]; cc: { name?: string; email: string }[];
    last_from: string | null; last_direction: "in" | "out" | null; last_at: string | null; excerpt: string | null;
  }[];
  other_open_tasks: string[];
  presentations: { title: string; status: string }[];
  draft: { draft: TaskDraft; context_hash: string; generated_at: string } | null;
};

const OptionSchema = z.object({
  label: z.string().describe("Two to five words naming this version, e.g. 'Send the profile', 'Counter at a smaller scope', 'Close warmly'."),
  gmail_thread_id: z.string().describe("The gmail_thread_id of the thread this replies in, copied exactly from the context. Empty string only if this is a brand-new conversation."),
  to: z.array(z.string()).describe("Recipient email addresses. Only addresses that appear in the context. Never Roheena's own."),
  cc: z.array(z.string()).describe("Copied addresses — everyone who was on the thread's latest message, minus Roheena's own addresses, unless the recipient asked for a different route."),
  subject: z.string().describe("For a reply: 'Re: ' + the thread subject, with no stacked 'Re: Re:'. For a new email: a short, warm, specific subject."),
  body: z.string().describe("The complete email in plain text: greeting, body paragraphs separated by blank lines, and the sign-off. Placeholders for anything Roheena must supply are written [[like this]]."),
});

const DraftSchema = z.object({
  kind: z.enum(["email", "decision", "conditional", "other"]).describe(
    "email: the task is to write to someone. decision: the task is for Roheena to choose between courses of action. conditional: the task only applies if something has not happened yet (\"if still no reply\", \"if they have not rung\"). other: nothing to send — the work is offline."),
  headline: z.string().describe("One sentence to Roheena, plain English, saying what this draft does. E.g. 'Sends the profile, workplace case study and pricing note to the studio inbox Pratyush named, copying him.'"),
  recommendation: z.string().describe("For a decision: your recommendation in two or three sentences, with the reasoning in business terms and the default you would pick. Empty string for other kinds."),
  status_note: z.string().describe("For a conditional task: what the CRM shows — e.g. 'Last message on this thread was ours, on 14 Sep; no reply is recorded since.' Be honest that this is what the CRM and the 06:00 inbox sync know, not a live look at her inbox. Empty string otherwise."),
  already_resolved: z.boolean().describe("True only when the context shows the condition has already been met (they replied, they called) so no email is needed. Then options must be empty."),
  needs: z.array(z.string()).describe("Things Roheena must supply before this can go, in plain words — each matches a [[placeholder]] in a body. Empty when the email is complete as written."),
  options: z.array(OptionSchema).describe("One email for email and conditional tasks. Two for a decision — one per course of action, recommended first. Empty for 'other' or already_resolved."),
  followup: z.object({
    title: z.string().describe("The follow-up task to create once this is sent, phrased as an instruction, e.g. 'Check Studio Dotbox has what they need'. Empty string if none is sensible."),
    days: z.number().int().describe("How many days after sending the follow-up is due. 0 if none."),
  }),
});

export type TaskDraft = z.infer<typeof DraftSchema>;
export type TaskDraftOption = z.infer<typeof OptionSchema>;

/** Pages that exist (checked live on 28 Sep 2026) and may be linked. The model
 *  is told these are the ONLY links it may use besides ones in the context, so
 *  a customer never receives a 404 from the founder. */
const LINKS = `
- https://www.zyvorah.com — the brand and shop
- https://casestudy.zyvorah.com/projects — the portfolio of concept stories and completed-style work
- https://casestudy.zyvorah.com/projects/hospitality — hospitality case study
- https://casestudy.zyvorah.com/projects/it — workplace / IT-campus case study
- https://casestudy.zyvorah.com/projects/education — education and campus case study
- https://casestudy.zyvorah.com/projects/healthcare — healthcare case study
- https://www.zyvorah.com/office — wallpaper for offices and workplaces
- https://www.zyvorah.com/office-concepts — complete office wall concepts
- https://www.zyvorah.com/commercial — commercial projects
- https://www.zyvorah.com/hospitality — hotels and hospitality
- https://www.zyvorah.com/trade — trade programme for architects and designers
- https://www.zyvorah.com/press — press kit
- https://www.zyvorah.com/our-story — the founder's story`;

const SYSTEM = `You are Roheena Nagpal's writing hand. She is the founder of Zyvorah, an Indian brand of mural wallpaper, murals and wall-curation for homes, offices, hotels, campuses and retail. You turn one CRM task into the email that completes it, written as her, ready for her to read and send from roheena@zyvorah.com.

WHO YOU ARE WRITING TO
Mostly Indian businesspeople — architects, purchase heads, hotel groups, university administrators, marketplace category managers — and occasionally international editors and creators. In Indian business, the relationship IS the deal. People remember how they were made to feel long after the price. A stern, transactional or impatient email can quietly end a conversation, and nobody will tell her why. So:

1. Warmth before the ask. Open by thanking them for something real and specific from the thread (their reply, their help, a correction they made, an introduction). Never open with the ask.
2. Never imply fault. No "as per my last email", "I am still waiting", "you have not", "as I mentioned", "kindly revert at the earliest", "urgent", "ASAP", "reminder" in the subject. A follow-up gives them an easy, face-saving reason for the delay ("I know how full things get at this time of the year") and makes replying effortless.
3. Respect hierarchy and titles. A Chairman, MD, Registrar or senior official is "Dear Mr Baljee" / "Dear Sir" — never a first name unless the thread already uses one. If they wrote "Respected Ma'am, Namaste", match that grace (a warm "Namaste" is welcome when they used it first). When a senior person set something in motion, acknowledge it respectfully ("as Mr Baljee kindly suggested").
4. Never corner anyone. Offer a choice or a softer path ("whenever convenient", "if easier, I am happy to…"). Never set a deadline for THEM. It is fine to say what WE are ready to do and when.
5. Make their job easy. Offer what removes effort from their side — a quick call, a sheet in the format they prefer, answering on their behalf to their own colleagues.
6. When declining, negotiating or closing: praise their work sincerely, put any constraint on our situation (timing, focus, budget this season) — never on their worth — and always leave the door open.
7. Be brief. 70–170 words for the body. One clear ask. Short paragraphs. No bullet walls unless you are re-listing questions they must answer, and then at most three.
8. Indian English, founder's voice: gracious, confident, never grovelling, never salesy. No American slang, no emojis, no exclamation marks beyond one if natural. British spelling (colour, programme).
9. International recipients (e.g. an editor in Taiwan, a creator in Turkey): same warmth, a touch less formal.

FACTS — THIS IS WHERE EMAILS GO WRONG
- Use only facts in the context. Never invent a price, discount, date, quantity, attachment, meeting, promise or link.
- Links: only ones in the context, or these, which are known to work:${LINKS}
- If the email needs something that is not in the context — a file, a folder link, a figure only Roheena can give — write a [[short placeholder]] in the body and list it in "needs". Better a clear gap than a confident invention. Never say "please find attached"; nothing can be attached by this system. Share links instead.
- Money: never offer a number, discount or free product unless the context says it was agreed. For a decision task you MAY propose a figure in the option Roheena chooses between, and say it plainly in the recommendation.
- If the recipient asked for something to be sent to a particular address, send it there (and copy the person as a courtesy).

THREADING
- If a relevant thread exists in the context, reply inside it: gmail_thread_id copied exactly, subject "Re: " + its subject (never "Re: Re:"), and keep everyone who was on its latest message (To and Cc), minus Roheena's own addresses (roheena@zyvorah.com, roheena@plankandweave.com, roheena@magnitudegroup.in). A company can have several threads; pick the one this task is about.
- Our own colleagues (e.g. savita@zyvorah.com) stay in Cc if they were on the thread.

TASK TYPES
- email: write it.
- conditional ("if still no reply", "if they have not rung"): look at the thread's last_direction and last_at and the notes. If the last word is ours and nothing since, write a gentle nudge and fill status_note honestly with what the CRM shows. If they have already replied or called, set already_resolved true, no options, and say what happened in the headline.
- decision: give the recommendation (business reasoning, a default), then two emails — the recommended course first, the alternative second. Both must be sendable as written.
- other: no email; say in the headline what has to be done off-email.

SIGN-OFF — end every body with exactly:
Regards,
Roheena Nagpal
Zyvorah`;

/** What the draft was written from. When this changes — a new note, a new
 *  message on a thread, the task retitled — the cached draft is stale. The
 *  cached draft itself is excluded, or every save would invalidate itself. */
export function contextHash(ctx: CrmTaskContext): string {
  const { draft: _ignored, ...rest } = ctx;
  void _ignored;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex").slice(0, 32);
}

export async function draftTask(ctx: CrmTaskContext, today: string): Promise<TaskDraft> {
  const anthropic = new Anthropic({ apiKey: anthropicKeyFor("crm") });
  const { draft: _prev, ...context } = ctx;
  void _prev;

  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [{
      role: "user",
      content:
        `Today is ${today} (India). The task:\n\n"${ctx.task.title}"\n\n` +
        `Everything the CRM knows (notes are summaries written by the inbox sync or Roheena; thread excerpts are the real emails, newest first):\n\n` +
        JSON.stringify(context, null, 2),
    }],
    output_config: { format: zodOutputFormat(DraftSchema) },
  });

  const out = response.parsed_output;
  if (!out) throw new Error("no_draft");
  return sanitize(out, ctx);
}

const OWN = /^roheena@(zyvorah\.com|plankandweave\.com|magnitudegroup\.in)$/i;
const EMAIL_RE = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

/** The model is told the rules; this enforces the ones a mistake would make
 *  visible to a customer. An address that appears nowhere in the context is
 *  dropped (a guessed address bounces, or worse, reaches a stranger), and
 *  Roheena is never emailing herself. */
function sanitize(d: TaskDraft, ctx: CrmTaskContext): TaskDraft {
  const known = new Set<string>();
  for (const c of ctx.contacts) if (c.email) known.add(c.email.toLowerCase());
  for (const t of ctx.threads) for (const a of [...t.to, ...t.cc]) known.add(a.email.toLowerCase());
  const threadIds = new Set(ctx.threads.map((t) => t.gmail_thread_id));

  const clean = (list: string[]) =>
    [...new Set(list.map((a) => a.trim().toLowerCase()))]
      .filter((a) => EMAIL_RE.test(a) && !OWN.test(a) && known.has(a));

  return {
    ...d,
    options: d.already_resolved ? [] : d.options.map((o) => {
      const to = clean(o.to);
      return {
        ...o,
        gmail_thread_id: threadIds.has(o.gmail_thread_id) ? o.gmail_thread_id : "",
        to,
        cc: clean(o.cc).filter((a) => !to.includes(a)),
        subject: o.subject.replace(/^(re:\s*)+/i, "Re: ").trim(),
      };
    }),
  };
}

/** Plain text as typed in the review box → the HTML that is sent. Paragraphs
 *  and line breaks survive; anything that looks like a URL becomes a link. No
 *  template chrome: this is a personal email from a founder, and a branded
 *  newsletter frame around it would read as a mail-merge. */
export function bodyToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const linkify = (s: string) =>
    s.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]]/g, (u) => `<a href="${u}">${u}</a>`);
  const paras = text.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${linkify(esc(p)).replace(/\n/g, "<br>")}</p>`);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f1f1f">${paras.join("")}</div>`;
}

/** The note that lands on the company timeline once an email has gone. */
export function sentNote(o: { to: string[]; cc: string[]; subject: string; body: string }): string {
  const lines = o.body.trim().split(/\n/);
  const signAt = lines.findIndex((l) => /^warm regards,?$/i.test(l.trim()));
  const core = (signAt > 0 ? lines.slice(0, signAt) : lines).join("\n").trim();
  return `Emailed ${o.to.join(", ")}${o.cc.length ? ` (cc ${o.cc.join(", ")})` : ""} — "${o.subject}".\n\n${core}`;
}
