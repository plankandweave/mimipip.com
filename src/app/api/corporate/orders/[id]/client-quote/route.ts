import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { currentCorporateSession, recordAudit } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ClientQuoteMeta, OrderCopyItem } from "@/lib/order-copy";
import { renderOrderCopyRemote } from "@/lib/media-client";
import type { CropData } from "@/lib/visualizer";
import { DAY, artPathOf, signArt } from "@/lib/corporate-files";
import { caUpload } from "@/lib/corporate-art-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The SHOWROOM sign-off document (migration 0125): the partner's own order
// copy for the client standing at their counter — partner logo, the wall, and
// ONE amount, the website LIST price with taxes in. The partner's cost (list −
// discount) never appears here; that gap is their margin and this PDF renders
// on a screen their client is looking at. The proposal route stays what it is
// (our commercial chain, for partners who pass our pricing through).
//
// Deliberately not a legal document: no GSTIN, no tax breakup, and it says
// "not a tax invoice" twice. `proforma: true` renders the pro forma variant —
// built so a partner asking for it is a copy change, not a feature — but no UI
// sends it today.

const MM_PER_CM = 10;

/** The partner's way back to the saved PDF — re-signed on every click. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await currentCorporateSession();
  if (!session) return new NextResponse("Not signed in", { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  const sb = supabaseAdmin();
  if (!sb) return new NextResponse("Unavailable", { status: 503 });

  const { id } = await ctx.params;
  const { data } = await sb.from("corporate_orders")
    .select("client_quote_url").eq("id", id).eq("account_id", session.account.id).maybeSingle();
  if (!data) return new NextResponse("Not found", { status: 404 });

  const path = artPathOf((data as { client_quote_url: string | null }).client_quote_url)
    ?? (data as { client_quote_url: string | null }).client_quote_url;
  if (!path) return new NextResponse("No client copy yet", { status: 404 });
  const url = await signArt(sb, path, DAY);
  if (!url) return new NextResponse("Could not open the client copy", { status: 500 });
  return NextResponse.redirect(url);
}

/** Partner logos come in two shapes (migration 0049): a site-relative path
 *  ('/corporate/vijay-sales.png', a file in this repo's public/) or a full
 *  public URL written by the OS. Either way the RENDERER (in the media
 *  container) fetches the bytes — workerd has no fs, so a site-relative path
 *  becomes its public URL. */
