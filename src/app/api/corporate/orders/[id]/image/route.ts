import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { caDownload } from "@/lib/corporate-art-store";

export const dynamic = "force-dynamic";

/**
 * Thumbnail for an order's artwork on the partner's dashboard.
 *
 * An order's art comes from one of three places: their approved library, their
 * own upload, or the public catalogue. The first two now live in the private
 * corporate-art bucket and cannot be linked to directly, so they are streamed
 * through here; a catalogue image is public and simply redirected to.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await currentCorporateSession();
  if (!session) return new NextResponse("Not signed in", { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return new NextResponse("Unavailable", { status: 503 });

  const { data: order, error } = await sb
    .from("corporate_orders")
    .select("design_url, account_id")
    .eq("id", id)
    .eq("account_id", session.account.id)
    .single();

  if (error || !order?.design_url) return new NextResponse("Not found", { status: 404 });

  const url = String(order.design_url);
  const pathMatch = url.match(/\/storage\/v1\/object\/(?:public\/)?corporate-art\/(.+)$/);
  if (!pathMatch) return NextResponse.redirect(url); // public catalogue image

  // The reference keeps its Supabase spelling; the bytes come from R2.
  const img = await caDownload(decodeURIComponent(pathMatch[1]!));
  if (img.error || !img.data) return new NextResponse("Image unavailable", { status: 502 });

  return new NextResponse(new Uint8Array(await img.data.arrayBuffer()), {
    headers: {
      "Content-Type": img.data.type || "image/jpeg",
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
