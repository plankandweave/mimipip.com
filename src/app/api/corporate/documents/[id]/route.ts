import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { fetchPartnerDocumentPdf } from "@/lib/corporate-os";

export const dynamic = "force-dynamic";

// GET -> one of this account's own documents, as a PDF.
//
// The partner has no login to the OS and never will, so the document is fetched
// server-side and streamed through. The account is taken from the SESSION, never
// from the request: a signed-in partner asking for a document id that is not
// theirs gets the OS's 404, because the OS re-checks ownership from the
// document's own order rather than trusting us to have asked correctly.
//
// Not cached, and marked no-store: a tax invoice is not something to leave in a
// shared cache on the way to somebody's browser.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pdf = await fetchPartnerDocumentPdf(session.account.slug, id);
  if (!pdf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "no-store, private",
    },
  });
}
