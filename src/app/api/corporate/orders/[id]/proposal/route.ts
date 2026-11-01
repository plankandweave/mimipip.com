import { partnerCapabilities } from "@/lib/partner-capabilities";
import { istDateKey } from "@/lib/ist";
import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { OrderCopyItem } from "@/lib/order-copy";
import { renderOrderCopyRemote } from "@/lib/media-client";
import { sendEmail } from "@/lib/email";
import type { CropData } from "@/lib/visualizer";
import { DAY, artPathOf, proposalPath, signArt } from "@/lib/corporate-files";
import { caUpload } from "@/lib/corporate-art-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A corporate partner quotes their own client before anyone pays. This renders
// the order as a PROPOSAL PDF (validity date, list → discount → net → GST, no
// tax-invoice language), stores it against the order, and optionally emails it
// onward. Retail gets its order copy at checkout; corporate needs one earlier,
// because the money only moves once the partner's client has said yes.
//
// Regenerable while the order is still a draft — once frozen the price is
// locked and the stored PDF is the version their client was shown.

const MM_PER_CM = 10;

/** The partner's own way in. Signs fresh on every click, so the link on their
 *  dashboard works for as long as the order exists — no stored signature to go
 *  stale. Session-gated and scoped to their account. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await currentCorporateSession();
  if (!session) return new NextResponse("Not signed in", { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  const sb = supabaseAdmin();
  if (!sb) return new NextResponse("Unavailable", { status: 503 });

  const { id } = await ctx.params;
  const { data } = await sb.from("corporate_orders")
    .select("order_ref, proposal_url").eq("id", id).eq("account_id", session.account.id).maybeSingle();
  if (!data) return new NextResponse("Not found", { status: 404 });

  const o = data as { order_ref: string; proposal_url: string | null };
  if (!o.proposal_url) return new NextResponse("No proposal yet", { status: 404 });

  const path = artPathOf(o.proposal_url) ?? proposalPath(session.account.slug, o.order_ref);
  const url = await signArt(sb, path, DAY);
  if (!url) return new NextResponse("Could not open the proposal", { status: 500 });
  return NextResponse.redirect(url);
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
  let body: { sendTo?: string; message?: string } = {};
  try { body = await req.json(); } catch { /* body is optional */ }

  const { data: order } = await sb.from("corporate_orders")
    .select("*").eq("id", id).eq("account_id", session.account.id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const o = order as Record<string, unknown>;
  const num = (v: unknown) => Number(v ?? 0);

  const acc = session.account;

  // Frozen orders keep the PDF their client already saw — re-rendering after a
  // catalogue price change would silently move a committed quote. The bytes
  // stay put; only the signature is refreshed, so an old link never rots.
  if (o.frozen_at && o.proposal_url) {
    const path = artPathOf(String(o.proposal_url)) ?? proposalPath(acc.slug, String(o.order_ref));
    const url = await signArt(sb, path, 90 * DAY);
    if (!url) return NextResponse.json({ error: "Could not open the saved proposal." }, { status: 500 });
    return NextResponse.json({ ok: true, proposalUrl: url, regenerated: false });
  }
  const widthCm = num(o.width_mm) / MM_PER_CM;
  const heightCm = num(o.height_mm) / MM_PER_CM;

  // Corporate rows store the OS-shaped placement ({zoom, cropX, cropY}), not
  // the retail CropData ({offsetX, offsetY, …}) the PDF renderer reads —
  // rebuild a CropData from it so the proposal shows the confirmed framing
  // instead of silently falling back to a centred crop.
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
    lineTotal: num(o.amount),
    crop,
    previewUrl: (o.design_url as string | null) ?? null,
  };

  const listAmount = num(o.list_amount) || num(o.amount);
  const discountAmount = num(o.discount_amount);
  // Billed area above the artwork's rectangle means the media floor bound
  // (migration 0106) — say so on the proposal rather than leaving the partner
  // to wonder why 24 sq ft of art bills as 48.
  const floorBound = num(o.min_billable_width_mm) > 0
    && num(o.area_sqft) > num(o.full_area_sqft) + 0.001;
  const service = o.service_breakdown as { wallpaper: number; customisation: number } | null;
  const lines = service ? [
    { label: "Wallpaper after AID discount (GST included)", amount: service.wallpaper },
    { label: "Customisation - no discount (GST included)", amount: service.customisation },
  ] : [
    { label: `${num(o.area_sqft).toFixed(2)} sq ft at Rs ${num(o.rate_per_sqft)}/sq ft`
        + (floorBound ? ` (min. billable width ${num(o.min_billable_width_mm)} mm of roll)` : ""),
      amount: listAmount, strike: discountAmount > 0 },
    ...(discountAmount > 0
      ? [{ label: `Partner discount ${num(o.discount_pct)}%`, amount: -discountAmount },
         { label: "Net", amount: num(o.amount) }]
      : []),
    { label: `GST ${num(o.gst_pct)}%`, amount: num(o.gst_amount) },
  ];

  const validity = Number(acc.proposal_validity_days ?? 30);
  const validUntilDate = new Date(Date.now() + validity * 86_400_000);
  const validUntil = validUntilDate.toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata",
  });

  let bytes: Uint8Array;
  try {
    // A corporate account, by definition — freight on their orders is to-pay.
    // Rendered in the media container (order-copy.ts imports sharp, which
    // workerd cannot run); everything in items/opts here is plain JSON and the
    // renderer fetches previewUrl itself.
    bytes = await renderOrderCopyRemote([item], {
      freightToPay: true,
      reference: String(o.order_ref),
      proposal: { accountName: acc.name, validUntil, lines, total: num(o.total) },
    });
  } catch (e) {
    console.error("[corporate/proposal] render failed:", e);
    return NextResponse.json({ error: "Could not build the proposal PDF." }, { status: 500 });
  }

  const path = proposalPath(acc.slug, String(o.order_ref));
  const up = await caUpload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
  if (up.error) {
    console.error("[corporate/proposal] upload failed:", up.error.message);
    return NextResponse.json({ error: "Could not save the proposal." }, { status: 500 });
  }

  // The bucket is private: a signature is the only fetchable link. The client's
  // copy must outlive the quote it is quoting, so it is signed for the validity
  // window plus a wide grace — a proposal chased up two months late should
  // still open rather than 400 at the person deciding whether to buy.
  const proposalUrl = await signArt(sb, path, (validity + 60) * DAY);
  if (!proposalUrl) return NextResponse.json({ error: "Could not save the proposal." }, { status: 500 });

  // We store the PATH, not the signature — signatures expire, paths do not, and
  // the partner's own link re-signs on every click (GET below).
  await sb.from("corporate_orders").update({
    proposal_url: path,
    proposal_valid_until: istDateKey(validUntilDate),
  }).eq("id", id);

  // Optional hand-off to the partner's own client.
  const sendTo = (body.sendTo ?? "").trim();
  let emailed = false;
  if (sendTo) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sendTo)) {
      return NextResponse.json({ error: "That doesn't look like a valid email address." }, { status: 400 });
    }
    emailed = await sendEmail({
      to: sendTo,
      replyTo: session.email,
      subject: `Wallpaper proposal ${o.order_ref} — ${item.productTitle}`,
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
        <p style="font-size:14px;color:#475569">${escapeHtml(acc.name)} has prepared a wallpaper proposal for you.</p>
        ${body.message ? `<p style="font-size:14px;color:#0f172a">${escapeHtml(body.message)}</p>` : ""}
        <p style="font-size:15px;color:#0f172a;margin:16px 0">
          <strong>${escapeHtml(item.productTitle)}</strong><br>
          ${(widthCm / 30.48).toFixed(1)} × ${(heightCm / 30.48).toFixed(1)} ft · ${num(o.area_sqft).toFixed(1)} sq ft
        </p>
        <p style="margin:20px 0">
          <a href="${proposalUrl}" style="background:#0f172a;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none;font-size:14px">
            View the proposal (PDF)
          </a>
        </p>
        <p style="font-size:12px;color:#64748b">Valid until ${validUntil}. This is a proposal, not a tax invoice.</p>
        <p style="font-size:12px;color:#94a3b8;margin-top:22px">Zyvorah · made-to-order wallpaper</p>
      </div>`,
    });
    if (!emailed) {
      // The PDF is saved either way — say so rather than implying it vanished.
      return NextResponse.json({
        ok: true, proposalUrl, emailed: false,
        warning: "Proposal saved, but we couldn't email it just now. You can download and send it yourself.",
      });
    }
  }

  return NextResponse.json({ ok: true, proposalUrl, emailed });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
