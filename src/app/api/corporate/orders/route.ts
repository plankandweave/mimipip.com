import { receiverMobile } from "@/lib/receiver-mobile";
import { labelFor } from "@/lib/partner-stage-label";
import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse, after } from "next/server";
import { checkShipTo } from "@/lib/corporate-ship-to";
import { resolvePincode } from "@/lib/pincode-resolver";
import { randomUUID } from "node:crypto";
import { checkGstin, gstinStateMismatch } from "@/lib/gstin";
import { can, currentCorporateSession, priceWall, priceWallFromCatalogue, recordAudit, shipStateAllowed, sizeRejection } from "@/lib/corporate-auth";
import { getProductByHandle } from "@/lib/queries";
import { isExclusiveTier } from "@/lib/pricing";
import { exclusivesBlocked } from "@/lib/partner-capabilities";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mintOrderNumber } from "@/lib/order-number";
import { recordCommercialEvent } from "@/lib/server-events";
import { pushCorporateOrderToOs, fetchOsStatuses, fetchPartnerMirror } from "@/lib/corporate-os";
import { orderNosAtPrinter, partnerMayRequestCancel } from "@/lib/cancel-window";
import { minBillableWidthMm, printRulesFor, resolvePrintType, validPrintType } from "@/lib/print-types";
import { parseOpenings, planWallOpenings } from "@/lib/corporate-openings";
import { partnerWorkflow } from "@/lib/ai-keys";
import {
  classifyAttention, hoursWaiting, rememberSettled, syncAttention, waitingLabel, firstStuckAt, ESCALATE_AFTER_HOURS,
} from "@/lib/corporate-attention";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET  -> every order for the signed-in company (all showrooms), each row
//         carrying live production + dispatch status pulled from the OS.
// POST -> place a new print order (or a repeat of an earlier one).

