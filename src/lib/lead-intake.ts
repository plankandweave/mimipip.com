import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { istDateKey } from "@/lib/ist";
import { isInternalOrder } from "@/lib/internal-orders";
import { leadCompanyName, isTestLead } from "@/lib/lead-rules";

/**
 * Every person who tells the shop how to reach them becomes a CRM task the
 * same day.
 *
 * 7 October 2026 audit: four real enquiries came through the contact form in
 * 45 days ("plz call back", "I want to speak to someone about ordering and
 * installation") and they were stored in contact_messages, where nobody looks;
 * two of them never reached the CRM at all. The CRM task list is where the
 * team works, so that is where a lead has to land: a company and contact
 * (matched by email or phone, never duplicated), a note with what they said,
 * and an open task due today.
 *
 * Best-effort by contract: a failure here is logged and swallowed, because the
 * shopper's form or cart must never fail for the sake of our bookkeeping.
 */
export type LeadInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** crm_companies.kind — "retail" for a home shopper. */
  kind?: string;
  /** Where it came from: "contact-form", "cart", "product-buying-help" … */
  source: string;
  /** The task the team sees, e.g. "Call Anjan Panda back about …". */
  taskTitle: string;
  /** What they said or did, filed as a note. */
  note: string;
  /** Defaults to today (IST). */
  dueOn?: string;
};

export async function fileLeadToCrm(
  db: SupabaseClient,
  input: LeadInput,
): Promise<{ taskId: string | null; companyId: string | null }> {
  try {
    const email = input.email?.trim().toLowerCase() || null;
    const phone = input.phone?.trim() || null;
    if (!email && !phone) return { taskId: null, companyId: null };
    if (isInternalOrder(email) || isTestLead(email, input.note)) return { taskId: null, companyId: null };

    // An existing contact keeps its company: a returning lead adds a task to
    // the record the team already knows, it does not start a second one.
    let companyId: string | null = null;
    let contactId: string | null = null;
    const match = email
      ? await db.from("crm_contacts").select("id, company_id").ilike("email", email).limit(1).maybeSingle()
      : await db.from("crm_contacts").select("id, company_id").eq("phone", phone).limit(1).maybeSingle();
    if (match.data) {
      companyId = match.data.company_id as string;
      contactId = match.data.id as string;
      if (phone && email) await db.from("crm_contacts").update({ phone }).eq("id", contactId).is("phone", null);
    } else {
      const company = await db
        .from("crm_companies")
        .insert({ name: leadCompanyName(input.name, email, phone), kind: input.kind ?? "retail", status: "lead", source: input.source })
        .select("id")
        .single();
      if (company.error || !company.data) throw new Error(company.error?.message ?? "company insert failed");
      companyId = company.data.id as string;
      const contact = await db
        .from("crm_contacts")
        .insert({ company_id: companyId, name: input.name?.trim() || email || phone || "Website lead", email, phone, is_primary: true })
        .select("id")
        .single();
      contactId = contact.data?.id ?? null;
    }

    await db.from("crm_notes").insert({
      company_id: companyId,
      contact_id: contactId,
      kind: "note",
      body: `[${input.source}] ${input.note}`.slice(0, 4000),
      // crm_notes / crm_tasks accept only manual | dictation | inbox. The
      // origin is kept on the company (free text) and at the head of the note.
      source: "manual",
    });
    const task = await db
      .from("crm_tasks")
      .insert({ company_id: companyId, title: input.taskTitle.slice(0, 300), due_on: input.dueOn ?? istDateKey(), source: "manual" })
      .select("id")
      .single();
    return { taskId: (task.data?.id as string) ?? null, companyId };
  } catch (e) {
    console.error("[lead-intake] could not file lead:", e instanceof Error ? e.message : e);
    return { taskId: null, companyId: null };
  }
}

/**
 * A contact-form message, filed: CRM task due today, and an email to the
 * team so it is read today rather than found in a table later. Never throws.
 */
export async function fileContactLead(input: {
  name: string | null;
  email: string;
  phone: string | null;
  message: string;
  topic: string | null;
  source: string;
}): Promise<void> {
  try {
    if (isInternalOrder(input.email) || isTestLead(input.email, input.message)) return;
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const { sendEmail } = await import("@/lib/email");
    const db = supabaseAdmin();
    const who = input.name?.trim() || input.email;
    const gist = input.message.replace(/\s+/g, " ").trim().slice(0, 80);
    if (db) {
      await fileLeadToCrm(db, {
        name: input.name,
        email: input.email,
        phone: input.phone,
        source: input.source === "product-buying-help" ? "product-buying-help" : "contact-form",
        taskTitle: `Reply to ${who} today — "${gist}${input.message.length > 80 ? "…" : ""}"`,
        note: `Website message${input.topic ? ` (${input.topic})` : ""}:\n${input.message}`,
      });
    }
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    await sendEmail({
      to: [process.env.EMAIL_REPLY_TO || "hello@zyvorah.com", process.env.CHECKOUT_ALERT_TO || "roheena@plankandweave.com"],
      replyTo: input.email,
      subject: `New enquiry — ${who}${input.topic ? ` · ${input.topic}` : ""}`,
      html: `<p><strong>${esc(who)}</strong> · ${esc(input.email)}${input.phone ? ` · ${esc(input.phone)}` : ""}</p><blockquote>${esc(input.message).replace(/\n/g, "<br>")}</blockquote><p>A reply task is on the CRM for today. Reply to this email to answer them directly.</p>`,
    });
  } catch (e) {
    console.error("[lead-intake] contact lead not filed:", e instanceof Error ? e.message : e);
  }
}
