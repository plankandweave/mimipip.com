import { SITE_URL } from "./seo";

/** Pure half of the SAP price notice (see sap-price-notice.ts): the rule and
 *  the words, testable without a database or a mail key. */

/** The website's standard list rate, ₹/sq ft GST-inclusive — the rate
 *  HomeLane's SAP already carries. */
export const STANDARD_LIST_RATE = 200;

/** Is this list rate (₹/sq ft, as the website shows it) off the standard? */
export function isOffStandardRate(listPricePerSqft: number): boolean {
  return Number.isFinite(listPricePerSqft) && Math.round(listPricePerSqft * 100) !== STANDARD_LIST_RATE * 100;
}

export type SapNoticeInput = {
  account: { id: string; name: string; slug: string };
  designer: string;
  design: { handle: string; title: string; tier: string | null };
  material: { slug: string; name: string; listPricePerSqft: number };
  customer?: string | null;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const TIER_NAME: Record<string, string> = {
  autograph: "Autograph", saanjha: "Saanjha", atelier: "Atelier",
};

export function sapNoticeEmail(n: SapNoticeInput): { subject: string; html: string } {
  const rate = n.material.listPricePerSqft;
  const dir = rate > STANDARD_LIST_RATE ? "above" : "below";
  const tier = n.design.tier ? TIER_NAME[n.design.tier] ?? null : null;
  const subject = `Add to SAP: ${n.design.title} at ${rupees(rate)}/sq ft — not ${rupees(STANDARD_LIST_RATE)}`;
  const row = (k: string, v: string) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #E0E0E0;color:#6B6B6B;width:38%">${k}</td>` +
    `<td style="padding:10px 0;border-bottom:1px solid #E0E0E0;color:#2D2D2D">${v}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#FAFAF8">
<div style="max-width:560px;margin:0 auto;padding:40px 28px;font-family:Georgia,'Times New Roman',serif;color:#2D2D2D;line-height:1.55;font-size:15px">
<p style="margin:0 0 28px;font-size:12px;color:#6B6B6B">${esc(n.account.name)} · Zyvorah partner portal</p>
<p style="margin:0 0 16px">Hello,</p>
<p style="margin:0 0 16px">Your designers have been selecting the product below. Please add it to your SAP in time, so the purchase order is not held up when the customer confirms.</p>
<p style="margin:24px 0;padding:14px 16px;border-left:3px solid #8C7B6B;background:#F5F5F3">
<strong>This rate is ${rupees(rate)} per sq ft — not the standard ${rupees(STANDARD_LIST_RATE)}.</strong><br>
<span style="color:#6B6B6B;font-size:13px">It is ${dir} the rate your SAP already carries, so it needs its own item.</span></p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #E0E0E0;font-size:14px">
${row("Design", `<a href="${SITE_URL}/products/${encodeURIComponent(n.design.handle)}" style="color:#2D2D2D">${esc(n.design.title)}</a>`)}
${tier ? row("Collection", `${esc(tier)} (exclusive)`) : ""}
${row("Material", esc(n.material.name))}
${row("Website rate", `<strong>${rupees(rate)} per sq ft</strong> incl. GST`)}
${row("Standard rate", `${rupees(STANDARD_LIST_RATE)} per sq ft incl. GST`)}
${row("First shortlisted by", esc(n.designer))}
${n.customer ? row("Customer", esc(n.customer)) : ""}
</table>
<p style="margin:24px 0 0;font-size:13px;color:#6B6B6B">Your account's discount applies as usual. You will receive this only once for this design and material, however many designers choose it.</p>
<p style="margin:28px 0 0"><a href="${SITE_URL}/partners/${encodeURIComponent(n.account.slug)}/projects" style="color:#8C7B6B">Open the partner portal</a></p>
</div></body></html>`;
  return { subject, html };
}

