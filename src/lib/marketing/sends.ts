// Customer-facing outreach (email). The most sensitive capability in the engine:
// it messages individual customers, not the public. So it is the most gated.
//
// The intelligence-layer executor is deliberately built to NEVER contact
// customers — it prepares drafts and blocks. This engine can take that final
// step, but only under all of:
//   - the decision is founder-originated outreach (classify = outreach),
//   - Resend is configured (RESEND_API_KEY),
//   - AND MARKETING_SENDS_ARMED === 'true' (an explicit, separate arm switch).
// Absent the arm switch, it DRAFTS + STAGES + records — it does not send. Every
// send is brand-safety-gated, capped per run, and carries an unsubscribe header.
//
// Rationale for a separate arm switch (vs ads' budget cap): there is no
// quantitative guardrail on messaging customers the way a ₹ cap bounds ad spend,
// so the guardrail here is an explicit human "yes, send" — surfaced in the admin
// setup checklist for Roheena to enable consciously.

import Anthropic from "@anthropic-ai/sdk";
import { sendEmail } from "@/lib/email";
import { checkCaption, autoCorrect } from "./safety";
import { approvedMarketingDecisions, classify, markDecision, stillMineNote, abandonedCartContacts, claimOutreachSend, type Decision } from "./intel";
import { hasServiceRole } from "./db";
import { envFlag } from "@/lib/env-flag";
import { anthropicKeyFor } from "@/lib/ai-keys";

const MODEL = "claude-sonnet-5";
const MAX_PER_RUN = 25; // never blast; a run handles a small batch
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://zyvorah.com";

export function sendsArmed(): boolean {
  return envFlag(process.env.MARKETING_SENDS_ARMED) && !!process.env.RESEND_API_KEY;
}

const DRAFT_SYSTEM = `You write a short, warm, personal outreach EMAIL for Zyvorah — an Indian brand of original mural wallpaper designs. The reader is a real customer who left something in their cart or showed interest in a design. This is a gentle nudge, not a hard sell.

Voice: warm, intelligent, editorial, Indian/British English (colour, favourite). Reference their specific design/cart naturally if given. Offer genuine help — a free sample swatch, a measurement hand, or the concierge — not a discount unless told to. NEVER describe how anything is manufactured. State price only as given.

Return JSON-free plain output in exactly this shape:
SUBJECT: <one line>
---
<the email body as simple HTML: 2-3 short paragraphs, a warm sign-off from "Roheena, Zyvorah". No images.>`;

type Draft = { to: string; subject: string; html: string };

function parseDraft(text: string, to: string): Draft | null {
  const m = text.match(/SUBJECT:\s*(.+?)\s*\n-{2,}\n([\s\S]+)/i);
  if (!m) return null;
  return { to, subject: m[1].trim().slice(0, 140), html: m[2].trim() };
}

async function draftFor(
  contact: { email?: string; name?: string; item?: string; amount?: number },
  decision: Decision,
): Promise<Draft | null> {
  if (!contact.email) return null;
  const client = new Anthropic({ apiKey: anthropicKeyFor("marketing"), maxRetries: 2 });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: DRAFT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `DECISION: ${decision.title}\nGUIDANCE: ${decision.recommendation ?? ""}\n\nCUSTOMER: ${contact.name ?? "there"}\nCART/INTEREST: ${contact.item ?? "a design they were viewing"}${contact.amount ? ` (₹${contact.amount})` : ""}\nSite: ${SITE}`,
      },
    ],
  });
  const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
  const draft = parseDraft(text, contact.email);
  if (!draft) return null;
  // Safety-gate the visible copy (strip tags first for the check).
  const plain = autoCorrect(draft.html.replace(/<[^>]+>/g, " "));
  if (!checkCaption(`${draft.subject}\n\n${plain}`, { fromPrice: 200 }).ok) return null;
  draft.html = autoCorrect(draft.html);
  return draft;
}

export type OutreachOutcome = {
  decisionId: string;
  title: string;
  drafted: number;
  sent: number;
  staged: boolean;
  detail: string;
};

async function consumeOne(decision: Decision): Promise<OutreachOutcome> {
  const base = { decisionId: decision.id, title: decision.title };
  const contacts = (await abandonedCartContacts()).slice(0, MAX_PER_RUN);

  if (!contacts.length) {
    // Terminal: these specific carts are unreachable (e.g. anonymous carts that
    // predate contact-capture). Drop the HANDED phrase so it isn't retried —
    // future carts get their own outreach decisions from the weekly report.
    await markDecision(decision.id, "blocked", "Marketing engine: no reachable contacts with a captured email for this outreach (the carts are anonymous). Nothing sent.");
    return { ...base, drafted: 0, sent: 0, staged: false, detail: "no reachable contacts" };
  }

  // Staged (default): not armed → do NOT draft (saves tokens every tick) and
  // keep the decision "still mine" so it sends the moment arming is enabled.
  if (!sendsArmed()) {
    await markDecision(
      decision.id,
      "in_progress",
      stillMineNote(`Marketing engine: ${contacts.length} reachable contact(s) ready for outreach. Not sent — customer sending is not armed (set MARKETING_SENDS_ARMED=true + RESEND_API_KEY). No customer was contacted.`),
    );
    return { ...base, drafted: 0, sent: 0, staged: true, detail: `${contacts.length} staged; sending not armed` };
  }

  // Armed: draft (safety-gated), then send each with an unsubscribe header.
  const drafts: Draft[] = [];
  for (const c of contacts) {
    const d = await draftFor(
      { email: c.email ?? c.contact_email, name: c.name ?? c.contact_name, item: c.item ?? c.item_title, amount: c.amount ?? c.total },
      decision,
    );
    if (d) drafts.push(d);
  }

  let sent = 0;
  let skipped = 0;
  for (const d of drafts) {
    // The contact list is every open cart, not "carts this decision is about",
    // so two approved decisions in one tick would otherwise write to the same
    // person twice — and every later decision would write to them again. The
    // ledger is the memory of who we've already contacted, claimed atomically
    // so concurrent runs can't both win.
    if (!(await claimOutreachSend(d.to))) { skipped++; continue; }
    const ok = await sendEmail({
      to: d.to,
      subject: d.subject,
      html: d.html,
      headers: { "List-Unsubscribe": `<${SITE}/newsletter?unsubscribe=${encodeURIComponent(d.to)}>` },
    });
    if (ok) sent++;
  }
  const skipNote = skipped ? ` ${skipped} skipped — already contacted recently.` : "";
  await markDecision(
    decision.id,
    "done",
    `Marketing engine: sent ${sent}/${drafts.length} personalised outreach emails (each with unsubscribe).${skipNote} Brand-safety-gated. No discounts offered beyond guidance.`,
  );
  return { ...base, drafted: drafts.length, sent, staged: false, detail: `sent ${sent}/${drafts.length}${skipNote}` };
}

/** Consume founder-originated outreach decisions (approved or handed). */
export async function consumeOutreachDecisions(): Promise<OutreachOutcome[]> {
  if (!hasServiceRole()) return [];
  const decisions = (await approvedMarketingDecisions()).filter((d) => classify(d) === "outreach");
  const out: OutreachOutcome[] = [];
  for (const d of decisions) out.push(await consumeOne(d));
  return out;
}
