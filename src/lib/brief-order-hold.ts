/** Owner-held order reporting is a data boundary, not an action-word filter.
 * An affected filing keeps no free-form advice, including its headline. */
export const ORDER_HOLD_NOTICE = "Vijay Sales VS-000060 / ZVY-10663 remains on the owner no-reprint hold. This filing's free-form reporting is withheld from this brief; the original filing is unchanged. This notice does not establish whether printing, QC or POD occurred and does not authorize any render, queue or print action.";
export const ORDER_HOLD_HEADLINE = "Vijay Sales VS-000060 / ZVY-10663: owner no-reprint hold; free-form filing withheld";

const namedEntities: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "-", mdash: "-", hyphen: "-", shy: "", zerowidthspace: "",
  zwnj: "", zwj: "", lrm: "", rlm: "", nobreak: "", newline: " ", tab: " ",
};
const dashVariants = new RegExp("[\\p{Dash_Punctuation}\\u2212]", "gu");
const invisibleFormatting = new RegExp("\\p{Default_Ignorable_Code_Point}", "gu");
const decode = (value: string) => value.replace(/&(#x[\da-f]+;?|#\d+;?|[a-z][a-z0-9]*;)/gi, (original, captured: string) => {
  const entity = captured.replace(/;$/, "");
  if (!entity.startsWith("#")) return namedEntities[entity.toLowerCase()] ?? original;
  const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : original;
}).normalize("NFKC").replace(dashVariants, "-").replace(invisibleFormatting, "");
// Quoted > characters cannot terminate a tag; unsupported inline tags still
// participate in conservative identifier detection before display decisions.
const tag = /<!--[^]*?(?:-->|$)|<(?:(?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const recoveredTag = /<(?:(?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const stripTags = (value: string, separator: string) => value.replace(tag, separator);
const protectedId = /\b(?:V\s*S[\s-]*(?:0\s*)*6\s*0|Z\s*V\s*Y[\s-]*1\s*0\s*6\s*6\s*3)\b/i;
const identifiesProtectedOrder = (value: string) => {
  const decoded = decode(value);
  // Both views avoid losing an ID either within inline markup or alongside
  // adjacent block text. Unknown named entities are conservatively ignored.
  return [decoded, stripTags(decoded, ""), stripTags(decoded, " "),
    // HTML recovers comments such as <!--> at their first >. Do not let the
    // normal comment branch hide an identifier from every detection view.
    decoded.replace(recoveredTag, ""), decoded.replace(recoveredTag, " ")]
    .some((view) => protectedId.test(view.replace(/&[a-z][a-z0-9]*;/gi, "")));
};

/** Reconstruct only closed, non-action operational fields. A topic prefix never
 * exempts its raw suffix. Unknown qualifiers make the field unavailable. */
function operationalFact(text: string): { key: string; text: string } | null {
  if ((text.match(/\b(?:Restarts|Bug queue):/gi) ?? []).length > 1) return null;
  const restarts = /^(?:\d+[.)]\s*)?Restarts:\s*(none(?: needed)?|\d{1,6}(?: restarts?)?)\s*(?:\.(?=\s|$)|$)/i.exec(text);
  if (restarts) return { key: "restarts", text: `Restarts: ${/^none/i.test(restarts[1]) ? "none needed" : parseInt(restarts[1], 10)}.` };
  const bugs = /^(?:\d+[.)]\s*)?Bug queue:\s*(\d{1,6}\s+(?:new|open|fixed|parked)(?:\s*,\s*\d{1,6}\s+(?:new|open|fixed|parked))*)(?:\s+(on (?:either|both) desks?))?\s*(?:\.(?=\s|$)|$)/i.exec(text);
  if (!bugs) return null;
  const byStatus = new Map<string, number>();
  for (const match of bugs[1].matchAll(/(\d+)\s+(new|open|fixed|parked)/gi)) {
    const count = Number(match[1]);
    const status = match[2].toLowerCase();
    if (byStatus.has(status) && byStatus.get(status) !== count) return null;
    byStatus.set(status, count);
  }
  const counts = [...byStatus].map(([status, count]) => `${count} ${status}`).join(", ");
  return { key: "bugs", text: `Bug queue: ${counts}${bugs[2] ? ` ${bugs[2].toLowerCase()}` : ""}.` };
}

/** Other orders a held filing names, as bare canonical references only (no
 * prose travels with them). Without this the brief loses every unrelated
 * owner decision in the filing: on 8 Oct the overnight patrol's whole section,
 * including ZVY-20479's "was it printed?" and ZVY-20488's sample approval, was
 * replaced by the hold notice, and the stored original has no page she can
 * open. A reference can carry no instruction, so this reopens no loophole. */
const MAX_OTHER_ORDERS = 12;
function otherOrdersNamed(...texts: Array<string | null>): string[] {
  const seen = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    const view = stripTags(decode(text), " ");
    for (const m of view.matchAll(/\b(ZVY|VS)[\s-]*(\d{4,6})\b/gi)) {
      const prefix = m[1].toUpperCase();
      const ref = `${prefix}-${prefix === "VS" ? m[2].padStart(6, "0") : m[2]}`;
      if (!identifiesProtectedOrder(ref)) seen.add(ref);
    }
  }
  return [...seen].slice(0, MAX_OTHER_ORDERS);
}
export const otherOrdersLine = (refs: string[]) =>
  `This filing also names ${refs.join(", ")}. Their items are withheld here with it; the stored filing holds the details.`;

/** Once a filing references the owner-held order, free-form scope is ambiguous:
 * a different heading/order can still contain a reference back to that order.
 * Retain the original filing elsewhere and render only a fixed notice/headline
 * plus independently parsed operational fields. No prose can clear this hold. */
export function holdProtectedOrderReporting(input: { headline: string | null; bodyHtml: string | null }): {
  headline: string | null; bodyHtml: string | null; held: boolean;
} {
  if (!identifiesProtectedOrder(input.headline ?? "") && !identifiesProtectedOrder(input.bodyHtml ?? "")) {
    return { ...input, held: false };
  }
  const others = otherOrdersNamed(input.headline, input.bodyHtml);
  const othersHtml = others.length ? `<p>${otherOrdersLine(others)}</p>` : "";
  if (!input.bodyHtml) return { headline: ORDER_HOLD_HEADLINE, bodyHtml: othersHtml ? `<p>${ORDER_HOLD_NOTICE}</p>${othersHtml}` : null, held: true };
  const units = decode(input.bodyHtml)
    .replace(/<\/?(?:p|div|ul|ol|li|h[1-6])\b[^>]*>|<br\s*\/?\s*>/gi, "\n")
    .split(/\r?\n/).map((unit) => stripTags(unit, " ").replace(/\s+/g, " ").trim());
  const facts = new Map<string, Set<string>>();
  for (const unit of units) {
    if (identifiesProtectedOrder(unit)) continue;
    const fact = operationalFact(unit);
    if (fact) facts.set(fact.key, (facts.get(fact.key) ?? new Set()).add(fact.text));
  }
  // Conflicting filed values are not silently picked or combined.
  const safeFacts = [...facts.values()].flatMap((values) => values.size === 1 ? [...values] : []);
  return {
    headline: ORDER_HOLD_HEADLINE,
    bodyHtml: `<p>${ORDER_HOLD_NOTICE}</p>` + othersHtml + safeFacts.map((fact) => `<p>${fact}</p>`).join(""),
    held: true,
  };
}
