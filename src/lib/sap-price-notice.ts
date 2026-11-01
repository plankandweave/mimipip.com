import "server-only";
import { sendEmailWithId } from "./email";
import { supabaseAdmin } from "./supabase-admin";
import { recordAuditRaw } from "./corporate-auth";
import { isOffStandardRate, sapNoticeEmail, STANDARD_LIST_RATE, type SapNoticeInput } from "./sap-price-notice-email";

export { isOffStandardRate, STANDARD_LIST_RATE, type SapNoticeInput };

/**
 * "Add it to SAP in time" — the heads-up a partner's procurement gets when a
 * designer shortlists something that is NOT at the standard rate.
 *
 * HomeLane buy against items set up in their SAP, and the standard item is the
 * ₹200/sq ft catalogue rate. Once the whole website was opened to them
 * (30 September 2026) a designer can shortlist an Autograph design, or a
 * premium material, whose rate has no SAP item yet — and the PO then stalls
 * until procurement adds one. So the first time any designer on the account
 * shortlists a design/material pair off the standard rate, procurement and the
 * account's admins are told, once, with the rate called out. At ₹200 nothing
 * is sent (Roheena: "if the price is 200, no emails need to go").
 *
 * "Once" is per design + material: that pair is what an SAP item is. It is
 * remembered in corporate_audit (action `sap.price_notice`), so no new table
 * and no migration; a Resend idempotency key covers two designers saving the
 * same pair in the same second.
 */

const ACTION = "sap.price_notice";

/** Send the notice unless this design + material was already announced to
 *  this account. Never throws: a notice must not fail a designer's save. */
export async function notifySapPriceOnce(n: SapNoticeInput): Promise<void> {
  try {
    if (!isOffStandardRate(n.material.listPricePerSqft)) return;
    const sb = supabaseAdmin();
    if (!sb) return;
    const key = `${n.design.handle}:${n.material.slug}`;
    const { data: sent } = await sb.from("corporate_audit").select("id")
      .eq("account_id", n.account.id).eq("action", ACTION).eq("subject_id", key).limit(1);
    if (sent?.length) return;

    // Procurement (may place orders) and the account's admins — which is
    // where Vaishnavi sits once her access is raised.
    const { data: members } = await sb.from("corporate_members")
      .select("email, role, can_order")
      .eq("account_id", n.account.id).eq("active", true);
    const to = [...new Set(((members ?? []) as { email: string | null; role: string; can_order: boolean }[])
      .filter((m) => m.email && (m.can_order || m.role === "admin"))
      .map((m) => m.email!.toLowerCase()))];
    if (!to.length) {
      console.warn(`[sap-notice] ${n.account.slug}: nobody with purchasing or admin to tell about ${key}`);
      return;
    }

    const { subject, html } = sapNoticeEmail(n);
    const { ok } = await sendEmailWithId({
      to, subject, html,
      idempotencyKey: `sap-notice-${n.account.id}-${key}`,
    });
    // Remembered only once it actually went, so a missing mail key or a
    // Resend outage retries on the next shortlist instead of going quiet.
    if (ok) {
      await recordAuditRaw({
        accountId: n.account.id,
        actorEmail: n.designer,
        action: ACTION,
        subject: { type: "design_material", id: key },
        detail: { to, listPricePerSqft: n.material.listPricePerSqft, standard: STANDARD_LIST_RATE },
      });
    }
  } catch (e) {
    console.error("[sap-notice]", e instanceof Error ? e.message : e);
  }
}
