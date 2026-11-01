import { isInternalOrder } from "@/lib/internal-orders";
import { textOverlaySchema, overlayPlacementError } from "@/lib/text-overlay";
import { gaIdsFromCookies } from "@/lib/ga-mp";
import { renderTextOverlay } from "@/lib/text-overlay-server";
import { NextResponse, after } from "next/server";
import { refusePartnerPurchase } from "@/lib/partner-mode";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabase } from "@/lib/supabase";
import { maybeCreateRazorpayOrder } from "@/lib/razorpay";
import { autoSubscribe } from "@/lib/subscribe";
import { metaContextFromRequest } from "@/lib/meta-request";
import { getGatedUser } from "@/lib/auth-server";
import { signDoc } from "@/lib/private-doc";
import type { CropData } from "@/lib/visualizer";
import { recordCommercialEvent, linkVisitorIdentity, visitorTokenOf } from "@/lib/server-events";
import { recordCheckoutFailure } from "@/lib/checkout-alert";
import { ensureOrderZvy } from "@/lib/order-number";
import { TASTE_COOKIE } from "@/lib/taste";
import { marketFor, normalizeCountryCode, quoteMarketOrder, type MarketQuote } from "@/lib/markets";
import {
  HOMECOMING_DISCOUNT_PCT,
  HOMECOMING_ORDER_CODE,
  homecomingOfferActive,
} from "@/lib/homecoming-offer";

export const runtime = "nodejs";
export const maxDuration = 60;

const COOKIE = "zyv_cart";

// A reload after a dismissed payment must find the existing unpaid order.
// Only the cart bearer token can request its private recovery link.
export async function GET() {
  const token = (await cookies()).get(COOKIE)?.value;
  const headers = { "Cache-Control": "private, no-store" };
  if (!token) return NextResponse.json({ resumePath: null }, { headers });
  const { data: prior, error } = await supabase.rpc("resume_order_for_cart", { p_session_token: token });
  if (error) return NextResponse.json({ error: "recovery_unavailable" }, { status: 503, headers });
  if (!prior?.order_id) return NextResponse.json({ resumePath: null }, { headers });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "recovery_unavailable" }, { status: 503, headers });
  const { data: order, error: readError } = await db.from("orders").select("access_token")
    .eq("id", prior.order_id).eq("payment_status", "pending").eq("status", "pending").maybeSingle();
  if (readError) return NextResponse.json({ error: "recovery_unavailable" }, { status: 503, headers });
  return NextResponse.json({ resumePath: order?.access_token ? `/order/${encodeURIComponent(order.access_token)}` : null }, { headers });
}

type CheckoutItem = {
  order_item_id: string;
  product_handle: string;
  product_title: string;
  material_slug: string;
  material_name: string;
  width_cm: number;
  height_cm: number;
  area_sqft: number;
  unit_price: number;
  quantity: number;
  line_total: number;
  crop_data: CropData | null;
  preview_url: string | null;
};

