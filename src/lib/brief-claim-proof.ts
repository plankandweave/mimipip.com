/** Narrow reporting guards for the Oct 3 incidents. No mail or printer actions.
 * Gmail Date headers and thread membership are not delivery receipts. */
export type MailDeliveryEvidence = {
  /** Metadata copied from an actual read of this exact Gmail message. */
  provider: "gmail";
  verification: "message-read";
  contentMatchesClaim: true;
  entity: string;
  claim: string;
  messageId: string;
  labelIds: string[];
  internalDate: string;
  observedAt: string;
};

export function actuallySent(evidence: unknown, cutoff: Date): boolean {
  if (!evidence || typeof evidence !== "object") return false;
  const e = evidence as Partial<MailDeliveryEvidence>;
  const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (typeof e.internalDate !== "string" || typeof e.observedAt !== "string" ||
      !instant.test(e.internalDate) || !instant.test(e.observedAt)) return false;
  const sent = Date.parse(e.internalDate ?? "");
  const observed = Date.parse(e.observedAt ?? "");
  return e.provider === "gmail" && e.verification === "message-read" && e.contentMatchesClaim === true &&
    typeof e.messageId === "string" && /^[a-f0-9]+$/i.test(e.messageId) &&
    Array.isArray(e.labelIds) && e.labelIds.includes("SENT") &&
    !e.labelIds.some((label) => label === "DRAFT" || label === "SCHEDULED") &&
    Number.isFinite(sent) && Number.isFinite(observed) &&
    sent <= observed && observed <= cutoff.getTime();
}

export function claimProofHold(_key: string, prose: string, source: unknown, cutoff: Date): string | null {
  const text = prose.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const mailClaim = text.replace(/\b(?:not|never) (?:yet )?(?:sent|delivered)\b/gi, "");
  if (/\bIILM\b/i.test(text) &&
      /\bsent\b|\bdelivered\b|went out|their move|next move is theirs|last word is ours|has the brighter deck/i.test(mailClaim)) {
    let evidence: unknown;
    try {
      const envelope = JSON.parse(typeof source === "string" ? source : "null");
      evidence = envelope?.kind === "brief-evidence-v1" ? envelope.mailDeliveries : null;
    } catch { /* Legacy prose has no delivery proof. */ }
    if (!Array.isArray(evidence) || !evidence.some((e) => e?.entity === "IILM" && e?.claim === "updated-deck" && actuallySent(e, cutoff))) {
      return "IILM Sent claim held: this filing does not include verified SENT-labelled message evidence before filing. A scheduled record, future timestamp or sender address does not establish Sent; this is a reporting-evidence gap, not proof that the email was not sent";
    }
  }
  return null;
}
