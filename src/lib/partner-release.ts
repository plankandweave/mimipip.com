import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mintOrderNumber } from "@/lib/order-number";
import { pushCorporateOrderToOs } from "@/lib/corporate-os";
import { dispatchDateIst } from "@/lib/partner-workspace-validation";
import type { CorporateAccount } from "@/lib/corporate-auth";
import type { PricedLine, ShipProfile } from "@/lib/corporate-project";
import { caDownload } from "@/lib/corporate-art-store";
type PackageLine = {
  optionId: string;
  roomName: string;
  wallIdentifier: string;
  specification: PricedLine & {
    productionStock: { mediaCode: string; application: string };
    gstPct: number;
    masterImage?: { sha256: string };
  };
  specifiedBy: string;
  decisionBy: string;
  decisionAt: string;
};
/** Persisted line identifiers survive retries, ambiguous network timeouts and partial packages. */
export async function drainPartnerReleases() {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("Database unavailable");
  const token = randomUUID();
  const { data: claims, error } = await sb.rpc("partner_claim_releases", {
    p_limit: 1,
    p_token: token,
  });
  if (error) throw new Error(error.message);
  const started = Date.now();
  let processed = 0;
  for (const claim of claims ?? []) {
    let failure: string | null = null;
    try {
      const { data: c, error: ce } = await sb
        .from("partner_private_confirmations")
        .select("*")
        .eq("id", claim.confirmation_id)
        .not("po_accepted_at", "is", null)
        .single();
      if (ce || !c) throw new Error("Accepted confirmation unavailable");
      const { data: ar } = await sb
        .from("corporate_accounts")
        .select("*")
        .eq("id", c.account_id)
        .single();
      if (!ar) throw new Error("Account unavailable");
      const acc = ar as CorporateAccount;
      const { data: project } = await sb
        .from("partner_private_projects")
        .select("customer_id")
        .eq("id", c.project_id)
        .single();
      if (!project) throw new Error("Customer unavailable");
      const { data: po } = await caDownload(c.po_path);
      if (!po) throw new Error("Accepted PO document unavailable");
      const { data: lines } = await sb
        .from("partner_release_lines")
        .select("*")
        .eq("confirmation_id", c.id)
        .order("option_id");
      for (const persisted of lines ?? []) {
        if (persisted.acknowledged_at) continue;
        if (Date.now() - started > 20000) break;
        // Renew/fence before the remote call. Its 30 s timeout stays well inside the lease.
        const renewed = await sb
          .from("partner_release_outbox")
          .update({ lease_until: new Date(Date.now() + 240000).toISOString() })
          .eq("confirmation_id", c.id)
          .eq("lease_token", token)
          .eq("state", "leased")
          .select("confirmation_id")
          .maybeSingle();
        if (!renewed.data) throw new Error("Release lease lost");
        const entry = (c.package as PackageLine[]).find(
          (l) => l.optionId === persisted.option_id,
        );
        if (!entry) throw new Error("Pinned line missing");
        const line = entry.specification;
        const ship = c.shipping as ShipProfile;
        let ref = persisted.order_ref as string | null;
        if (!ref) {
          const mint = await mintOrderNumber(
            `corp-order-${persisted.order_id}`,
            "dealer",
          );
          if (!mint) throw new Error("Order issuer unavailable");
          ref = mint.ref;
          const { error: e } = await sb.rpc("partner_release_ack", {
            p_confirmation: c.id,
            p_option: persisted.option_id,
            p_token: token,
            p_ref: ref,
            p_os: null,
          });
          if (e) throw new Error(e.message);
        }
        const order = {
          id: persisted.order_id,
          account_id: acc.id,
          partner_confirmation_id: c.id,
          partner_option_id: entry.optionId,
          order_ref: ref,
          group_ref: c.id,
          placed_by_email: c.confirmed_by,
          print_name: `${project.customer_id} / ${entry.roomName} / ${entry.wallIdentifier} / ${line.printName}`,
          po_number: c.po_number,
          po_url: c.po_path,
          po_received_at: c.po_accepted_at,
          design_url: line.designUrl,
          design_ref: line.designRef,
          design_w_px: line.designWpx,
          design_h_px: line.designHpx,
          crop_data: line.placement,
          width_mm: line.widthMm,
          height_mm: line.heightMm,
          area_sqft: line.price.areaSqft,
          full_area_sqft: line.price.fullAreaSqft,
          excluded_sqft: line.price.excludedSqft,
          min_billable_width_mm: line.price.minBillableWidthMm,
          print_type: line.printType,
          openings: line.openings.snapshot,
          rate_per_sqft: line.price.ratePerSqft,
          amount: line.price.amount,
          gst_pct: line.gstPct,
          gst_amount: line.price.gstAmount,
          total: line.price.total,
          list_amount: line.price.listAmount,
          discount_pct: line.price.discountPct,
          discount_amount: line.price.discountAmount,
          product_handle: line.productHandle,
          material_slug: line.materialSlug,
          state: ship.state,
          gstin: ship.gstin,
          ship_address: ship.address_line,
          ship_city: ship.city,
          ship_pincode: ship.pincode,
          ship_contact_name: ship.contact_name,
          ship_contact_phone: ship.contact_phone,
          status: "submitted",
        };
        const { error: insertError } = await sb
          .from("corporate_orders")
          .upsert(order, { onConflict: "id", ignoreDuplicates: true });
        if (insertError) throw new Error(insertError.message);
        const pushed = await pushCorporateOrderToOs({
          orderRef: ref,
          lineRef: entry.optionId,
          groupRef: c.id,
          accountName: c.release_policy.accountName,
          channel: c.release_policy.channel,
          placedByEmail: c.confirmed_by,
          poNumber: c.po_number,
          printName: order.print_name,
          designUrl: line.designUrl,
          designRef: line.designRef,
          widthMm: line.widthMm,
          heightMm: line.heightMm,
          amountInr: line.price.total,
          ratePerSqft: line.price.ratePerSqft,
          discountPct: line.price.discountPct,
          listAmount: line.price.listAmount,
          gstin: ship.gstin,
          state: ship.state,
          shipAddress: ship.address_line,
          shipCity: ship.city,
          shipPincode: ship.pincode,
          billingAddress: (c.shipping as Record<string, string>)
            .billing_address,
          shipContactName: ship.contact_name,
          shipContactPhone: ship.contact_phone,
          placement: line.placement,
          openings: line.openings.engineOpenings,
          excludedSqft: line.price.excludedSqft,
          chargeableSqft: line.openings.chargeableSqft,
          minBillableWidthMm: line.price.minBillableWidthMm,
          billedSqft: line.price.areaSqft,
          printType: line.printType,
          printRules: line.printRules,
          printGate: c.release_policy.printGate,
          material: line.productionStock.application,
          mediaCode: line.productionStock.mediaCode,
          artworkSha256: line.masterImage?.sha256,
          materialSlug: line.materialSlug ?? undefined,
          customerId: project.customer_id,
          roomName: entry.roomName,
          wallIdentifier: entry.wallIdentifier,
          release: {
            confirmationRef: c.id,
            audit: {
              specifiedBy: entry.specifiedBy,
              decisionBy: entry.decisionBy,
              decisionAt: new Date(entry.decisionAt).toISOString(),
              confirmedBy: c.confirmed_by,
              confirmedAt: new Date(c.created_at).toISOString(),
              poUploadedBy: c.po_uploaded_by,
              poAcceptedAt: new Date(c.po_accepted_at).toISOString(),
              confirmationVersion: c.version,
            },
            poAcceptedAt: new Date(c.po_accepted_at).toISOString(),
            promisedDispatchDate: dispatchDateIst(c.promised_dispatch_at),
            promiseDays: c.release_policy.dispatchPromiseDays,
            poDocument: {
              url: `https://zyvorah.com/api/corporate/private-workspace/confirmations/${c.id}/document`,
              sha256: c.po_sha256,
              contentType: c.po_mime,
              bytes: po.size,
            },
          },
        });
        if (!pushed.ok || !pushed.osOrderId)
          throw new Error(pushed.error ?? "OS did not acknowledge the line");
        const { error: ackError } = await sb.rpc("partner_release_ack", {
          p_confirmation: c.id,
          p_option: entry.optionId,
          p_token: token,
          p_ref: ref,
          p_os: pushed.osOrderId,
        });
        if (ackError) throw new Error(ackError.message);
        processed++;
      }
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }
    const { error: finishError } = await sb.rpc("partner_release_finish", {
      p_confirmation: claim.confirmation_id,
      p_token: token,
      p_error: failure,
    });
    if (finishError) throw new Error(finishError.message);
  }
  return { claimed: claims?.length ?? 0, processed };
}
