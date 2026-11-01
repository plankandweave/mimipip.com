import { claimProofHold } from "./brief-claim-proof";
import { holdProtectedOrderReporting } from "./brief-order-hold";

const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
const plain = (value: string) => value.replace(/<[^>]*>/g, " ")
  .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/gi, (_, entity: string) => HTML_ENTITIES[entity.toLowerCase()] ?? _)
  .replace(/\s+/g, " ").trim();
const entities = (text: string) => [...text.matchAll(/\b(?:VS[- ]?\d+|ZVY[- ]?\d+|IILM)\b/gi)];
const subject = (text: string, current = "") => {
  const explicit = entities(text).map(m => m[0]);
  if (explicit.length) return [...new Set(explicit)].join(" / ");
  // Only another explicit order or a new topic heading ends protected-order
  // context. Operational labels such as "Print:" are not other customers.
  if (/\b(?:VS[- ]?0*60|ZVY[- ]?10663)\b/i.test(current)) return current;
  const label = /^\s*([A-Z][\w &'()/-]{1,60}):(?=\s)/.exec(text)?.[1];
  // "Acme: ..." starts a new subject; "Recommendation: ..." still refers
  // to the current subject. Generic report labels must not bypass the guard.
  return label && !/^(recommendation|action|next steps?|status|evidence|findings|note|update|result|warning|problem|decision|email|delivery|message|gmail|crm|deck|proposal|print|printing|fulfilment)$/i.test(label) ? label : "";
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Reconcile only the known incident claims at the display boundary. Original
 * filings are untouched. Headings/headlines supply subject context, never
 * evidence. Sentence and explicit subject boundaries preserve unrelated facts. */
export function presentBriefProse(input: {
  key: string; headline: string | null; bodyHtml: string | null;
  source: unknown; cutoff: Date;
}): { headline: string | null; bodyHtml: string | null; held: boolean } {
  const orderReporting = holdProtectedOrderReporting(input);
  input = { ...input, headline: orderReporting.headline, bodyHtml: orderReporting.bodyHtml };
  let held = orderReporting.held;
  const notices = new Set<string>();
  const reconcile = (fragment: string, html: boolean, initialContext = "") => {
    const text = plain(fragment);
    let notice: string | null = null;
    if (!html && input.key === "day-watch" && /brief.*(?:left out|dropped|omitted).*sections.*filed/i.test(text)) {
      notice = "Afternoon watch filed; its section-omission diagnosis needs evidence reconciliation";
    }
    // The Oct 3 watch interpreted the Oct 2 evidence gate as a date bug.
    // Do not repeat that diagnosis merely because prose had been filed.
    if (/store-db/i.test(text) && /google-ads/i.test(text) &&
        /(?:left out|dropped|omitted).*sections.*filed/i.test(text) &&
        /freshness|date rule|silent failure/i.test(text)) {
      notice = "Filed database and Google Ads sections can be held for missing observation evidence. Filing alone does not establish a freshness/date bug; see the evidence status in this brief";
    }
    // Old hourly filings can outlive the producer deployment. Keep the missing
    // configuration visible without reprinting activation/credential directions.
    if (input.key === "call-followups" && /VAPI_PHONE_NUMBER_ID not set/i.test(text)) {
      notice = "AI follow-up calls are not running: no outbound calling number is configured (VAPI_PHONE_NUMBER_ID not set). No calls were placed by this run";
    }
    const replace = (claim: string) => {
      held = true;
      if (!html) return claim;
      if (notices.has(claim)) return "";
      notices.add(claim);
      return claim;
    };
    if (notice) return html ? escapeHtml(replace(notice)) : replace(notice);

    let context = initialContext;
    let changed = false;
    const sentences = text.split(/(?<=[.!?;])\s+(?=[A-Z0-9])/i)
      .flatMap((sentence) => sentence.split(/,\s+(?=(?:re[- ]?print(?:ing)?|retry(?:ing)?|replay(?:ing)?|re[- ]?send(?:ing)?|render(?:ing)?|re[- ]?run(?:ning)?|run(?:ning)?)\b)/i))
      .flatMap((clause) => clause.split(/\s+and\s+(?=(?:re[- ]?print(?:ing)?|retry(?:ing)?|replay(?:ing)?|re[- ]?send(?:ing)?)\b)/i))
      .flatMap((clause) =>
        // Keep coordinated prohibitions together, but retain comma boundaries
        // so another order's direction still gets its own subject.
        /\b(?:do not|never)\s+(?:re[- ]?run|run|render)\b/i.test(clause) ? [clause] :
          clause.split(/\s+and\s+(?=(?:render(?:ing)?|re[- ]?run(?:ning)?|run(?:ning)?)\b)/i));
    const output = sentences.map((sentence) => {
      const named = entities(sentence);
      context = subject(sentence, context) || context;
      // Evaluate one sentence under its own explicit subject before inheriting
      // a heading. This keeps another order's retry out of the protected order.
      const scopes = new Set(named.map(m => /^(?:VS[- ]?0*60|ZVY[- ]?10663)$/i.test(m[0]) ? "held-order" : m[0].toUpperCase()));
      if (scopes.size <= 1) {
        const hold = claimProofHold(input.key, `${context} ${sentence}`, input.source, input.cutoff);
        if (!hold) return sentence;
        changed = true;
        return replace(hold);
      }
      // After clear sentence/semicolon/action boundaries have been separated,
      // a mixed-target clause is shared or ambiguous. Keep the protected target
      // attached to its predicate instead of guessing which identifier owns it.
      const hold = claimProofHold(input.key, sentence, input.source, input.cutoff);
      if (!hold) return sentence;
      changed = true;
      return replace(hold);
    }).filter(Boolean).join(" ");
    return changed ? (html ? escapeHtml(output) : output) : fragment;
  };
  let bodyHtml = input.bodyHtml;
  if (bodyHtml) {
    // Retain markup delimiters so sanitizing a numbered finding cannot swallow
    // the other findings in the same paragraph. Inline markup stays with text.
    let sectionContext = subject(plain(input.headline ?? ""));
    let context = sectionContext;
    let heading = false;
    bodyHtml = bodyHtml.split(/(<\/?(?:p|li|ul|ol|div|h[1-6])\b[^>]*>|<br\s*\/?\s*>)/gi)
      .map((part) => {
        if (/^<h[1-6]\b/i.test(part)) { heading = true; context = ""; return part; }
        if (/^<\/h[1-6]\b/i.test(part)) { sectionContext = context; heading = false; return part; }
        if (/^<\/?(?:p|li|ul|ol|div)\b/i.test(part)) { context = sectionContext; return part; }
        if (/^<br\b/i.test(part)) return part;
        const text = plain(part);
        const result = reconcile(part, true, context);
        context = subject(text, context) || context;
        // An entity-only line is also a heading, even inside <p><strong>.
        const entityOnly = entities(text).length > 0 && !text
          .replace(/\b(?:VS[- ]?\d+|ZVY[- ]?\d+|IILM|and|or|both)\b/gi, "")
          .replace(/[\s:.,/—–&-]/g, "");
        if (heading || entityOnly) {
          sectionContext = context;
        }
        return result;
      })
      .join("");
  }
  let headline = input.headline ? reconcile(input.headline, false) : null;
  if (held && !orderReporting.held && headline === input.headline && !headline?.startsWith("Filed with some claims held for evidence")) {
    headline = "Filed with some claims held for evidence" + (headline ? ` · ${headline}` : "");
  }
  return { headline, bodyHtml, held };
}
