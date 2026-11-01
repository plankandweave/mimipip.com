import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { prepareQuotation } from "@/lib/quotation/prepare";
import { fetchQuotation, quotationFilename, renderStoredQuotation, renderStoredSpecSheets } from "@/lib/quotation/store";

export const runtime = "nodejs";
// Opus reads a company's whole CRM context and writes the take-off and the email.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * The quotation desk's staff door.
 *
 *   POST { company_id, deal_id?, instruction? }
 *        → prepares a numbered quotation with its specification sheets and
 *          covering email, parked under a task on the company page for Send.
 *          Nothing is sent here.
 *   GET  ?id=<quotation id>&kind=supply|install|spec
 *        → that PDF, rendered from the stored quotation: the supply
 *          quotation (Magnitude Brands), the installation quotation
 *          (Magnitude Spaces) or the specification sheets.
 *
 * Gated on the staff sign-in before anything else: POST spends tokens and GET
 * serves a priced offer.
 */

export async function POST(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const body = await req.json().catch(() => null);
  const companyId = typeof body?.company_id === "string" ? body.company_id : "";
  if (!companyId) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim().slice(0, 2000) : null;
  const dealId = typeof body?.deal_id === "string" && body.deal_id ? body.deal_id : null;
  try {
    const result = await prepareQuotation({ companyId, dealId, instruction, preparedBy: "staff", evidence: "Prepared from the company page." });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[crm/quotation] prepare failed:", e);
    return NextResponse.json({ error: "prepare_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function GET(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const raw = url.searchParams.get("kind");
  const kind = raw === "spec" ? "spec" : raw === "install" ? "install" : "supply";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  const q = await fetchQuotation(id);
  if (!q) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const bytes = kind === "spec" ? await renderStoredSpecSheets(q) : await renderStoredQuotation(q, kind);
    if (!bytes) return NextResponse.json({ error: kind === "spec" ? "no_sheets" : "no_such_part" }, { status: 404 });
    const name = kind === "spec"
      ? `Zyvorah_product_specification_${q.number.split("/").pop()}.pdf`
      : quotationFilename(q, kind);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[crm/quotation] render failed:", e);
    return NextResponse.json({ error: "quotation_needs_review", detail: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}
