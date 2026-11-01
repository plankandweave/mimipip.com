import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { MailAttachment } from "@/lib/founder-mime";
import { caDownload } from "@/lib/corporate-art-store";
import { refreshQuotationCatalogue } from "./catalogue-server";
import { quotationTotals, partsOf, type Quotation, type QuotationPart } from "./model";
import { renderQuotationPdf } from "./quotation-pdf";
import { renderSpecSheetsPdf, type SpecSheetRequest } from "./spec-sheet-pdf";
import { loadBrandAssets } from "./pdf-assets";
import { partReference, quotationLabel } from "./numbering";

/**
 * Reading a stored quotation and rendering its files. The row holds the
 * quotation as data; the PDFs — the supply quotation, the installation
 * quotation and the specification sheets — are rendered from it every time
 * they are asked for, so what is attached is always what the row says.
 */

export type StoredQuotation = {
  id: string;
  company_id: string;
  deal_id: string | null;
  number: string;
  revision: number;
  status: string;
  document: Quotation;
  spec_sheets: SpecSheetRequest[];
  total_inr: number;
  task_id: string | null;
  sent_at: string | null;
  pricingIssue?: string;
};

export async function fetchQuotation(id: string): Promise<StoredQuotation | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("crm_quotations").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  let document = data.document as Quotation;
  let pricingIssue: string | undefined;
  if (data.status === "draft" && (document.pricingPolicy || document.lines.some((l) => l.productHandle))) {
    try { document = await refreshQuotationCatalogue(document); }
    catch (e) { pricingIssue = e instanceof Error ? e.message : String(e); }
  }
  return {
    pricingIssue,
    ...(data as Omit<StoredQuotation, "document" | "spec_sheets" | "total_inr" | "revision">),
    document,
    spec_sheets: (data.spec_sheets as SpecSheetRequest[]) ?? [],
    total_inr: pricingIssue ? Number(data.total_inr) : quotationTotals(document).total,
    revision: Number(data.revision),
  };
}

/** The wall pictures a quotation's lines name, read from the private store
 *  by seq. A picture that cannot be read is left out — the document still
 *  renders, with that wall's measurement and price and no picture. */
export async function loadLinePictures(q: Pick<Quotation, "lines">): Promise<Map<number, Uint8Array>> {
  const out = new Map<number, Uint8Array>();
  await Promise.all(q.lines.map(async (l) => {
    if (!l.picture?.path) return;
    const { data } = await caDownload(l.picture.path);
    if (data) out.set(l.seq, new Uint8Array(await data.arrayBuffer()));
  }));
  return out;
}

/** Where a quotation's wall pictures live in the private store: one JPEG
 *  per wall, re-stamped on every change so a stale copy is never served. */
export function linePicturePath(quotationId: string, seq: number): string {
  return `quotation/${quotationId}/w${String(seq).padStart(2, "0")}-${Date.now().toString(36)}.jpg`;
}

/** One of the two documents; null when the quotation has no such part (a
 *  supply-only quotation has no installation document). */
export async function renderStoredQuotation(q: StoredQuotation, part: QuotationPart): Promise<Uint8Array | null> {
  if (q.status === "draft" && (q.document.pricingPolicy || q.document.lines.some((l) => l.productHandle))) {
    q.document = await refreshQuotationCatalogue(q.document);
    q.total_inr = quotationTotals(q.document).total;
    const sb = supabaseAdmin();
    const saved = await sb!.from("crm_quotations").update({ document: q.document, total_inr: q.total_inr }).eq("id", q.id).eq("status", "draft");
    if (saved.error) throw saved.error;
  }
  if (!partsOf(q.document).includes(part)) return null;
  const [assets, pictures] = await Promise.all([loadBrandAssets(), loadLinePictures(q.document)]);
  return renderQuotationPdf(q.document, part, assets, { pictures });
}