export async function GET() {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { data } = await sb.from("corporate_orders")
    .select("*").eq("account_id", session.account.id)
    .order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as Record<string, unknown>[];

  // Live status straight from the OS (production truth), merged over our row.
  const ids = rows.map(r => r.os_order_id).filter((n): n is number => typeof n === "number");

  // The same account as production holds it. The portal's own table only knows
  // what was ordered THROUGH the portal, so a wall taken at our desk and every
  // document we have ever raised were invisible here — including the tax
  // invoice this partner is meant to pay against. Degrades to the old view if
  // the OS is unreachable; it must never take the page down.
  const mirror = await fetchPartnerMirror(session.account.slug);
  const knownOsIds = new Set(ids);
  const deskRows = mirror.orders.filter(o => !o.viaPortal && !knownOsIds.has(o.osOrderId));
  const allIds = [...new Set([...ids, ...deskRows.map(o => o.osOrderId)])];
  // The OS accepts at most 300 IDs per call.
  const chunks = Array.from({ length: Math.ceil(allIds.length / 300) }, (_, i) => allIds.slice(i * 300, (i + 1) * 300));
  const statuses = Object.assign({}, ...await Promise.all(chunks.map(fetchOsStatuses))) as Awaited<ReturnType<typeof fetchOsStatuses>>;
  const deskOrders = deskRows.map(o => ({ ...o, os: statuses[o.osOrderId] ?? null,
    stageLabel: labelFor(statuses[o.osOrderId] ?? { ...o }, "received"),
  }));

  // Remember the ZVY number the moment production tells us it exists.
  //
  // It is the number on the job sheet, the courier label and the invoice, and
  // it is now the reference the partner sees — so it cannot only live in a live
  // OS response that a slow or unreachable OS would blank. Written once, when
  // it changes; every historic order picks its number up on the first load
  // after this ships, so nothing needs backfilling by hand.
  const learned = rows.flatMap((r) => {
    const os = typeof r.os_order_id === "number" ? statuses[r.os_order_id] : undefined;
    const no = os?.printOrderNo;
    return no && no !== r.os_print_order_no ? [{ id: r.id as string, no }] : [];
  });
  if (learned.length) {
    await Promise.all(learned.map(({ id, no }) =>
      sb.from("corporate_orders").update({ os_print_order_no: no }).eq("id", id),
    ));
    for (const { id, no } of learned) {
      const row = rows.find(r => r.id === id);
      if (row) row.os_print_order_no = no;
    }
  }

  // A wall the OS has finished is remembered on our row, so a read where the
  // OS does not answer still keeps it out of "In production".
  const settled = await rememberSettled(sb, rows as Parameters<typeof rememberSettled>[1], statuses);
  for (const [id, status] of settled) {
    const row = rows.find(r => r.id === id);
    if (row) row.status = status;
  }

  // Keep the attention bookkeeping current from the same statuses we just
  // fetched — it costs nothing here, and it means an order a partner has looked
  // at is already stamped for the escalation sweep. Awaited so the ages we
  // return below are the ones we just wrote, not the previous read's.
  const osIdOf = (row: { id: string }) => {
    const hit = rows.find(r => r.id === row.id);
    return typeof hit?.os_order_id === "number" ? hit.os_order_id : null;
  };
  await syncAttention(
    sb,
    rows as Parameters<typeof syncAttention>[1],
    statuses,
    osIdOf,
  );

  // What the print engine already holds. A failed read offers no cancellation
  // anywhere rather than one on a wall that may be on the machine.
  const atPrinter = await orderNosAtPrinter(sb, rows.flatMap(r => {
    const os = typeof r.os_order_id === "number" ? statuses[r.os_order_id] : undefined;
    return [r.os_print_order_no as string | null, os?.printOrderNo ?? null];
  })).catch((e) => { console.error("corporate orders: printer check failed:", e); return null; });

  const orders = rows.map(r => {
    const os = typeof r.os_order_id === "number" ? statuses[r.os_order_id] : undefined;
    const a = classifyAttention(r as Parameters<typeof classifyAttention>[0], os);
    // The clock starts when the problem started — and for a job production has
    // never progressed, that is when it was placed, not when we first looked.
    // Same rule syncAttention stamps with, so the badge and the stored value
    // can't disagree.
    const since = a
      ? ((r.attention_since as string | null) ?? firstStuckAt(r as { created_at?: string | null }, os, new Date().toISOString()))
      : null;
    const hours = hoursWaiting(since);
    const rawLabel = labelFor(os, String(r.status ?? ""));
    return {
      ...r,
      batchRef: mirror.orders.find(o => o.osOrderId === r.os_order_id)?.batchRef ?? null,
      installation: mirror.orders.find(o => o.osOrderId === r.os_order_id)?.installation ?? null,
      os: os ?? null,
      canRequestCancel: partnerMayRequestCancel(r as Parameters<typeof partnerMayRequestCancel>[0], os, atPrinter),
      // The webhook has verified the money but the OS mirror can lag a beat
      // (or the release call can be mid-retry) — "Awaiting payment" would be
      // a lie the partner just paid to stop reading. payment_status is only
      // ever 'paid' via the verified webhook (migration 0094).
      stageLabel: rawLabel === "Awaiting payment" && r.payment_status === "paid"
        ? "Paid — in production"
        : rawLabel,
      // What is wrong, whose move it is, and how long — the three things
      // "our team is on it" never said.
      attention: a
        ? {
            headline: a.headline,
            reason: a.reason,
            party: a.party,
            since,
            hours,
            waiting: waitingLabel(hours),
            /** True once it has passed the escalation threshold. */
            overdue: (hours ?? 0) >= ESCALATE_AFTER_HOURS,
            escalatedAt: (r.escalated_at as string | null) ?? null,
          }
        : null,
    };
  });
  // documents = every document we hold for this account, newest first, so the
  // partner reads the same invoice list the desk does.
  // deskOrders = their walls that were taken at our desk. Shown, not actionable:
  // the per-order buttons act on a corporate_orders row these do not have.
  const documents = [...mirror.documents].sort(
    (x, y) => String(y.createdAt ?? "").localeCompare(String(x.createdAt ?? "")),
  );
  return NextResponse.json({ ok: true, accountSlug: session.account.slug, orders, documents, deskOrders, installerOptions: can(session, "order") && !session.agreementPending ? mirror.installerOptions ?? [] : [] });
}

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!partnerCapabilities(session.account).customSizing) return NextResponse.json({ error: "Custom wall sizing is disabled." }, { status: 403 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  // Agreement gate (0095): no mutations on an account that has not signed.
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  // Placing the order is the step that spends the company's money, so it is
  // the permission their admins hand out deliberately (migration 0084).
  if (!can(session, "order")) {
    return NextResponse.json({
      error: "You don't have permission to place orders. Ask one of your account admins.",
    }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const widthMm = Math.round(num(b.widthMm));
  const heightMm = Math.round(num(b.heightMm));
  const designUrl = str(b.designUrl);
  const state = str(b.state);

  if (!designUrl) return NextResponse.json({ error: "Upload the artwork first." }, { status: 400 });
  const badSize = sizeRejection(widthMm, heightMm);
  if (badSize) return NextResponse.json({ error: `Wall ${badSize}.` }, { status: 400 });
  if (!state) return NextResponse.json({ error: "Choose the dispatch state." }, { status: 400 });

  const acc = session.account;
  if (!shipStateAllowed(acc, state)) {
    return NextResponse.json({ error: `We don't ship to ${state} on this account. Contact us at hello@zyvorah.com to add it.` }, { status: 400 });
  }
  // Destination is per ORDER (see corporate-ship-to.ts): a blank one is
  // refused here rather than guessed downstream.
  // A blank PIN is looked up, not demanded (pincode-resolver.ts). A typed
  // one is left alone.
  if (!str(b.shipPincode) && str(b.shipAddress)) {
    const found = await resolvePincode({ address: str(b.shipAddress), city: str(b.shipCity), state }, { workflow: partnerWorkflow(acc.slug) });
    if (found) b.shipPincode = found.pincode;
  }
  const shipTo = checkShipTo({ address: b.shipAddress, city: b.shipCity, pincode: b.shipPincode });
  if (!shipTo.ok) return NextResponse.json({ error: shipTo.error }, { status: 400 });
  // The courier rings this number (founder, 14 October 2026); Vijay Sales may
  // leave it blank, the OS carries that receiver's mobile itself.
  const receiver = receiverMobile(acc.slug, b.shipContactPhone);
  if (!receiver.ok) return NextResponse.json({ error: receiver.error }, { status: 400 });

  // Openings the partner marked (glass returns, full-height doors): validated
  // against the wall here, then planned server-side. The browser's numbers are
  // never trusted for area — it sends geometry, we derive the bill.
  const parsedOpenings = parseOpenings(b.openings, widthMm, heightMm);
  if (!parsedOpenings.ok) {
    return NextResponse.json({ error: `Wall openings: ${parsedOpenings.error}.` }, { status: 400 });
  }
  const openings = await planWallOpenings(widthMm, heightMm, parsedOpenings.doors);

  // Pricing is derived server-side from the account's policy — never trusted
  // from the client, which only echoes it back for display.
  //  · flat_rate → the contracted ₹/sq ft on the account (Vijay Sales)
  //  · website   → the live catalogue rate for the chosen design, less the
  //                partner discount (Moco). Prices therefore track zyvorah.com
  //                automatically instead of drifting from a copied number.
  // Partner-supplied artwork is priced as the storefront's Custom Wallpaper SKU
  // — the same product a retail customer uses to print their own image — so
  // "website rules" holds whether the design came from us or from them.
  const pickedHandle = str(b.productHandle) || null;
  const productHandle = acc.pricing_mode === "website"
    ? (pickedHandle ?? "custom-wallpaper")
    : pickedHandle;
  const materialSlug = str(b.materialSlug) || null;

  // What KIND of thing this wall is — it decides the print rules the OS
  // dispatches with (migration 0104) AND the billing floor the price is built
  // on (0106), so it is resolved BEFORE pricing. Once, at order time, and
  // stored: a category re-tagged next year must not retroactively change how
  // an order already in production prints. Own-artwork orders have no handle
  // and resolve to wallpaper. The line's own type first — a library design or
  // a band knows what it is and a flat-rate partner has no catalogue handle
  // for the server to fall back on.
  const printType = (await validPrintType(sb, b.printType))
    ?? (await resolvePrintType(sb, productHandle));
  const printRules = await printRulesFor(sb, printType);
  // The media floor (0106): a one-lane piece bills at least run length × the
  // billable web width; a nest-capable type shares the web and has none.
  const minBillable = minBillableWidthMm(printRules);

  let price;
  if (acc.pricing_mode === "website") {
    if (!materialSlug) {
      return NextResponse.json(
        { error: "Choose a material to price this order." },
        { status: 400 },
      );
    }
    const product = await getProductByHandle(productHandle!);
    if (!product) return NextResponse.json({ error: "That design is no longer available." }, { status: 400 });
    // Autograph is sold only on zyvorah.com, so it is withheld from an ONLINE
    // reseller — a partner whose storefront is the marketplace. Everyone else,
    // including a corporate account, may buy it (0127). The catalogue already
    // hides it from them; this is the gate that has to hold, because a handle
    // can arrive from anywhere and the discount would otherwise apply to it
    // like any other rate.
    // By PROPERTY, not tier name — Saanjha and Atelier are exclusive too.
    if (exclusivesBlocked(acc) && isExclusiveTier(product.price_tier)) {
      return NextResponse.json(
        { error: "Autograph designs are sold only on zyvorah.com and are not available on this account." },
        { status: 400 },
      );
    }
    const pm = (product.product_materials ?? []).find(
      (m) => m.available && m.materials?.slug === materialSlug && !m.materials?.coming_soon,
    );
    if (!pm) return NextResponse.json({ error: "That material is not available for this design." }, { status: 400 });
    price = priceWallFromCatalogue(
      widthMm, heightMm, Number(pm.price_per_sqft), Number(acc.gst_pct), Number(acc.discount_pct),
      openings.chargeableSqft, minBillable,
    );
  } else {
    price = priceWall(
      widthMm, heightMm, Number(acc.rate_per_sqft), Number(acc.gst_pct), Number(acc.discount_pct),
      openings.chargeableSqft, minBillable,
    );
  }

  // Remember this state's address + GSTIN so the next order auto-fills. One
  // GSTIN per state, shared by every showroom in it.
  // Partners paste "GSTIN: 24XXXXX..." with the label — the OS caps the field
  // at 20 chars, so a labelled paste fails every push. Keep just the number.
  // A GSTIN is checked BEFORE it is stored. This value is saved against the
  // state profile, so it auto-fills every future order into that state, and the
  // OS matches the accounting customer on it — a malformed one matches nothing
  // and silently mints a new customer instead (`27HCV3778L1ZK`, two letters
  // short, did exactly that on 12 Aug 2026). Blank stays allowed; wrong does not.
  const gstinCheck = checkGstin(b.gstin as string | null | undefined);
  if ("error" in gstinCheck) {
    return NextResponse.json({ error: gstinCheck.error }, { status: 400 });
  }
  const stateMismatch = gstinStateMismatch(gstinCheck.value, state);
  if (stateMismatch) {
    return NextResponse.json({ error: stateMismatch }, { status: 400 });
  }

  const profile = {
    account_id: acc.id,
    state,
    gstin: gstinCheck.value,
    address_line: shipTo.value.address,
    city: shipTo.value.city,
    pincode: shipTo.value.pincode,
    contact_name: str(b.shipContactName) || null,
    contact_phone: receiver.value,
    updated_at: new Date().toISOString(),
  };
  await sb.from("corporate_state_profiles").upsert(profile, { onConflict: "account_id,state" });

  // The order number, from the ONE issuer (Roheena, 19 Aug 2026): the Zyvorah
  // engine mints the ZVY series for the whole business and the portal is an
  // entry point like any other. It replaces corporate_next_order_ref, whose
  // ref was a SECOND scheme sitting beside the ZVY that production, the courier
  // label and the invoice already used — VS-000022 and ZVY-10189 were one wall.
  //
  // The row id is minted here rather than left to the insert so it can key the
  // mint: a retried request returns the same number instead of burning another.
  const orderId = randomUUID();
  const minted = await mintOrderNumber(`corp-order-${orderId}`, "dealer");
  if (!minted) {
    // No local fallback, by design: a second counter is precisely what the
    // single issuer exists to prevent, and an order carrying an invented number
    // is worse than an order not placed. Nothing has been written yet.
    return NextResponse.json({
      error: "We couldn't reserve an order number just now. Nothing has been placed — please try again in a moment.",
    }, { status: 503 });
  }
  const orderRef = minted.ref;

  const placement = b.placement && typeof b.placement === "object"
    ? b.placement as { zoom: number; cropX: number; cropY: number; flipH?: boolean; flipV?: boolean }
    : null;

  const { data: inserted, error } = await sb.from("corporate_orders").insert({
    id: orderId,
    account_id: acc.id,
    order_ref: orderRef,
    placed_by_email: session.email,
    print_name: str(b.printName) || null,
    po_number: str(b.poNumber) || null,
    design_url: designUrl,
    design_ref: str(b.designRef) || null,
    design_w_px: b.designWpx ? Math.round(num(b.designWpx)) : null,
    design_h_px: b.designHpx ? Math.round(num(b.designHpx)) : null,
    crop_data: placement,
    width_mm: widthMm,
    height_mm: heightMm,
    // area_sqft is the CHARGEABLE area (migration 0087) — the plain rectangle
    // lives alongside it so the invoice can show the exclusion as a line.
    area_sqft: price.areaSqft,
    full_area_sqft: price.fullAreaSqft,
    min_billable_width_mm: price.minBillableWidthMm,
    excluded_sqft: price.excludedSqft,
    openings: openings.snapshot,
    // The rate actually quoted, not the account default — for website-priced
    // partners these differ, and the invoice must reconcile to what was shown.
    rate_per_sqft: price.ratePerSqft,
    amount: price.amount,
    gst_pct: acc.gst_pct,
    gst_amount: price.gstAmount,
    total: price.total,
    list_amount: price.listAmount,
    discount_pct: price.discountPct,
    discount_amount: price.discountAmount,
    product_handle: productHandle,
    print_type: printType,
    material_slug: materialSlug,
    state,
    gstin: profile.gstin,
    ship_address: profile.address_line,
    ship_city: profile.city,
    ship_pincode: profile.pincode,
    ship_contact_name: profile.contact_name,
    ship_contact_phone: profile.contact_phone,
    repeat_of: str(b.repeatOf) || null,
  }).select().single();

  if (error || !inserted) {
    console.error("[corporate/orders] insert failed:", error?.message);
    return NextResponse.json({ error: "Could not save the order." }, { status: 500 });
  }

  await recordAudit(session, "order.place", { type: "order", id: String(inserted.id) }, {
    orderRef, widthMm, heightMm, amount: price.total, designRef: str(b.designRef) || null,
  });

  // Corporate is the largest revenue family and it was invisible to the event
  // stream — the reconciliation on 24 Aug read 66 orders in the record against
  // zero events. It carries no visitor token: this order came through the
  // partner portal, where there is no anonymous visit to attribute it to, and
  // pretending otherwise would be worse than the honest null.
  after(() =>
    recordCommercialEvent({
      event: "order_placed",
      subject: String(inserted.id),
      valueInr: price.total,
      meta: { family: "corporate", order_ref: orderRef, walls: 1 },
    }),
  );

  // Partners who quote their own client (payment_first) keep the order as a
  // DRAFT: they show a proposal, get a yes, then freeze it — and only freezing
  // hands it to production. Trusted credit accounts are unchanged: the order
  // goes to the OS immediately and prints on our word.
  if (acc.print_gate === "payment_first") {
    await sb.from("corporate_orders").update({ status: "draft" }).eq("id", inserted.id);
    return NextResponse.json({ ok: true, orderRef, orderId: inserted.id, price, status: "draft" });
  }

  // Hand it to the OS — that starts the approval agent → render → hot folder.
  const push = await pushCorporateOrderToOs({
    orderRef,
    accountName: acc.name,
    channel: acc.slug.replace(/-/g, "_"),
    placedByEmail: session.email,
    poNumber: str(b.poNumber) || null,
    printName: str(b.printName) || null,
    designUrl,
    designRef: str(b.designRef) || null,
    widthMm, heightMm,
    amountInr: price.total,
    ratePerSqft: Number(acc.rate_per_sqft),
    gstin: profile.gstin,
    state,
    shipAddress: profile.address_line,
    shipCity: profile.city,
    shipPincode: profile.pincode,
    shipContactName: profile.contact_name,
    shipContactPhone: profile.contact_phone,
    placement,
    // Without these the engine would print the full rectangle the partner was
    // NOT billed for — the exclusion has to reach production, not just the bill.
    openings: openings.engineOpenings,
    excludedSqft: price.excludedSqft || null,
    chargeableSqft: openings.chargeableSqft,
    minBillableWidthMm: price.minBillableWidthMm,
    billedSqft: price.areaSqft,
    printType,
    printRules,
  });

  await sb.from("corporate_orders").update(
    push.ok
      ? { os_order_id: push.osOrderId ?? null, status: "in_production" }
      : { status: "push_failed", push_error: push.error ?? "unknown" },
  ).eq("id", inserted.id);

  if (!push.ok) {
    console.error("[corporate/orders] OS push failed:", push.error);
    // The order is saved — our team can retry from the desk, so never lose it.
    return NextResponse.json({
      ok: true, orderRef, orderId: inserted.id, warning: "Order received. Our team is confirming it manually.",
    });
  }
  return NextResponse.json({ ok: true, orderRef, orderId: inserted.id, price });
}