function logoUrlFor(logoPath: string): string {
  if (logoPath.startsWith("/")) {
    const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://zyvorah.com").replace(/\/$/, "");
    return `${origin}${logoPath}`;
  }
  return logoPath;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  // Agreement gate (0095): no mutations on an account that has not signed.
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { id } = await ctx.params;
  let body: { clientName?: string; clientRef?: string; signatureDataUrl?: string; proforma?: boolean } = {};
  try { body = await req.json(); } catch { /* all fields optional but clientName */ }

  const clientName = (body.clientName ?? "").trim();
  if (!clientName) return NextResponse.json({ error: "Enter your client's name." }, { status: 400 });
  const clientRef = (body.clientRef ?? "").trim() || null;

  const acc = session.account;
  const { data: order } = await sb.from("corporate_orders")
    .select("*").eq("id", id).eq("account_id", acc.id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const o = order as Record<string, unknown>;

  const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

  // The selling figure: website list price + tax. list_amount is the ex-GST
  // list the order was priced against (it tracks zyvorah.com for website-mode
  // partners); a flat-rate account with no list falls back to its own total —
  // there is no margin to protect where cost IS the only price.
  const listExGst = num(o.list_amount) || num(o.amount);
  const totalIncTax = Math.round(listExGst * (1 + num(o.gst_pct) / 100));

  const widthCm = num(o.width_mm) / MM_PER_CM;
  const heightCm = num(o.height_mm) / MM_PER_CM;

  // Same placement rebuild as the proposal route: corporate rows store the
  // OS-shaped {zoom, cropX, cropY}, the renderer reads retail CropData.
  const cd = (o.crop_data as Record<string, unknown> | null) ?? null;
  const crop: CropData | null = cd
    ? ("offsetX" in cd
        ? cd as unknown as CropData
        : {
            imageUrl: String(o.design_url ?? ""),
            wallWidthCm: widthCm,
            wallHeightCm: heightCm,
            offsetX: Math.min(1, Math.max(0, num(cd.cropX ?? 0.5))),
            offsetY: Math.min(1, Math.max(0, num(cd.cropY ?? 0.5))),
            zoom: Math.min(8, Math.max(1, num(cd.zoom ?? 1))),
            ...(cd.flipH ? { flipH: true } : {}),
            ...(cd.flipV ? { flipV: true } : {}),
            ...(num(o.design_w_px) > 0 && num(o.design_h_px) > 0
              ? {
                  imageAspect: num(o.design_w_px) / num(o.design_h_px),
                  sourceW: num(o.design_w_px),
                  sourceH: num(o.design_h_px),
                }
              : {}),
          })
    : null;

  const item: OrderCopyItem = {
    productTitle: String(o.print_name || "Custom wall"),
    materialName: String(o.material_slug || "Smooth matt"),
    materialSlug: (o.material_slug as string | null) ?? undefined,
    widthCm,
    heightCm,
    areaSqft: num(o.area_sqft),
    quantity: 1,
    // Never drawn in clientQuote mode (the renderer suppresses per-line
    // amounts) — carried only so the shared layout's types stay honest.
    lineTotal: num(o.amount),
    crop,
    previewUrl: (o.design_url as string | null) ?? null,
  };

  const signedAt = body.signatureDataUrl ? new Date() : null;
  // The old inline conversion ran here and 400'd on garbage before rendering;
  // it now happens in the media container, so the pre-flight is a shape check
  // on the payload itself.
  if (body.signatureDataUrl && !/^data:image\//.test(body.signatureDataUrl)) {
    return NextResponse.json({ error: "Couldn't read the signature — try signing again." }, { status: 400 });
  }

  const meta: ClientQuoteMeta & { logoUrl?: string; signatureDataUrl?: string } = {
    partnerName: acc.name,
    logo: null,
    clientName,
    clientRef,
    totalIncTax,
    signature: null,
    signedAtLabel: signedAt
      ? signedAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
      : null,
    proforma: body.proforma === true,
    // Resolved to Buffers by the container's own helpers — the same code this
    // route used to run in-process.
    ...(acc.logo_path ? { logoUrl: logoUrlFor(acc.logo_path) } : {}),
    ...(body.signatureDataUrl ? { signatureDataUrl: body.signatureDataUrl } : {}),
  };

  let bytes: Uint8Array;
  try {
    bytes = await renderOrderCopyRemote([item], {
      reference: String(o.os_print_order_no ?? o.order_ref),
      clientQuote: meta,
    });
  } catch (e) {
    console.error("[corporate/client-quote] render failed:", e);
    return NextResponse.json({ error: "Could not build the order copy." }, { status: 500 });
  }

  const path = `client-quotes/${acc.slug}/${String(o.order_ref)}.pdf`;
  const up = await caUpload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
  if (up.error) {
    console.error("[corporate/client-quote] upload failed:", up.error.message);
    return NextResponse.json({ error: "Could not save the order copy." }, { status: 500 });
  }

  await sb.from("corporate_orders").update({
    client_name: clientName,
    client_ref: clientRef,
    client_quote_url: path,
    // A re-render without a fresh signature keeps the original signed moment.
    ...(signedAt ? { client_signed_at: signedAt.toISOString() } : {}),
  }).eq("id", id);

  await recordAudit(session, "order.client_quote", { type: "order", id }, {
    clientName, clientRef, signed: Boolean(body.signatureDataUrl), totalIncTax,
  });

  const url = await signArt(sb, path, 90 * DAY);
  return NextResponse.json({ ok: true, quoteUrl: url, signed: Boolean(body.signatureDataUrl), totalIncTax });
}
