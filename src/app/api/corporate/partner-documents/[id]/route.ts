import { createHash } from "node:crypto";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { caDownload } from "@/lib/corporate-art-store";
import {
  canReadPartnerDocuments,
  PARTNER_DOCUMENTS,
} from "@/lib/partner-documents";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await currentCorporateSession();
  if (!session)
    return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await context.params;
  const document = PARTNER_DOCUMENTS.find((entry) => entry.id === id);
  if (!document)
    return Response.json({ error: "Document not found" }, { status: 404 });
  if (!canReadPartnerDocuments(session, document.accountSlug))
    return Response.json(
      { error: "Partner account required" },
      { status: 403 },
    );

  const { data, error } = await caDownload(document.storagePath);
  if (error || !data)
    return Response.json(
      { error: "Document is temporarily unavailable" },
      { status: 502 },
    );
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (
    bytes.byteLength !== document.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== document.sha256
  )
    return Response.json(
      { error: "Document is temporarily unavailable" },
      { status: 502 },
    );

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${document.filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