export async function POST(req: Request) {
  // A partner's person never buys through the retail till — their wall goes
  // to a customer project and procurement releases it (src/lib/partner-mode.ts).
  const partnerRefusal = await refusePartnerPurchase();
  if (partnerRefusal) return partnerRefusal;

  // Service role, not the anon key: these SECURITY DEFINER RPCs have no
  // internal auth gate, so as anon they were reachable from the browser key.
  const sb = supabaseAdmin();
  if (!sb) {
    console.error("checkout: SUPABASE_SERVICE_ROLE_KEY not configured");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  // Authentication is optional for retail checkout. Cart ownership remains
  // bound to its HTTP-only token; payment verification is unchanged.
  const user = await getGatedUser();

  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) {
    after(() => recordCheckoutFailure({ stage: "no_cart" }));
    return NextResponse.json({ error: "no_cart" }, { status: 400 });
  }

  // The visitor token, from the cookie proxy.ts minted on the first HTML
  // request. It is what joins this order back to the visit — and to the utm
  // parameters that visit arrived with — long after the browser has gone.
  const visitorToken = visitorTokenOf(store.get(TASTE_COOKIE)?.value);

  // The identity stitch — BUILT, TESTED, AND DELIBERATELY NOT CALLED YET.
  //
  // /privacy tells customers, of this exact cookie: "It isn't linked to your
  // name or email." Writing identity_link would link it to an account, and so
  // to an email, and the sentence would stop being true the moment this line
  // runs. A privacy policy that no longer describes the system is not a
  // paperwork problem, it is the system lying to the customer.
  //
  // So the table, the function and the read-time view all exist and are
  // verified; the one line that starts writing rows waits on the published
  // wording being corrected. Re-enable this and amend /privacy in the same
  // deploy, never separately.
  //
  // after(() => linkVisitorIdentity(visitorToken, user.id));
  void linkVisitorIdentity;

  const body = await req.json().catch(() => null);
  const email = (body?.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    after(() => recordCheckoutFailure({ stage: "invalid_email", detail: email || "(blank)", sessionToken: token }));
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  // "Place order" carries the subscribe line (SubscribeDisclosure); the
  // database never re-subscribes anyone who unsubscribed.
  after(() => autoSubscribe(email, "checkout"));

  // Never create an order without a way to pay for it. If payments aren't
  // configured and there's no gift card in play, refuse before touching the
  // cart — no order can "go through" unpaid.
  const hasGift = typeof body?.giftCode === "string" && body.giftCode.trim().length > 0;
  if ((!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) && !hasGift) {
    after(() =>
      recordCheckoutFailure({
        stage: "payments_unconfigured",
        detail: "Razorpay key pair is incomplete and no gift card was supplied",
        email,
        sessionToken: token,
      }),
    );
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }
  const countryCode = normalizeCountryCode(body?.countryCode ?? body?.shippingAddress?.countryCode) ?? "IN";
  const market = marketFor(countryCode);
  const isInternational = market.countryCode !== "IN";
  const shippingAddress = {
    ...(body?.shippingAddress ?? {}),
    country: market.countryName,
    countryCode: market.countryCode,
  };

  if (!shippingAddress.line1 || !shippingAddress.city || !shippingAddress.pincode) {
    return NextResponse.json({ error: "invalid_shipping_address", detail: "Please complete the shipping address." }, { status: 400 });
  }

  // Installation may only be sold into the cities where we have an installer.
  // This is the AUTHORITATIVE gate — the product page also checks, but a client
  // can be bypassed, so no order carrying installation is ever created for an
  // address we don't service. The customer can strip it via
  // DELETE /api/cart/installation and re-place the order.
  // The designs in the cart, for a discount code limited to named designs.
  let cartHandles: string[] = [];
  let cartHasWallpaper = false;
  {
    const { data: cart } = await supabase.rpc("cart_get", { p_session_token: token });
    const items = (cart as { items?: { installation?: number | string | null; handle?: string | null; category?: string | null }[] } | null)?.items ?? [];
    cartHandles = items.map((it) => it.handle).filter((h): h is string => typeof h === "string" && h.length > 0);
    cartHasWallpaper = items.some((it) => (it.category ?? "wallpaper") === "wallpaper");
    // Revalidate persisted layouts before creating a payable order, including old carts.
    for (const item of (cart as { items?: { crop_data?: CropData; child_name?: string; width_cm: number; height_cm: number }[] } | null)?.items ?? []) {
      const c = item.crop_data;
      if (item.child_name && !c?.textOverlay) return NextResponse.json({ error: "Please remove the old name add-on and approve a new name-cloud preview." }, { status: 400 });
      if (!c?.textOverlay) continue;
      const parsed = textOverlaySchema.safeParse(c.textOverlay);
      if (!parsed.success || !c.approval?.approvedAt) return NextResponse.json({ error: "Please approve your lettering before checkout." }, { status: 400 });
      const problem = overlayPlacementError(parsed.data, item.width_cm, item.height_cm, c.doors);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      try { await (await renderTextOverlay(parsed.data)).arrayBuffer(); }
      catch { return NextResponse.json({ error: "Lettering verification is temporarily unavailable. Please retry checkout." }, { status: 503 }); }
    }
    const hasInstallation = items.some((it) => Number(it.installation ?? 0) > 0);
    if (hasInstallation) {
      const { isInstallServiceable } = await import("@/lib/install-cities");
      if (isInternational || !isInstallServiceable({ pincode: shippingAddress?.pincode })) {
        after(() =>
          recordCheckoutFailure({
            stage: "install_not_serviceable",
            detail: `pincode ${shippingAddress?.pincode ?? "unknown"}`,
            email,
            sessionToken: token,
          }),
        );
        return NextResponse.json(
          {
            error: "install_not_serviceable",
            detail:
              "Professional installation isn't available at this delivery pincode. Remove installation to continue — your order still arrives as labelled panels with a fitting guide.",
          },
          { status: 400 },
        );
      }
    }
  }

  const phone = body?.phone ?? null;
  const gstin = typeof body?.gstin === "string" ? body.gstin.trim().toUpperCase() : null;
  const billingName = typeof body?.billingName === "string" ? body.billingName.trim() : null;
  const homecoming = homecomingOfferActive();
  const express = !isInternational && (homecoming ? cartHasWallpaper : body?.express === true);

  // Discount code — THE authoritative check; /api/discount/check is only the
  // UI's preview of this one. A discount is honoured solely because the OS
  // issued it as a credit note, as the correction of our own error, or as the
  // install-insert referral, and a referral is refused for a dealer, who
  // already buys at contract price. Everything else — a code someone was sold,
  // passed on, or invented — falls through at zero. See os-discount.ts.
  // A code that doesn't survive all of that is silently ignored rather than
  // failing the order; the customer simply pays list.
  //
  // Resolved once here because two separate decisions turn on it: whether a
  // referral code applies, and whether this order's copy may say "free
  // shipping". Freight is prepaid on retail e-commerce alone — for a reseller
  // or corporate account it is to-pay, always.
  const { currentBuyerIsTradeAccount } = await import("@/lib/trade-auth");
  const isTradeAccount = await currentBuyerIsTradeAccount();

  // A creator collaboration code (Roheena, 7 October 2026) is the fourth
  // reason, minted by this store and judged here with the email and the cart
  // in hand: personal to one address, optionally to named designs, up to 100%.
  // See lib/discounts.ts — the one place both authorities are asked.
  const discountCodeRaw = homecoming
    ? HOMECOMING_ORDER_CODE
    : typeof body?.discountCode === "string" ? body.discountCode.trim().toUpperCase() : "";
  let discount: Awaited<ReturnType<typeof import("@/lib/discounts").checkDiscount>> | null = null;
  if (!homecoming && discountCodeRaw) {
    const { checkDiscount } = await import("@/lib/discounts");
    discount = await checkDiscount(discountCodeRaw, { email, cartHandles, isTradeAccount });
  }
  const discountPct = homecoming ? HOMECOMING_DISCOUNT_PCT : discount?.valid ? discount.pct : 0;
  // Every other refusal falls through to list price, as it always has. A
  // personal code typed by the wrong address, or carried onto a design it
  // does not cover, does NOT: silently charging a creator full price for the
  // wall we promised her is worse than asking her to fix the email.
  if (discount && !discount.valid && (discount.reason === "wrong_email" || discount.reason === "wrong_design")) {
    const { refusalCopy } = await import("@/lib/discount-display");
    return NextResponse.json({ error: "discount_refused", detail: refusalCopy(discount) }, { status: 400 });
  }

  // checkout_start is the transition that predicts revenue, and it is recorded
  // BEFORE the order is created — deliberately. An abandoned or failed checkout
  // is exactly the case a funnel needs to see, and it is the case that leaves no
  // order row behind to infer it from.
  after(() =>
    recordCommercialEvent({
      event: "checkout_start",
      subject: `${token}:${Date.now()}`,
      token: visitorToken,
      customerId: user?.id ?? null,
    }),
  );

  const giftCodeRaw = typeof body?.giftCode === "string" ? body.giftCode.trim() : "";
  if (isInternational && giftCodeRaw) {
    return NextResponse.json(
      { error: "gift_card_currency", detail: "Gift cards are currently redeemable on India/INR checkout only." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("checkout_cart_v2", {
    p_session_token: token,
    p_email: email,
    p_phone: phone,
    p_shipping_address: shippingAddress,
    p_express: express,
    p_discount_code: discountPct > 0 ? discountCodeRaw : null,
    p_discount_pct: discountPct,
    // 50 for an OS code, as it always was; 100 for a collaboration.
    p_discount_cap_pct: homecoming ? HOMECOMING_DISCOUNT_PCT : discount?.valid ? discount.capPct : 50,
    p_discount_max_inr: discount?.valid ? discount.maxValueInr : null,
    p_waive_courier: homecoming || (discount?.valid ? discount.freeShipping : false),
  });
  if (error) {
    console.error("checkout_cart failed:", error.message);
    if (error.message.startsWith("Wallpaper price or surface changed.")) {
      return NextResponse.json({ error: "price_changed", detail: "A wallpaper’s price or surface has changed. Return to your cart, remove the affected wallpaper and add it again to review the current price." }, { status: 409 });
    }

    // 'no open cart' can mean the cart was already checked out — and if the
    // response to THAT checkout was lost, the browser still holds the cookie
    // for it and will retry for ever, wedged, while an unpaid order it can't
    // see sits in the queue. That is what happened to #56.
    //
    // So: resume, never re-place. The order already exists; the customer needs
    // the payment leg she never got, not a second order for the same wall.
    const resumed = await resumeUnpaidOrder(token, giftCodeRaw);
    if (resumed) return resumed;

    after(() =>
      recordCheckoutFailure({
        stage: "checkout_rpc_failed",
        detail: error.message,
        email,
        sessionToken: token,
      }),
    );

    // Nothing to resume. WHY there is nothing decides what she is told, and
    // only the cart's own state can say — so ask, rather than hand the browser
    // Postgres' words and hope the client recognises them. Shades read
    // "no open cart" on the checkout page twice: once before 0118 existed, and
    // once after her order was cancelled, which resume correctly declines to
    // answer for. The message a customer sees is decided HERE, on the server;
    // `detail` is customer-safe copy from this point on, never a raw error.
    return await spentCartResponse(token, error.message);
  }

  const result = data as {
    order_id: string;
    order_number: number;
    subtotal: number;
    shipping: number;
    /** ₹1,000 small-order courier component of `shipping` (0 when free). */
    courier?: number;
    discount: number;
    discount_code: string | null;
    total: number;
    express: boolean;
    items: CheckoutItem[];
  };

  const wallpaperItems = result.items.filter((item) => item.product_handle !== "bespoke-customisation");
  const shipmentAreaSqFt = wallpaperItems.reduce((sum, item) => sum + item.area_sqft * item.quantity, 0);
  const shipmentTubeCount = Math.max(1, wallpaperItems.reduce((sum, item) => sum + item.quantity, 0));

  // Carry the visit onto the order. A payment arrives later on a webhook with no
  // browser and no cookie attached; without this the money can never be joined
  // back to the visit that produced it. Best-effort — an order that loses its
  // token is still a perfectly good order, just unattributable.
  // The GA client rides along for the same reason: the server-side purchase
  // (src/lib/ga-mp.ts) needs somewhere to address the hit when the browser
  // that started the checkout is no longer there to send it.
  const gaIds = isInternalOrder(email) ? null : gaIdsFromCookies((n) => store.get(n)?.value, process.env.NEXT_PUBLIC_GA_ID);
  if (visitorToken || gaIds) {
    const { error: tokErr } = await sb
      .from("orders")
      .update({
        ...(visitorToken ? { visitor_token: visitorToken } : {}),
        ...(gaIds ? { ga_client_id: gaIds.clientId, ga_session_id: gaIds.sessionId } : {}),
      })
      .eq("id", result.order_id);
    if (tokErr) console.error("order visitor_token failed:", tokErr.message);
  }

  // THE NUMBER is not minted here. A ZVY number is a production number —
  // what the print floor, the courier label and the invoice carry — and an
  // order is not an order until it is paid (Roheena, 8 October 2026: #82 was
  // numbered ZVY-20489, print files queued and an order copy drawn, for a
  // payment window closed after fifty seconds). It is minted at payment by
  // lib/retail-paid.ts, from verify, the webhook, or the gift/collaboration
  // branches below, which are paid on the spot and so number on the spot.
  let zvy: string | null = null;

  // The order exists. Subject is the order id, so this is one row however many
  // times anything replays.
  after(() =>
    recordCommercialEvent({
      event: "order_placed",
      subject: result.order_id,
      token: visitorToken,
      customerId: user?.id ?? null,
      valueInr: result.total,
      meta: {
        order_number: result.order_number,
        items: result.items.length,
        discount_code: result.discount_code,
        express: result.express,
      },
    }),
  );

  // Store buyer GST details for the dispatch-time tax invoice (best-effort).
  if (gstin || billingName) {
    const { error: gstErr } = await sb.rpc("set_order_gst", {
      p_order_id: result.order_id,
      p_gstin: gstin,
      p_billing_name: billingName,
    });
    if (gstErr) console.error("set_order_gst failed:", gstErr.message);
  }

  // No print files and no order copy here either: both are production work,
  // and production starts when the money arrives (lib/retail-paid.ts —
  // producePaidOrder, run by every path that marks an order paid).

  // Gift card is TENDER, not a discount — the order/invoice total stays full
  // (goods + shipping); only the amount payable via Razorpay is reduced by
  // what the card covers.
  const giftCode = giftCodeRaw;
  const orderTotal = Math.round(result.total);
  let giftApplied = 0; // amount the gift will cover
  if (giftCode) {
    const { data: st } = await supabase.rpc("gift_card_status", { p_code: giftCode });
    const s = st as { valid?: boolean; balance?: number } | null;
    if (s?.valid && (s.balance ?? 0) > 0) giftApplied = Math.min(s.balance!, orderTotal);
  }
  const payable = Math.max(0, orderTotal - giftApplied);
  const presentment = quoteMarketOrder({
    amountInr: payable,
    countryCode: market.countryCode,
    areaSqFt: shipmentAreaSqFt,
    tubeCount: shipmentTubeCount,
    waiveDelivery: !!(discount?.valid && discount.freeShipping),
  });
  const paymentAmount = presentment.total;

  // Keep the existing INR totals as the Indian accounting/production basis,
  // and record the customer's actual country-adjusted charge alongside them.
  // This avoids rewriting the OS and GST invoice contract while making the
  // Razorpay amount and the checkout amount identical.
  if (!(await savePresentment(result.order_id, presentment, market.customsIncluded, isTradeAccount))) {
    return NextResponse.json(
      { error: "payments_unavailable", orderPlaced: true, zvy, orderNumber: result.order_number },
      { status: 503 },
    );
  }

  let razorpay = null;
  let fullyPaidByGift = false;
  let fullyCoveredByCode = false;
  if (giftApplied <= 0 && orderTotal <= 0 && paymentAmount <= 0 && discount?.valid && discount.issuedFor === "creator_collab") {
    // A creator collaboration took the whole order to ₹0. There is no payment
    // window to open — Razorpay refuses a zero amount, and the order used to
    // sit 'pending' for ever, unpayable and never produced. Confirm it here,
    // exactly as a gift card that covers everything is confirmed below.
    const admin = supabaseAdmin();
    if (!admin) return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
    const { data: shipping, error: freeError } = await admin.rpc("mark_order_paid_free", { p_order_id: result.order_id });
    if (freeError || !shipping) {
      console.error("mark_order_paid_free failed:", freeError?.message);
      return NextResponse.json({ error: "payment_confirmation_pending" }, { status: 503 });
    }
    fullyCoveredByCode = true;
    // Paid on the spot (₹0), so numbered on the spot: the confirmation quotes it.
    zvy = await ensureOrderZvy(result.order_id);
    const { afterPaidWithoutGateway } = await import("@/lib/paid-without-gateway");
    const metaContext = metaContextFromRequest(req);
    after(() =>
      afterPaidWithoutGateway({
        order: shipping as import("@/lib/fulfillment/types").ShippingOrder,
        method: "creator_collab",
        discountCode: result.discount_code,
        visitorToken,
        customerId: user?.id ?? null,
        orderTotalInr: orderTotal,
        metaContext,
      }),
    );
  } else if (giftApplied > 0 && payable <= 0) {
    // Fully covered → deduct the gift now and mark paid (no payment leg to abandon).
    await supabase.rpc("apply_gift_card", { p_order_id: result.order_id, p_code: giftCode });
    const admin=supabaseAdmin();
    if(!admin)return NextResponse.json({error:"payments_unavailable"},{status:503});
    const {error:paidError}=await admin.rpc("mark_order_paid_by_gift", { p_order_id: result.order_id });
    if(paidError)return NextResponse.json({error:"payment_confirmation_pending"},{status:503});
    fullyPaidByGift = true;
    zvy = await ensureOrderZvy(result.order_id);
    // No Razorpay verify/webhook exists for a fully gift-paid order, so the
    // whole of "paid" happens here: the OS push (as settled), the code burn,
    // the payment event, GA/Meta and the founder's note — one list, shared
    // with the ₹0 collaboration order above (lib/paid-without-gateway.ts).
    const { afterPaidWithoutGateway, loadShippingOrder } = await import("@/lib/paid-without-gateway");
    const metaContext = metaContextFromRequest(req);
    after(async () => {
      const shipping = await loadShippingOrder(result.order_id);
      if (!shipping) {
        console.error(`gift-paid order ${result.order_number}: could not load its shipping payload for the OS`);
        return;
      }
      await afterPaidWithoutGateway({
        order: shipping,
        method: "gift_card",
        discountCode: result.discount_code,
        visitorToken,
        customerId: user?.id ?? null,
        orderTotalInr: orderTotal,
        metaContext,
      });
    });
  } else {
    if (giftApplied > 0) {
      // Partial → defer the deduction to payment success (see /api/razorpay/verify).
      await supabase.rpc("set_order_pending_gift", { p_order_id: result.order_id, p_code: giftCode });
    }
    razorpay = await maybeCreateRazorpayOrder(
      paymentAmount,
      `order-${result.order_number}`,
      {
        market_country: market.countryCode,
        settlement_basis_inr: String(payable),
        delivery_included: String(presentment.delivery),
        customs_included: String(market.customsIncluded),
      },
      presentment.currency,
    );
    if (razorpay) {
      // Store the Razorpay order id so the verify endpoint can map the payment
      // back to this order.
      const { error: mappingError } = await supabase.rpc("set_order_razorpay", {
        p_order_id: result.order_id,
        p_rzp_order_id: razorpay.razorpayOrderId,
      });
      if (mappingError) {
        after(() => recordCheckoutFailure({ stage: "payment_link_failed", detail: "Payment order could not be attached to the saved order", orderId: result.order_id, orderNumber: result.order_number, email, valueInr: payable, sessionToken: token }));
        return NextResponse.json({ error: "payments_unavailable", orderPlaced: true, orderNumber: result.order_number }, { status: 503 });
      }
    } else {
      // A balance is due but no payment could be initiated — never return a
      // confirmation. The order stays 'pending' (unpaid) and is never fulfilled.
      //
      // THIS is the one that mattered: #54 and #56 both ended here, with a real
      // order sitting unpaid and unpayable and nobody told. The alert carries
      // the order number and the amount because the recovery is a person
      // ringing the customer, not a retry.
      after(() =>
        recordCheckoutFailure({
          stage: "payment_link_failed",
          detail: `Razorpay would not create a payment link for ${payable}`,
          email,
          orderNumber: result.order_number,
          orderId: result.order_id,
          valueInr: payable,
          sessionToken: token,
        }),
      );
      // The order EXISTS. Saying "your order hasn't been placed" here — which
      // is what the page used to say — is not just wrong, it is the sentence
      // that sends the customer round the retry loop and leaves us with a
      // second unpaid order for the same wall. Tell the page the truth.
      return NextResponse.json(
        { error: "payments_unavailable", orderPlaced: true, zvy, orderNumber: result.order_number },
        { status: 503 },
      );
    }
  }

  // Keep the cart bearer token until payment succeeds. Script-load failures
  // and dismissed payment windows must be able to resume this unpaid order.
  const res = NextResponse.json({
    // What she is shown and quotes back to us. `orderNumber` stays for the
    // internal references that still key on it (Razorpay receipt, admin list).
    zvy,
    orderNumber: result.order_number,
    orderId: result.order_id,
    subtotal: result.subtotal,
    shipping: result.shipping,
    discount: result.discount,
    discountCode: result.discount_code,
    total: result.total,
    express: result.express,
    giftApplied,
    payable,
    presentment,
    fullyPaidByGift,
    // Taken to ₹0 by a creator collaboration code and confirmed without a
    // payment window. The page treats it like fullyPaidByGift.
    fullyCoveredByCode,
    // The bucket is private: the browser downloads this the moment the order
    // lands, so hand it a signed link rather than the stored reference.
    orderCopyUrl: null, // generated after this response, attached to the order
    razorpay, // null when keys not configured (payment stubbed)
    paymentPending: !razorpay && !fullyPaidByGift && !fullyCoveredByCode,
  });
  if (fullyPaidByGift || fullyCoveredByCode) res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

/**
 * What to tell a customer whose cart cannot be checked out and cannot be
 * resumed.
 *
 * The wedge this ends: the zyv_cart cookie outlives the cart it names. Once
 * that cart is 'ordered' it can never be checked out again, so every retry
 * raises the same exception, for ever, and no amount of refreshing helps —
 * the cookie has to go. Clearing it here means her next add starts a clean
 * cart instead of reopening the same dead end.
 */
async function spentCartResponse(token: string, rawError: string) {
  const { data } = await supabase.rpc("cart_checkout_state", { p_session_token: token });
  const state = data as {
    cart_status: string | null;
    has_items: boolean;
    order_number: number | null;
    order_status: string | null;
  } | null;

  const spent = state?.cart_status === "ordered";
  const cancelled = state?.order_status === "cancelled";

  const detail = spent
    ? cancelled
      ? `Order #${state!.order_number} was cancelled, so this basket is closed. Your items are still in the shop — add them again and you can check out straight away.`
      : "This basket has already been checked out. If your items aren't showing, they're on an order and we'll email you about it."
    : state?.cart_status === "open" && !state.has_items
      ? "Your basket is empty — add a wall and you can check out."
      : "We couldn't place this order just now. Please add your wall again, or write to hello@zyvorah.com and we'll place it for you.";

  console.error(`checkout refused for a spent cart (${rawError}):`, JSON.stringify(state));

  const res = NextResponse.json(
    { error: spent ? "cart_spent" : "checkout_failed", detail },
    { status: 409 },
  );
  // The cookie is the wedge — the same reason the resume path clears it.
  if (spent) res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

/**
 * Put a customer back on the payment leg of an order she has already placed.
 *
 * Reached only when checkout_cart refuses a token whose cart is spent. If that
 * cart produced an order that is still unpaid, the honest answer is not an
 * error and certainly not a second order — it is the Razorpay window she never
 * received, plus the cart cookie finally cleared so the loop ends. Returns null
 * when there is nothing to resume, and the caller falls through to the real
 * error.
 */
async function resumeUnpaidOrder(token: string, giftCode: string) {
  const { data, error } = await supabase.rpc("resume_order_for_cart", {
    p_session_token: token,
  });
  if (error) {
    console.error("resume_order_for_cart failed:", error.message);
    return null;
  }
  const prior = data as {
    order_id: string;
    order_number: number;
    total: number;
    subtotal: number;
    shipping: number;
    discount: number;
    discount_code: string | null;
    express: boolean;
    order_copy_url: string | null;
    pending_gift_code: string | null;
  } | null;
  if (!prior) return null;

  console.error(
    `resuming unpaid order ${prior.order_number} for a spent cart — checkout's response was lost`,
  );

  // The RPC above proves ownership through the cart token. Retail RLS does
  // not expose order rows, so read this authorised order with the server client.
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  const [{ data: orderMeta, error: metaError }, { data: orderLines, error: linesError }] = await Promise.all([
    admin.from("orders").select("shipping_address").eq("id", prior.order_id).single(),
    admin.from("order_items").select("area_sqft, quantity").eq("order_id", prior.order_id),
  ]);
  if (metaError || linesError || !orderMeta || !orderLines?.length) {
    console.error("resume market lookup failed", metaError, linesError);
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }
  const savedAddress = (orderMeta as { shipping_address?: { countryCode?: string } | null } | null)?.shipping_address;
  const resumedMarket = marketFor(normalizeCountryCode(savedAddress?.countryCode) ?? "IN");
  const resumedArea = (orderLines ?? []).reduce(
    (sum, line: { area_sqft?: number | string | null; quantity?: number | null }) =>
      sum + Number(line.area_sqft ?? 0) * Number(line.quantity ?? 1),
    0,
  );
  const resumedTubes = Math.max(
    1,
    (orderLines ?? []).reduce(
      (sum, line: { quantity?: number | null }) => sum + Number(line.quantity ?? 1),
      0,
    ),
  );

  // A gift already reserved against this order stays reserved; a code typed on
  // this attempt is honoured only if none was. Either way the deduction still
  // happens at payment, never here.
  const code = resumedMarket.countryCode === "IN" ? prior.pending_gift_code || giftCode : "";
  const orderTotal = Math.round(prior.total);
  let giftApplied = 0;
  if (code) {
    const { data: st } = await supabase.rpc("gift_card_status", { p_code: code });
    const s = st as { valid?: boolean; balance?: number } | null;
    if (s?.valid && (s.balance ?? 0) > 0) giftApplied = Math.min(s.balance!, orderTotal);
  }
  const payable = Math.max(0, orderTotal - giftApplied);
  const presentment = quoteMarketOrder({
    amountInr: payable,
    countryCode: resumedMarket.countryCode,
    areaSqFt: resumedArea,
    tubeCount: resumedTubes,
  });

  // A gift that now covers the whole thing is not a payment window — it is a
  // state change on a live order, and this recovery path is not the place to
  // make one. Hand it to a human rather than guess.
  if (payable <= 0) {
    return NextResponse.json(
      {
        error: "resume_needs_help",
        detail: `Order #${prior.order_number} is already placed and needs no further payment — email hello@zyvorah.com and we'll confirm it.`,
      },
      { status: 409 },
    );
  }

  if (giftApplied > 0 && !prior.pending_gift_code) {
    await supabase.rpc("set_order_pending_gift", { p_order_id: prior.order_id, p_code: code });
  }

  const { currentBuyerIsTradeAccount } = await import("@/lib/trade-auth");
  if (!(await savePresentment(prior.order_id, presentment, resumedMarket.customsIncluded, await currentBuyerIsTradeAccount()))) {
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }

  // A fresh Razorpay order every time: the stored id belongs to an attempt that
  // was never paid, and we don't keep its amount to know whether it still
  // matches this one.
  const razorpay = await maybeCreateRazorpayOrder(
    presentment.total,
    `order-${prior.order_number}`,
    {
      market_country: resumedMarket.countryCode,
      settlement_basis_inr: String(payable),
      delivery_included: String(presentment.delivery),
      resumed: "true",
    },
    presentment.currency,
  );
  if (!razorpay) {
    // They came back to finish an order that already exists and still cannot
    // pay. Nothing the customer does next will help — this needs a human.
    after(() =>
      recordCheckoutFailure({
        stage: "resume_payment_link_failed",
        detail: `Razorpay would not create a payment link for ${payable} on a resumed order`,
        orderNumber: prior.order_number,
        orderId: prior.order_id,
        valueInr: payable,
        sessionToken: token,
      }),
    );
    return NextResponse.json(
      { error: "payments_unavailable", orderPlaced: true, orderNumber: prior.order_number },
      { status: 503 },
    );
  }
  const { error: mappingError } = await supabase.rpc("set_order_razorpay", {
    p_order_id: prior.order_id,
    p_rzp_order_id: razorpay.razorpayOrderId,
  });
  if (mappingError) {
    after(() => recordCheckoutFailure({ stage: "resume_payment_link_failed", detail: "Payment order could not be attached to the saved order", orderId: prior.order_id, orderNumber: prior.order_number, valueInr: payable, sessionToken: token }));
    return NextResponse.json({ error: "payments_unavailable", orderPlaced: true, orderNumber: prior.order_number }, { status: 503 });
  }

  const res = NextResponse.json({
    orderNumber: prior.order_number,
    orderId: prior.order_id,
    subtotal: prior.subtotal,
    shipping: prior.shipping,
    discount: prior.discount,
    discountCode: prior.discount_code,
    total: prior.total,
    express: prior.express,
    giftApplied,
    payable,
    presentment,
    fullyPaidByGift: false,
    orderCopyUrl: await signDoc(prior.order_copy_url),
    razorpay,
    paymentPending: false,
    resumed: true,
  });
  // Still unpaid: preserve the token for another payment attempt.
  return res;
}

/** Persist the charge before opening payment; an RLS no-op is not success. */
async function savePresentment(
  orderId: string,
  quote: MarketQuote,
  customsIncluded: boolean,
  /** A trade buyer's copy says freight is to pay. Recorded here because the
   *  order copy is drawn at payment, long after this request's session. */
  tradeAccount = false,
): Promise<boolean> {
  const admin = supabaseAdmin();
  if (!admin) return false;
  const { data, error } = await admin.from("orders").update({
    notes: JSON.stringify({
      marketCountry: quote.countryCode,
      presentmentCurrency: quote.currency,
      presentmentGoods: quote.goods,
      presentmentDelivery: quote.delivery,
      presentmentTotal: quote.total,
      customsIncluded,
      package: { lengthMm: 1400, diameterMm: 75, tubes: quote.tubeCount },
      chargeableWeightKg: quote.chargeableWeightKg,
      ...(tradeAccount ? { tradeAccount: true } : {}),
    }),
  }).eq("id", orderId).select("id").single();
  if (error || !data) {
    console.error("order market persistence failed", error);
    return false;
  }
  return true;
}