/** The file name each document is attached under. */
export function quotationFilename(q: Pick<StoredQuotation, "number" | "revision">, part: QuotationPart): string {
  return `Zyvorah_${part === "supply" ? "Supply" : "Installation"}_Quotation_${partReference(q.number, part).replace(/\//g, "-")}_Rev${q.revision}.pdf`;
}

export async function renderStoredSpecSheets(q: StoredQuotation): Promise<Uint8Array | null> {
  if (!q.spec_sheets.length) return null;
  const assets = await loadBrandAssets();
  return renderSpecSheetsPdf(q.spec_sheets, assets);
}

/** What a drafted email attaches: the supply quotation, the installation
 *  quotation, the specification sheets. "quotation" is the kind drafts
 *  carried before the split (6 October 2026) and means both documents. */
export type DraftAttachmentKind = QuotationPart | "spec" | "quotation";
export type DraftAttachmentRef = { quotation_id: string; kind: DraftAttachmentKind; filename: string };

/** The attachment references a prepared quotation's email carries. */
export function draftAttachmentRefs(q: Pick<StoredQuotation, "id" | "number" | "revision" | "document">, specFilename: string): DraftAttachmentRef[] {
  return [
    ...partsOf(q.document).map((part): DraftAttachmentRef => ({ quotation_id: q.id, kind: part, filename: quotationFilename(q, part) })),
    { quotation_id: q.id, kind: "spec", filename: specFilename },
  ];
}

/** The files a drafted email's stored option names, rendered. A reference to
 *  a quotation that no longer exists, or one already superseded, is refused:
 *  an email must never carry a revision the CRM has moved past. */
export async function renderDraftAttachments(refs: DraftAttachmentRef[]): Promise<MailAttachment[]> {
  const out: MailAttachment[] = [];
  for (const ref of refs) {
    const q = await fetchQuotation(ref.quotation_id);
    if (!q) throw new Error(`attachment refers to a quotation that does not exist`);
    if (q.status === "superseded") throw new Error(`quotation ${quotationLabel(q.number, q.revision)} has been superseded — open the newer draft`);
    if (ref.kind === "spec") {
      const bytes = await renderStoredSpecSheets(q);
      if (bytes) out.push({ filename: ref.filename, contentType: "application/pdf", content: bytes });
      continue;
    }
    // A pre-split "quotation" reference expands to both documents, each under
    // its own name; a part reference renders that part.
    const parts: QuotationPart[] = ref.kind === "quotation" ? partsOf(q.document) : [ref.kind];
    for (const part of parts) {
      const bytes = await renderStoredQuotation(q, part);
      if (!bytes) continue;
      out.push({ filename: ref.kind === "quotation" ? quotationFilename(q, part) : ref.filename, contentType: "application/pdf", content: bytes });
    }
  }
  return out;
}

/** After the email has actually left: the quotation is sent, the deal is quoted. */
export async function recordQuotationSent(
  refs: DraftAttachmentRef[],
  sent: { messageId: string | null; to: string[]; cc: string[]; emailUnedited: boolean },
): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const ids = [...new Set(refs.map((r) => r.quotation_id))];
  for (const id of ids) {
    const q = await fetchQuotation(id);
    if (!q) continue;
    // "Unedited" is the automation tally (Roheena, 6 October 2026: six in a
    // row without a change, after 5 December): the first revision, sent
    // with the drafted subject and body untouched.
    const unedited = sent.emailUnedited && q.revision === 1;
    await sb.from("crm_quotations").update({
      status: "sent", sent_at: new Date().toISOString(), sent_message_id: sent.messageId, sent_to: { to: sent.to, cc: sent.cc },
      sent_unedited: unedited,
    }).eq("id", id);
    if (q.deal_id) {
      await sb.from("crm_deals").update({ stage: "quoted", value_inr: q.total_inr }).eq("id", q.deal_id).in("stage", ["new", "qualified"]);
    }
  }
}
