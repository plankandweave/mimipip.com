"use client";
import { withServicePage } from "@/brand/service-page";

import { PendingOrderRecovery } from "@/components/PendingOrderRecovery";

import { trackPurchaseProgress } from "@/lib/track-purchase-progress";
import { loadRazorpay } from "@/lib/load-razorpay";
import { isInternalOrder } from "@/lib/internal-orders";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { useCart } from "@/components/CartProvider";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/AuthModal";
import { isAuthRequired } from "@/components/AuthGate";
import { readSavedDiscount, clearSavedDiscount } from "@/components/DiscountKeeper";
import { discountAmount, refusalCopy, waivesCourier, appliedLabel, type DiscountPreview } from "@/lib/discount-display";
import { useFreightToPay } from "@/components/FreightBasis";
import { readSavedContact, writeSavedContact } from "@/lib/saved-contact";
import { MarketInvoiceBreakdown } from "@/components/MarketInvoiceBreakdown";
import { GoogleCustomerReviewOptIn } from "@/components/GoogleCustomerReviewOptIn";
import { ShipToCountry, useMarket } from "@/components/MarketProvider";
import { womenContribution, smallOrderCourierFee, MIN_WALLPAPER_SQFT, type InvoiceLine } from "@/lib/pricing";
import { gstinChecksumOk } from "@/lib/gst";
import { gaEvent, gaAddPaymentInfo, gaAddShippingInfo, gaBeginCheckout, gaGoodsFromInr, gaPurchase, gaPurchaseAccounting } from "@/lib/ga";
import { metaInitiateCheckout, metaPresentmentFromInr, metaUserData as metaAdvancedMatching } from "@/lib/meta-pixel";
import { metaContentId, metaPurchase, metaPurchaseValue } from "@/lib/meta-pixel";
import { openAiIdentify, openAiOrderCreated } from "@/lib/openai-pixel";
import { resolveInstallEligibility } from "@/lib/install-cities";
import { INSTALL_CITIES_LABEL } from "@/lib/pricing";
import { internationalTransitWorkingDays, quoteMarketOrder } from "@/lib/markets";
import {
  addWorkingDays,
  EXPRESS_SHIPPING,
  expressSurcharge,
  estimateStandardDelivery,
  estimateExpressDelivery,
  formatShipDate,
} from "@/lib/shipping";
import { istDateKey } from "@/lib/ist";
import { SubscribeDisclosure } from "@/components/SubscribeDisclosure";
import { artworkSizeLabel } from "@/lib/product-facts";
import {
  HOMECOMING_DISCOUNT,
  HOMECOMING_DISCOUNT_CODE,
  HOMECOMING_EXPRESS_CODE,
  homecomingOfferActive,
} from "@/lib/homecoming-offer";

type Placed = { orderNumber: number; zvy?: string | null; orderCopyUrl: string | null; paymentPending: boolean; giftApplied?: number; fullyPaidByGift?: boolean; fullyCoveredByCode?: boolean; contribution?: number; preorderBook?: boolean };

type RazorpayInfo = { razorpayOrderId: string; keyId: string; amount: number; currency: "INR" | "USD" };

function CheckoutPage() {
  const campaignActive = homecomingOfferActive();
  const { items, loading, readError, refresh } = useCart();
  const { market, money, ready: marketReady } = useMarket();
  // GA4 funnel: one begin_checkout per checkout visit and market selection,
  // once the cart is known. The amount uses the same market quote as checkout.
  const beganCheckout = useRef<string | null>(null);
  useEffect(() => {
    if (!marketReady || loading || !items.length || beganCheckout.current === market.countryCode) return;
    const wallpaperItems = items.filter((item) => (item.category ?? "wallpaper") === "wallpaper");
    const areaSqFt = wallpaperItems.reduce((sum, item) => sum + item.area_sqft * item.quantity, 0);
    const quote = quoteMarketOrder({
      amountInr: items.reduce((sum, item) => sum + item.line_total, 0),
      countryCode: market.countryCode,
      areaSqFt,
      tubeCount: Math.max(1, wallpaperItems.reduce((sum, item) => sum + item.quantity, 0)),
    });
    beganCheckout.current = market.countryCode;
    void trackPurchaseProgress("checkout_opened");
    gaBeginCheckout({
      items,
      value: gaGoodsFromInr(
        items.reduce((sum, item) => sum + item.line_total, 0),
        quote.countryCode,
        quote.currency,
      ),
      countryCode: quote.countryCode,
      currency: quote.currency,
    });
    // Meta's value is what will actually be charged, GST included.
    metaInitiateCheckout({
      handles: items.map((item) => item.handle),
      value: metaPresentmentFromInr(
        items.reduce((sum, item) => sum + item.line_total, 0),
        quote.countryCode,
        quote.currency,
      ),
      currency: quote.currency,
      numItems: items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0),
    });
  }, [loading, items, market.countryCode, marketReady]);
  // Guest orders retain the same private cart token and verified payment flow.
  const { session } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  // Gift card (tender) — validated against its balance, applied at payment.
  const [giftCode, setGiftCode] = useState("");
  const [gift, setGift] = useState<{ valid: boolean; balance?: number } | null>(null);
  const [giftBusy, setGiftBusy] = useState(false);
  // Discount code (price adjustment) — the 15% QR from the install insert.
  // A code scanned at /r/<code> is waiting in localStorage and auto-applies.
  const [discountCode, setDiscountCode] = useState(campaignActive ? HOMECOMING_DISCOUNT_CODE : "");
  const [discount, setDiscount] = useState<DiscountPreview | null>(campaignActive ? HOMECOMING_DISCOUNT : null);
  const [discountBusy, setDiscountBusy] = useState(false);
  // Both fields start collapsed behind a "Have a …?" link — most checkouts
  // carry neither — and auto-expand the moment a code is already applied.
  const [discountOpen, setDiscountOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  // Standard is free; Express is ₹1,000 per wallpaper + ₹500 per order.
  const [express, setExpress] = useState(campaignActive);
  const wallpaperQty = items.reduce(
    (sum, item) => ((item.category ?? "wallpaper") === "wallpaper" ? sum + item.quantity : sum),
    0,
  );
  const hasPreorderBook = items.some((item) => item.category === "book");
  const expressSelected = market.countryCode === "IN" && express && wallpaperQty > 0;

  const checkDiscount = async (codeArg?: string, email?: string) => {
    const code = (codeArg ?? discountCode).trim();
    if (!code || discountBusy) return;
    setDiscountBusy(true);
    try {
      const res = await fetch("/api/discount/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The email, when typed: a creator collaboration code is personal to
        // one address, and saying so now beats a refusal at "Place order".
        body: JSON.stringify({ code, email: email?.trim() || undefined }),
      });
      const d = await res.json();
      setDiscount({ ...d, valid: !!d.valid });
    } catch {
      setDiscount({ valid: false, reason: "unreachable" });
    } finally {
      setDiscountBusy(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  useEffect(() => {
    if (campaignActive) return;
    const saved = readSavedDiscount();
    if (saved) {
      setDiscountCode(saved);
      setDiscountOpen(true);
      void checkDiscount(saved);
    }
  }, [campaignActive]);

  // WHO PAYS THE COURIER — one cached answer per browser session, shared with
  // the header banner and the cart (see FreightBasis.tsx). Defaults to retail,
  // so a slow answer never invents a freight charge for a retail customer.
  const freightToPay = useFreightToPay();

  // Small-order courier — WAIVED once the 20 sq ft minimum is billed, so on
  // any normally-priced cart this is ₹0 (every wallpaper line bills ≥ 20 sq
  // ft). Mirrors checkout_cart's safety net (billed area under 20 sq ft) so
  // the preview total always equals what checkout actually charges.
  const wallpaperBilledSqFt = items.reduce(
    (s, it) => ((it.category ?? "wallpaper") === "wallpaper" ? s + it.area_sqft * it.quantity : s),
    0,
  );
  // A collaboration that includes delivery waives it (checkout_cart_v2's
  // p_waive_courier), so the preview equals the charge.
  const courierCharge = market.countryCode === "IN" && !waivesCourier(discount) ? smallOrderCourierFee(wallpaperBilledSqFt) : 0;
  const shippingCharge = courierCharge + (expressSelected && !campaignActive ? expressSurcharge(wallpaperQty) : 0);
  const standardEst = estimateStandardDelivery();
  const expressEst = estimateExpressDelivery();
  const internationalTransit = internationalTransitWorkingDays(market.countryCode);

  // Mini-invoice lines: each item's wallpaper portion, plus its installation as
  // a separate line when present (line_total includes installation), plus the
  // Express surcharge (its own line per wallpaper + one flat order-handling line).
  const invoiceLines: InvoiceLine[] = items.flatMap((it) => {
    if (it.handle === "bespoke-customisation") {
      return [{ label: "Bespoke customisation", incl: it.line_total }];
    }
    const install = it.installation ?? 0;
    const naming = it.personalisation ?? 0;
    const exclusivity = it.exclusivity_fee ?? 0;
    const sizeLabel = it.measurement_type === "fixed" ? ` · ${artworkSizeLabel(it.width_cm, it.height_cm)}` : "";
    const rows: InvoiceLine[] = [
      { label: `${it.room_label ? `${it.room_label} · ` : ""}${it.title}${sizeLabel}${it.quantity > 1 ? ` × ${it.quantity}` : ""}`, incl: it.line_total - install - naming - exclusivity },
    ];
    if (exclusivity > 0) rows.push({label: `Future-sales exclusivity · ${it.title} · ${it.exclusive_project}`, incl:exclusivity});
    if (naming > 0) rows.push({ label: `Child's name${it.child_name ? ` · “${it.child_name}”` : ""}`, incl: naming });
    if (install > 0) rows.push({ label: `Installation · ${it.title}`, incl: install });
    return rows;
  });
  if (courierCharge > 0) {
    invoiceLines.push({
      label: `Courier (wallpaper order under ${MIN_WALLPAPER_SQFT} sq ft)`,
      incl: courierCharge,
    });
  }
  if (expressSelected && wallpaperQty > 0) {
    if (campaignActive) {
      invoiceLines.push({ label: `${HOMECOMING_EXPRESS_CODE} · Free express delivery`, incl: 0 });
    } else {
      invoiceLines.push({
        label: `Express delivery · ${wallpaperQty} × ${money(EXPRESS_SHIPPING.perWallpaperCharge)}`,
        incl: wallpaperQty * EXPRESS_SHIPPING.perWallpaperCharge,
      });
      invoiceLines.push({ label: "Express order handling", incl: EXPRESS_SHIPPING.perOrderCharge });
    }
  }

  // Discount reduces the GOODS price (mirrors checkout_cart's math exactly);
  // shipping is never discounted. The gift card then covers the reduced total.
  const goodsTotal = Math.round(items.reduce((s, it) => s + it.line_total, 0));
  const wallpaperGoodsTotal = Math.round(items.reduce(
    (sum, item) => ((item.category ?? "wallpaper") === "wallpaper" ? sum + item.line_total : sum),
    0,
  ));
  const discountEstimate = discountAmount(campaignActive ? wallpaperGoodsTotal : goodsTotal, discount);
  if (discountEstimate > 0) {
    // Negative line: the GST breakup and total then read the discounted price.
    invoiceLines.push({ label: `${appliedLabel(discount!, money)} · ${discountCode.trim()}`, incl: -discountEstimate });
  }
  const cartTotal = goodsTotal - discountEstimate + shippingCharge;
  // Women-entrepreneurs contribution — funded by Zyvorah, shown only on the paid
  // thank-you screen. Deliberately NOT part of cartTotal / GST / shipping / payable.
  const contributionTotal = items.reduce(
    (s, it) => s + (it.handle === "bespoke-customisation" ? 0 : womenContribution(it.area_sqft, it.quantity)),
    0,
  );
  const giftApplyEstimate = gift?.valid ? Math.min(gift.balance ?? 0, cartTotal) : 0;
  const payable = Math.max(0, cartTotal - giftApplyEstimate);

  const checkGift = async () => {
    if (!giftCode.trim() || giftBusy) return;
    setGiftBusy(true);
    try {
      const res = await fetch("/api/gift-card/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: giftCode.trim() }),
      });
      const d = await res.json();
      setGift({ valid: !!d.valid, balance: d.balance });
    } catch {
      setGift({ valid: false });
    } finally {
      setGiftBusy(false);
    }
  };
  // Pre-fill from whatever this browser already gave us — a prior order, a
  // sample order, or their login email — so checkout doesn't re-ask for it.
  const [form, setForm] = useState(() => ({
    name: "",
    email: session?.user?.email ?? "",
    phone: "",
    line1: "",
    city: "",
    state: "",
    pincode: "",
    gstin: "",
    billingName: "",
    ...readSavedContact(),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  // Once the order exists, the one-time code is spoken for — drop the saved copy.
  useEffect(() => { if (placed) clearSavedDiscount(); }, [placed]);
  // Session resolves after the initial render — backfill the email once it
  // does, but only if nothing (saved contact or typing) has filled it already.
  useEffect(() => {
    if (session?.user?.email) {
      setForm((f) => (f.email ? f : { ...f, email: session.user.email! }));
    }
  }, [session]);
  // Consents required only when the cart contains a customer-supplied ("Print
  // Your Own") design. All three must be ticked before payment.
  const [consent, setConsent] = useState({ rights: false, enhance: false, variation: false });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // ── A shorter address (founder, 11 October 2026) ─────────────────────────
  // The PIN code fills city and state from our own directory (public/pin,
  // scripts/gen-pincodes.mjs): one small file per PIN prefix, fetched only
  // when six digits are typed. A box is filled only if it is empty or still
  // holds what the previous PIN put there — never over what was typed.
  const pinFilled = useRef<{ city: string; state: string } | null>(null);
  const pastedAddress = useRef(false);
  useEffect(() => {
    if (market.countryCode !== "IN") return;
    const pin = form.pincode.replace(/\s/g, "");
    if (!/^[1-9]\d{5}$/.test(pin)) return;
    let live = true;
    fetch(`/pin/${pin.slice(0, 2)}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((shard: Record<string, [string, string]> | null) => {
        const hit = shard?.[pin.slice(2)];
        if (!live || !hit) return;
        const [city, state] = hit;
        const prev = pinFilled.current;
        pinFilled.current = { city, state };
        // Read once, outside the updater: React may run an updater twice.
        const fromPaste = pastedAddress.current;
        pastedAddress.current = false;
        setForm((f) => {
          const cityFree = !f.city.trim() || (prev !== null && f.city === prev.city);
          const stateFree = !f.state.trim() || (prev !== null && f.state === prev.state);
          // A pasted whole address ends "…, Mumbai, Maharashtra 400001, India";
          // once the boxes hold the city and state, the street line drops them.
          let line1 = f.line1;
          if (fromPaste) {
            const tail = new Set([city, state, f.city, f.state, "india"].map((t) => t.trim().toLowerCase()).filter(Boolean));
            const parts = line1.split(",").map((t) => t.trim());
            while (parts.length > 1 && tail.has(parts[parts.length - 1]!.toLowerCase())) parts.pop();
            line1 = parts.join(", ");
          }
          return { ...f, line1, city: cityFree ? city : f.city, state: stateFree ? state : f.state };
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [form.pincode, market.countryCode]);

  // Paste a whole address into the street box and it is split: the PIN code
  // goes to its own box (which then fills city and state, above).
  const pasteAddress = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (market.countryCode !== "IN" || !/\n|,/.test(text)) return;
    const pin = text.match(/\b([1-9]\d{2})\s?(\d{3})\b(?![\s\S]*\b[1-9]\d{2}\s?\d{3}\b)/);
    if (!pin) return;
    e.preventDefault();
    const el = e.currentTarget;
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    const after = el.value.slice(el.selectionEnd ?? el.value.length);
    const street = (before + text.replace(pin[0], "") + after)
      .replace(/\b(pin(\s*code)?|pincode)\s*[:\-]?\s*(?=,|$)/gi, "")
      .split(/\s*[\n,]+\s*/)
      .filter(Boolean)
      .join(", ");
    pastedAddress.current = true;
    setForm((f) => ({ ...f, line1: street, pincode: `${pin[1]}${pin[2]}` }));
  };

  // A returning customer sees their details as one card with "Change", not
  // nine boxes. Decided once — when the page opens with a saved address, or
  // when a signed-in customer's last order supplies one — never mid-typing,
  // or the form would fold shut under a new shopper's last keystroke.
  const [addressCard, setAddressCard] = useState(false);
  const cardCheck = useRef(true);
  useEffect(() => {
    if (!cardCheck.current) return;
    cardCheck.current = false;
    const contactAndAddress = missingFields.filter((m) => m !== "a valid GSTIN");
    if (contactAndAddress.length === 0) setAddressCard(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a one-shot check per prefill
  }, [form]);
  const lastAddressAsked = useRef(false);
  useEffect(() => {
    if (!session?.user?.email || lastAddressAsked.current) return;
    lastAddressAsked.current = true;
    fetch("/api/account/last-address", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { address?: { name: string; phone: string; line1: string; city: string; state: string; pincode: string; countryCode: string; gstin: string; billingName: string } | null } | null) => {
        const a = d?.address;
        if (!a || a.countryCode !== market.countryCode) return;
        setForm((f) => {
          // Only into an untouched address: never over something typed here.
          if (f.line1.trim() || f.pincode.trim()) return f;
          cardCheck.current = true;
          return {
            ...f,
            name: f.name || a.name,
            phone: f.phone || a.phone,
            line1: a.line1,
            city: a.city,
            state: a.state,
            pincode: a.pincode,
            gstin: f.gstin || a.gstin,
            billingName: f.billingName || a.billingName,
          };
        });
      })
      .catch(() => {});
  }, [session, market.countryCode]);

  // GST is for the few buying for a business: a link until asked for, open
  // when a GSTIN is already on file.
  const [gstAsked, setGstAsked] = useState(false);
  const showGst = gstAsked || !!form.gstin.trim() || !!form.billingName.trim();
  // A complete GSTIN is checked at once: its check digit here, then the GST
  // register (/api/gstin/verify), which also gives the business name — filled
  // in unless the buyer has typed their own. An inactive registration cannot
  // go on a tax invoice, so it holds the order with the register's word.
  const [gstCheck, setGstCheck] = useState<{ gstin: string; state: "checking" | "ok" | "inactive" | "unavailable"; status?: string | null } | null>(null);
  const gstNameAuto = useRef<string | null>(null);
  useEffect(() => {
    const g = form.gstin.trim().toUpperCase();
    if (market.countryCode !== "IN" || !gstinChecksumOk(g)) {
      setGstCheck(null);
      return;
    }
    let live = true;
    setGstCheck({ gstin: g, state: "checking" });
    fetch("/api/gstin/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gstin: g }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { valid?: boolean; status?: string | null; legalName?: string | null; unavailable?: boolean } | null) => {
        if (!live) return;
        if (!d || d.unavailable) return setGstCheck({ gstin: g, state: "unavailable" });
        if (!d.valid) return setGstCheck({ gstin: g, state: "inactive", status: d.status ?? null });
        setGstCheck({ gstin: g, state: "ok", status: d.status ?? null });
        const name = d.legalName?.trim();
        if (name) {
          const prev = gstNameAuto.current;
          gstNameAuto.current = name;
          setForm((f) => (!f.billingName.trim() || f.billingName === prev ? { ...f, billingName: name } : f));
        }
      })
      .catch(() => live && setGstCheck({ gstin: g, state: "unavailable" }));
    return () => {
      live = false;
    };
  }, [form.gstin, market.countryCode]);

  // A signed-in shopper has given us their email already: it is a line, not
  // a box, unless they want updates somewhere else.
  const [emailEdit, setEmailEdit] = useState(false);
  // Once the PIN has filled city and state they read as one line with Edit.
  const [placeEdit, setPlaceEdit] = useState(false);

  // On a phone, Place order rides a bar at the foot of the screen (as the
  // cart's Checkout does) and publishes its height so the WhatsApp button
  // and the concierge stop short of it.
  const payBarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = payBarRef.current;
    const root = document.documentElement;
    if (!el) return;
    const apply = () => root.style.setProperty("--sticky-cta-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--sticky-cta-h");
    };
  }, [items.length, loading, placed]);

  // Installation is only sold where we have an installer — the pincode decides
  // (src/lib/install-cities.ts). Surfaced as soon as they type the pincode, so
  // nobody reaches payment only to be refused by the server-side gate.
  const [stripping, setStripping] = useState(false);
  const installTotalInCart = items.reduce((s, it) => s + (it.installation ?? 0), 0);
  const installArea = resolveInstallEligibility({ pincode: form.pincode });
  // Blocked only by a PIN code we have checked and cannot install at — never by
  // one not yet typed, which used to put "Remove installation to continue" on
  // the button before the buyer had reached the address fields.
  const installBlocked = installTotalInCart > 0 && (market.countryCode !== "IN" || installArea.reason === "out_of_area");
  // Until the PIN code is complete the installer can't be confirmed, so it is
  // asked for like any other missing field (the server gate refuses it too).
  const installPinPending = installTotalInCart > 0 && market.countryCode === "IN" && installArea.reason === "unknown";

  // Installation can never stay in a cart we cannot install at (founder,
  // 11 October 2026): the moment the PIN code (or country) rules it out, it is
  // taken off the order on its own and a one-line notice says so. Nothing to
  // click, nothing to read first.
  const [installRemovedFor, setInstallRemovedFor] = useState<string | null>(null);
  const removeInstallation = async (reason: string) => {
    if (stripping) return;
    setStripping(true);
    try {
      const res = await fetch("/api/cart/installation", { method: "DELETE" });
      if (!res.ok) throw new Error("strip failed");
      await refresh();
      setInstallRemovedFor(reason);
    } catch {
      setError("We couldn't update your order just now — please refresh the page.");
    } finally {
      setStripping(false);
    }
  };
  const installRuledOutBy = market.countryCode !== "IN" ? market.countryName : form.pincode.trim();
  useEffect(() => {
    if (installBlocked && !stripping) void removeInstallation(installRuledOutBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on the block itself
  }, [installBlocked, installRuledOutBy]);

  const hasCustom = items.some((i) => i.handle === "custom-wallpaper");
  const consentOk = !hasCustom || (consent.rights && consent.enhance && consent.variation);

  // GSTIN is optional, but if provided it must be a valid 15-char GSTIN.
  const gstinOk = market.countryCode !== "IN" || !form.gstin.trim() || (gstinChecksumOk(form.gstin) && gstCheck?.state !== "inactive");

  // A mobile number in India too (7 October 2026). The courier needs one,
  // and it lets us reach a shopper whose payment window closed. Razorpay asks for it
  // anyway, so this moves the question, it does not add one.
  const phoneDigits = form.phone.replace(/\D/g, "");
  const phoneOk = market.countryCode === "IN"
    ? /^(?:91|0)?[6-9]\d{9}$/.test(phoneDigits)
    : form.phone.trim().length >= 7;

  // Which required boxes are still empty or wrong. Each carries an asterisk;
  // one turns red once the shopper has left it, or pressed Place order — the
  // form says what is pending, so no sentence under the button has to.
  const pending = {
    name: !form.name.trim(),
    phone: !phoneOk,
    email: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email),
    line1: !form.line1.trim(),
    city: !form.city.trim(),
    state: market.countryCode !== "IN" && !form.state.trim(),
    pincode: !form.pincode.trim() || installPinPending,
  };
  const [touched, setTouched] = useState<Partial<Record<keyof typeof pending, boolean>>>({});
  const [triedSubmit, setTriedSubmit] = useState(false);
  const showPending = (k: keyof typeof pending) => pending[k] && (triedSubmit || !!touched[k]);
  const leave = (k: keyof typeof pending) => () => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));

  const missingFields = [
    ...(form.name.trim() ? [] : ["your name"]),
    ...(phoneOk ? [] : [market.countryCode === "IN" ? "a 10-digit mobile number" : "a phone number"]),
    ...(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) ? [] : ["your email"]),
    ...(form.line1.trim() ? [] : ["your address"]),
    ...(form.city.trim() ? [] : ["your city"]),
    ...(market.countryCode !== "IN" && !form.state.trim() ? ["your state"] : []),
    ...(form.pincode.trim() && !installPinPending ? [] : [market.countryCode === "IN" ? (form.pincode.trim() ? "a 6-digit PIN" : "your PIN") : "your postal code"]),
    ...(gstinOk ? [] : ["a valid GSTIN"]),
  ];
  const valid =
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) &&
    form.name.trim() &&
    form.line1.trim() &&
    form.city.trim() &&
    form.pincode.trim() &&
    // Every courier needs a consignee phone; see phoneOk above.
    phoneOk &&
    (market.countryCode === "IN" || form.state.trim()) &&
    gstinOk &&
    consentOk &&
    !installPinPending &&
    !installBlocked;

  const placeOrder = async () => {
    if (busy) return;
    if (!valid) {
      void trackPurchaseProgress("checkout_validation_blocked");
      setTriedSubmit(true);
      // A missing detail is shown on its own box, in red; take them to the first.
      const firstPending = (Object.keys(pending) as (keyof typeof pending)[]).find((k) => pending[k]);
      if (!installBlocked && consentOk && firstPending) {
        setError(null);
        setAddressCard(false);
        const box = document.querySelector<HTMLInputElement>(`[data-field="${firstPending}"]`);
        box?.scrollIntoView({ behavior: "smooth", block: "center" });
        box?.focus({ preventScroll: true });
        return;
      }
      setError(installBlocked ? "One moment — we're updating your order for this address."
        : !consentOk ? "Please review and accept the artwork permissions below."
        : `Please complete ${missingFields.join(", ")}.`);
      document.getElementById("checkout-validation")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    setError(null);
    // Freeze the contribution now — the cart is cleared on success.
    const contributionAtOrder = contributionTotal;
    // Freeze the GA purchase payload too — refresh() empties the cart before
    // the Razorpay handler resolves.
    const itemsAtOrder = items;
    // GA funnel: the address is valid and the order is being posted.
    const funnelCoupon = discount?.valid ? discountCode.trim() : undefined;
    const funnelStep = { items: itemsAtOrder, countryCode: market.countryCode, currency: market.currency, coupon: funnelCoupon };
    gaAddShippingInfo({ ...funnelStep, shippingTier: expressSelected ? "express" : "standard" });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          gstin: form.gstin.trim().toUpperCase() || null,
          billingName: form.billingName.trim() || null,
          giftCode: market.countryCode === "IN" ? giftCode.trim() || null : null,
          discountCode: discount?.valid ? discountCode.trim() : null,
          express: expressSelected,
          countryCode: market.countryCode,
          shippingAddress: {
            name: form.name,
            line1: form.line1,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
            country: market.countryName,
            countryCode: market.countryCode,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        void trackPurchaseProgress("checkout_request_failed");
        if (isAuthRequired(res, data)) {
          setAuthOpen(true);
          setError("Please verify your email to place this order.");
          return;
        }
        if (data.error === "install_not_serviceable") {
          // The server's gate caught what the PIN check above did not: take
          // installation off here too rather than asking the buyer to.
          await removeInstallation(form.pincode.trim() || "this address");
          setError("Your order has been updated — press Place order again to continue.");
          return;
        }
        setError(
          data.error === "payments_unavailable"
            ? data.orderPlaced
              ? "Your order and details are saved, but we couldn't open the payment window just now — nothing has been charged, and the order goes ahead once it is paid. Press Place order again to pay; it picks up this same order, so there is no need to start over. For help, write to hello@zyvorah.com."
              : "Online payments aren't available just yet — your order hasn't been placed. Please try again shortly."
              : // `detail` is written by the server and is customer-safe copy.
                // It used to be Postgres' own words, translated HERE by
                // string-matching the exception text — which put the message a
                // customer reads one stale bundle away from saying "no open
                // cart", as Shades' did. Known database phrasings stay mapped
                // below only for a browser still holding an older reply.
                data.detail === "no open cart" || data.detail === "cart empty"
                ? "This basket has already been checked out. Add your items again and you can check out straight away."
                : data.detail || "Something went wrong placing your order — please try again.",
        );
        return;
      }

      // Only a YES is recorded: leaving the box unticked must not undo a yes
      // given earlier. Checkout requires a verified sign-in, so this lands on
      // the customer who proved the address.

      // Order accepted with this contact + address — remember it so the next
      // order (or a sample order) doesn't ask again in this browser.
      writeSavedContact({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        line1: form.line1.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
      });

      const downloadCopy = () => {
        if (!data.orderCopyUrl) return;
        const a = document.createElement("a");
        a.href = data.orderCopyUrl;
        a.download = `zyvorah-order-${data.zvy ?? data.orderNumber}.pdf`;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        a.remove();
      };

      // If Razorpay is configured, collect payment before confirming.
      const rzp: RazorpayInfo | null = data.razorpay ?? null;
      const purchaseAccounting = gaPurchaseAccounting(data);
      // Analytics is deliberately best-effort. A legacy or malformed checkout
      // response must never interfere with payment confirmation or order UI.
      const trackPurchase = () => {
        if (!purchaseAccounting || isInternalOrder(form.email)) return;
        try {
          gaPurchase({
            transactionId: data.zvy ?? `#${data.orderNumber}`,
            value: purchaseAccounting.value,
            items: itemsAtOrder,
            countryCode: purchaseAccounting.countryCode,
            currency: purchaseAccounting.currency,
            shipping: purchaseAccounting.shipping,
            tax: purchaseAccounting.tax,
            coupon: purchaseAccounting.coupon,
            user: { email: form.email, phone: form.phone },
          });
        } catch {
          /* telemetry must never interrupt a paid order */
        }
      };
      // Meta's sibling of trackPurchase. It exists as a closure for one
      // reason: the gift-card path below used to call trackPurchase() alone,
      // so an order paid entirely with a gift card was counted in GA and
      // invisible to Meta. Two names, one call site each, is how that
      // happened; one name per channel is how it stops.
      const trackMetaPurchase = () => {
        if (!purchaseAccounting || isInternalOrder(form.email)) return;
        // Advanced matching first — fbq applies it to events fired after it.
        metaAdvancedMatching({ email: form.email, phone: form.phone });
        metaPurchase({
          pixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID,
          orderId: data.zvy ?? String(data.orderNumber),
          currency: purchaseAccounting.currency,
          value: purchaseAccounting.value,
          shipping: purchaseAccounting.shipping,
          tax: purchaseAccounting.tax,
          handles: itemsAtOrder.map((item) => item.handle),
        });
      };
      // OpenAI's sibling of trackMetaPurchase. Same rule as the comment above:
      // one named closure per channel, called at every call site, so a payment
      // path added later cannot reach one ad platform and miss another. The
      // TOTAL is metaPurchaseValue() rather than a second sum of the same
      // parts — the two channels must report the same rupees or the ROAS
      // comparison between them is meaningless.
      const trackOpenAiPurchase = () => {
        if (!purchaseAccounting || isInternalOrder(form.email)) return;
        const total = metaPurchaseValue(purchaseAccounting);
        if (total === null) return;
        // Identity first — the pixel applies it to events fired after it.
        openAiIdentify({ email: form.email, phone: form.phone });
        openAiOrderCreated({
          orderId: data.zvy ?? String(data.orderNumber),
          currency: purchaseAccounting.currency,
          amount: total,
          contents: itemsAtOrder.map((item) => ({
            id: metaContentId(item.handle),
            name: item.title,
            // Per-metre lines carry metres in `quantity`; OpenAI's schema only
            // accepts an integer, so a 2.5m border reports as 3 pieces rather
            // than being dropped for an invalid field.
            quantity: Math.max(1, Math.round(item.quantity)),
            amount: metaPresentmentFromInr(
              item.line_total,
              purchaseAccounting.countryCode,
              purchaseAccounting.currency,
            ),
          })),
        });
      };
      if (rzp) {
        const ready = await loadRazorpay();
        if (!ready) {
          void trackPurchaseProgress("payment_window_failed");
          gaEvent("payment_window_failed", { reason: "script_unavailable" });
          setError("Couldn't load the payment window. Your order is saved; try again to resume payment.");
          return;
        }
        const RZP = (window as unknown as {
          Razorpay: new (o: unknown) => {
            open: () => void;
            on: (event: "payment.failed", cb: (resp: { error?: Record<string, unknown> }) => void) => void;
          };
        }).Razorpay;
        const rp = new RZP({
          key: rzp.keyId,
          order_id: rzp.razorpayOrderId,
          amount: rzp.amount,
          currency: rzp.currency,
          name: "Zyvorah",
          description: `Order ${data.zvy ?? `#${data.orderNumber}`}`,
          prefill: { name: form.name, email: form.email, contact: form.phone },
          theme: { color: "#1a1a1a" },
          handler: async (resp: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const v = await fetch("/api/razorpay/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(resp),
              });
              if (v.ok) {
                // The ZVY number is minted at payment, not at Place order, so
                // it arrives here. Every purchase event below and the
                // confirmation quote it — the server-side GA and Meta events
                // use the same number, which is how the pairs dedupe.
                const verified = (await v.json().catch(() => null)) as { zvy?: string | null } | null;
                if (verified?.zvy) data.zvy = verified.zvy;
                trackPurchase();
                trackMetaPurchase();
                trackOpenAiPurchase();
                setPlaced({ orderNumber: data.orderNumber, zvy: data.zvy, orderCopyUrl: data.orderCopyUrl, paymentPending: false, giftApplied: data.giftApplied, contribution: contributionAtOrder, preorderBook: hasPreorderBook });
                await refresh();
                downloadCopy();
              } else {
                void trackPurchaseProgress("payment_verification_failed");
                gaEvent("payment_verification_failed", { reason: "response", http_status: v.status });
                setError("We couldn't confirm your payment. If money was deducted, email hello@zyvorah.com with order " + (data.zvy ?? "#" + data.orderNumber) + ".");
              }
            } catch {
              void trackPurchaseProgress("payment_verification_failed");
              gaEvent("payment_verification_failed", { reason: "network" });
              setError("Your payment confirmation could not be checked. If money was deducted, do not pay again; email hello@zyvorah.com with order " + (data.zvy ?? "#" + data.orderNumber) + ".");
            }
          },
          modal: {
            ondismiss: () => {
              void trackPurchaseProgress("payment_window_dismissed");
              gaEvent("payment_window_dismissed", {});
              setError("Payment wasn't completed, so your order hasn't been placed yet. Your order and details are saved — press Place order again to pay and confirm it.");
            },
          },
        });
        // A payment that dies INSIDE the window used to report to nobody —
        // order #89 (9 October 2026) failed here twice and the store heard
        // nothing. Razorpay keeps its own modal open for a retry; this only
        // tells us, with Razorpay's error attached.
        rp.on("payment.failed", (resp) => {
          void trackPurchaseProgress("payment_failed");
          gaEvent("payment_failed", { code: String(resp?.error?.code ?? ""), reason: String(resp?.error?.reason ?? "") });
          void fetch("/api/payment-failed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: data.orderId, error: resp?.error ?? {} }),
            keepalive: true,
          }).catch(() => {});
        });
        gaAddPaymentInfo({ ...funnelStep, paymentType: "razorpay" });
        rp.open();
        void trackPurchaseProgress("payment_window_opened");
        gaEvent("payment_window_opened", {});
        return;
      }
      if (data.fullyPaidByGift) gaAddPaymentInfo({ ...funnelStep, paymentType: "gift_card" });
      if (data.fullyCoveredByCode) gaAddPaymentInfo({ ...funnelStep, paymentType: "collaboration" });

      // Fully covered by gift card, or no gateway yet — capture accordingly.
      // GA purchase only when money actually moved; a payment-pending order
      // would inflate GA revenue against the store's own paid numbers.
      if (!data.paymentPending || data.fullyPaidByGift) {
        trackPurchase();
        trackMetaPurchase();
        trackOpenAiPurchase();
      }
      setPlaced({
        orderNumber: data.orderNumber,
        zvy: data.zvy,
        orderCopyUrl: data.orderCopyUrl,
        paymentPending: data.paymentPending,
        giftApplied: data.giftApplied,
        fullyPaidByGift: data.fullyPaidByGift,
        fullyCoveredByCode: data.fullyCoveredByCode,
        contribution: contributionAtOrder,
        preorderBook: hasPreorderBook,
      });
      await refresh();
      downloadCopy();
    } catch {
      void trackPurchaseProgress("checkout_request_failed");
      setError("Couldn't reach the store just now — please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (placed) {
    const estimatedDeliveryDate = istDateKey(
      market.countryCode === "IN"
        ? expressSelected
          ? expressEst.deliveryTo
          : standardEst.deliveryTo
        : addWorkingDays(standardEst.dispatchBy, internationalTransit.max),
    );
    return (
      <div className="container-x py-16">
        {!placed.paymentPending && (
          <GoogleCustomerReviewOptIn
            order_id={placed.zvy ?? String(placed.orderNumber)}
            email={form.email.trim()}
            delivery_country={market.countryCode}
            estimated_delivery_date={estimatedDeliveryDate}
          />
        )}
        <div className="mx-auto max-w-lg text-center">
          <h1 className="font-display text-2xl font-bold">
            {placed.paymentPending
              ? "Thank you — your order is saved"
              : `Thank you — order ${placed.zvy ?? `#${placed.orderNumber}`} placed`}
          </h1>
          <p className="mt-3 text-sm text-slate">
            {placed.fullyCoveredByCode
              ? "Confirmed — this wall is our gift to you. It is going into production, and we will be in touch about delivery."
              : placed.fullyPaidByGift
              ? placed.preorderBook
                ? "Paid in full with your gift card. Your TAASH book pre-order is confirmed."
                : "Paid in full with your gift card. Your mural is going into production."
              : placed.paymentPending
                ? "Nothing has been charged yet. Your order goes ahead once it is paid — we'll be in touch about payment."
                : placed.preorderBook
                  ? "Payment received. Your TAASH book pre-order is confirmed."
                  : "Payment received. Your mural is going into production."}
          </p>
          {placed.giftApplied != null && placed.giftApplied > 0 && !placed.fullyPaidByGift && (
            <p className="mt-1 text-sm text-slate">{money(placed.giftApplied)} paid by gift card.</p>
          )}
          {!placed.paymentPending && <p className="mt-2 text-sm text-slate">{placed.orderCopyUrl ? "Your order copy is ready and saved to your order." : "Your order copy is being prepared and will be saved to your order."}</p>}
          {placed.orderCopyUrl && (
            <a href={placed.orderCopyUrl} target="_blank" rel="noopener noreferrer" className="btn mt-6 inline-flex h-11 px-6 text-[0.8rem]">
              Download order copy (PDF)
            </a>
          )}
          {/* The ONE place the women-entrepreneurs contribution is shown to a
              customer (Roheena, 11 October 2026): after money has actually
              been received, never before — not on the product page, cart,
              checkout summary or confirmation email, where it read as a
              charity ask. An unpaid (payment-pending) order shows nothing. */}
          {!placed.paymentPending && !placed.fullyCoveredByCode && placed.contribution != null && placed.contribution > 0 && (
            <div className="mx-auto mt-8 max-w-md rounded-[18px] bg-wash px-6 py-5 text-center">
              <p className="font-display text-base font-semibold text-charcoal">
                Thank you for your purchase.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate">
                On your behalf, Zyvorah is contributing {money(placed.contribution)} to its grant
                and mentorship fund for women entrepreneurs.
              </p>
            </div>
          )}
          <div className="mt-4">
            <Link href="/collections" className="text-sm font-semibold underline underline-offset-2">
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="container-x py-16 text-center">
        {readError ? <div role="alert"><p className="text-sm text-slate">We couldn’t load your saved cart. Please try again.</p><button onClick={() => void refresh()} className="btn mt-4 min-h-11 px-6">Reload cart</button></div> : <PendingOrderRecovery />}
        <Link href="/collections" className="btn mt-5 inline-flex h-11 px-6 text-[0.8rem]">Browse designs</Link>
      </div>
    );
  }


  const placeButton = (
    <button onClick={placeOrder} disabled={busy} className="btn h-12 w-full text-[0.82rem] disabled:opacity-40">
      {busy
        ? payable === 0 ? "Confirming order…" : "Opening secure payment…"
        : installBlocked
          ? "Updating your order…"
          : hasCustom && !consentOk
            ? "Tick the boxes to continue"
            : payable === 0 ? (giftApplyEstimate > 0 ? "Confirm gift-card order" : "Confirm order") : `Place order · ${money(payable)}`}
    </button>
  );
  const fieldBase = "h-12 w-full min-w-0 rounded-[14px] border border-edge bg-surface outline-none transition-colors focus:border-charcoal";
  const field = `${fieldBase} px-4`;
  // A required box still to be filled, once the shopper has been past it.
  const req = (k: keyof typeof pending) =>
    showPending(k) ? " border-alert placeholder:text-alert/80 focus:border-alert" : "";
  // Delivery speed opens the page, right under "Checkout" (founder,
  // 11 October 2026): two small side-by-side choices, and the total in the
  // summary just below moves the moment Express is picked.
  const speed = (
    <div className="mt-3">
      <div className={`grid gap-2 ${market.countryCode === "IN" && wallpaperQty > 0 && !campaignActive ? "grid-cols-2" : ""} sm:max-w-md`}>
        {campaignActive && market.countryCode === "IN" && wallpaperQty > 0 ? (
          <div className="rounded-[10px] border-2 border-[#134f57] bg-[#134f57] px-3 py-2 text-[#fff9ef]">
            <span className="block text-[0.78rem] font-bold leading-tight">Express delivery · Free</span>
            <span className="mt-0.5 block text-[0.68rem] leading-tight text-[#d8e3df]">
              {HOMECOMING_EXPRESS_CODE} applied automatically · estimated by {formatShipDate(expressEst.deliveryTo)}
            </span>
          </div>
        ) : <>
        <button
          type="button"
          onClick={() => setExpress(false)}
          aria-pressed={!express}
          className={`rounded-[10px] border-2 px-2.5 py-1.5 text-left transition-colors ${!express ? "border-charcoal bg-surface" : "border-edge bg-surface hover:border-slate"}`}
        >
          <span className="block text-[0.75rem] font-semibold leading-tight text-charcoal">
            {hasPreorderBook && wallpaperQty === 0
              ? "Pre-order delivery"
              : market.countryCode === "IN"
              ? "Standard delivery"
              : "International delivery"}
          </span>
          <span className="block text-[0.68rem] leading-tight text-slate">
            {hasPreorderBook && wallpaperQty === 0
              ? "Dispatched when the first edition is ready"
              : market.countryCode === "IN"
              ? <>By {formatShipDate(standardEst.deliveryTo)}</>
              : <>Dispatch by {formatShipDate(standardEst.dispatchBy)} · {internationalTransit.min}–{internationalTransit.max} working days in transit</>}
          </span>
        </button>
        {market.countryCode === "IN" && wallpaperQty > 0 && <button
          type="button"
          onClick={() => setExpress(true)}
          aria-pressed={express}
          className={`rounded-[10px] border-2 px-2.5 py-1.5 text-left transition-colors ${express ? "border-charcoal bg-surface" : "border-edge bg-surface hover:border-slate"}`}
        >
          <span className="block text-[0.75rem] font-semibold leading-tight text-charcoal">Express delivery</span>
          <span className="block text-[0.68rem] leading-tight text-slate">By {formatShipDate(expressEst.deliveryTo)}</span>
        </button>}
        </>}
      </div>
      {hasPreorderBook && wallpaperQty > 0 && (
        <p className="mt-2 text-[0.7rem] text-mist">
          The TAASH book is a pre-order and ships separately when the first edition is ready.
        </p>
      )}
    </div>
  );
  const bill = (
    <>
      <MarketInvoiceBreakdown
        lines={invoiceLines}
        freightToPay={freightToPay}
        deliveryFree={(campaignActive && expressSelected) || (!expressSelected && courierCharge === 0)}
        areaSqFt={wallpaperBilledSqFt}
        tubeCount={Math.max(1, wallpaperQty)}
      />
      <p className="mt-2 text-[0.7rem] text-mist">
        {market.countryCode === "IN"
          ? "All prices include GST."
          : "Country-adjusted USD pricing includes the international delivery shown above. Duties, customs and destination taxes are excluded."}
      </p>
    </>
  );

  return (
    <div className="container-x py-10 pb-[calc(env(safe-area-inset-bottom)+140px)] lg:pb-10">
      <h1 className="font-display text-2xl font-bold">Checkout</h1>
      {speed}
      {/* On a phone the bill used to sit a long scroll below the form, so
          checkout opened on empty boxes with no sign of what was being bought
          or for how much — and the one shopper who reached it on 8 Oct 2026
          left eight seconds later. The whole bill now opens the page on a
          phone (founder, 11 October 2026); on desktop it is in the sidebar. */}
      <section aria-label="Order summary" className="mt-3 rounded-[18px] bg-wash p-3.5 lg:hidden">
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {items.map((item) => (
            <span key={item.item_id} className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px] bg-surface">
              {item.image ? <Image src={item.image} alt={item.title} fill sizes="44px" className="object-cover" /> : <span className="flex h-full items-center justify-center p-1 text-center text-[0.6rem] leading-tight">{item.title}</span>}
            </span>
          ))}
        </div>
        {bill}
      </section>
      <div className="mt-5 grid gap-5 lg:mt-8 lg:grid-cols-[1.4fr_1fr] lg:gap-10">
        <div className="space-y-3">
          {/* The country is already known from where they shop (the market),
              so it is a line they can change, not a field to fill. */}
          <div className="flex items-center justify-between gap-3">
            <p className="caps whitespace-nowrap text-slate">{addressCard ? "Deliver to" : "Your details"}</p>
            <ShipToCountry className="whitespace-nowrap rounded-full bg-wash px-3 py-1.5 text-xs" />
          </div>
          {addressCard ? (
            <div className="flex items-start justify-between gap-3 rounded-[14px] border border-edge bg-surface px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-charcoal">{form.name} · {form.phone}</p>
                <p className="truncate text-slate">{form.email}</p>
                <p className="mt-1 text-slate">{[form.line1, form.city, form.state].filter((t) => t.trim()).join(", ")} {form.pincode}</p>
              </div>
              <button type="button" onClick={() => setAddressCard(false)} className="min-h-10 shrink-0 text-xs font-semibold text-charcoal underline underline-offset-2">
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <input className={field + req("name")} data-field="name" aria-required="true" aria-invalid={showPending("name")} name="name" autoComplete="name" placeholder="Full name *" value={form.name} onChange={set("name")} onBlur={leave("name")} />
                <input className={field + req("phone")} data-field="phone" aria-required="true" aria-invalid={showPending("phone")} type="tel" name="phone" autoComplete="tel" inputMode="tel" placeholder={market.countryCode === "IN" ? "Mobile number *" : "Phone (for customs) *"} value={form.phone} onChange={set("phone")} onBlur={leave("phone")} />
              </div>
              {session?.user?.email && !emailEdit && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) ? (
                <p className="text-xs text-slate">
                  Order updates go to <span className="text-charcoal">{form.email}</span> ·{" "}
                  <button type="button" onClick={() => setEmailEdit(true)} className="min-h-8 underline underline-offset-2 hover:text-charcoal">
                    use a different email
                  </button>
                </p>
              ) : (
                <input className={field + req("email")} data-field="email" aria-required="true" aria-invalid={showPending("email")} type="email" name="email" autoComplete="email" inputMode="email" placeholder="Email *" value={form.email} onChange={set("email")} onBlur={leave("email")} autoFocus={emailEdit} />
              )}
              <input className={field + req("line1")} data-field="line1" aria-required="true" aria-invalid={showPending("line1")} name="address" autoComplete="shipping street-address" placeholder={market.countryCode === "IN" ? "Address * — or paste your full address" : "Address *"} value={form.line1} onChange={set("line1")} onBlur={leave("line1")} onPaste={pasteAddress} />
              {/* PIN first: it fills the city and state, which then read as
                  one line (Edit opens the two boxes). */}
              <div className="grid grid-cols-[5.25rem_1fr] gap-2 sm:gap-3">
                <input className={`${fieldBase} px-3${req("pincode")}`} data-field="pincode" aria-required="true" aria-invalid={showPending("pincode")} name="postal" autoComplete="shipping postal-code" inputMode={market.countryCode === "IN" ? "numeric" : "text"} placeholder={market.countryCode === "IN" ? "PIN *" : "Postal code *"} value={form.pincode} onChange={set("pincode")} onBlur={leave("pincode")} />
                {market.countryCode === "IN" && !placeEdit && pinFilled.current && form.city === pinFilled.current.city && form.state === pinFilled.current.state && /^[1-9]\d{5}$/.test(form.pincode.trim()) ? (
                  <div data-place className="flex h-12 min-w-0 items-center justify-between gap-2 rounded-[14px] bg-wash px-3 text-sm text-charcoal">
                    <span className="truncate">{form.city}, {form.state}</span>
                    <button type="button" onClick={() => setPlaceEdit(true)} className="min-h-10 shrink-0 text-xs text-slate underline underline-offset-2 hover:text-charcoal">Edit</button>
                  </div>
                ) : (
                  <div className="grid min-w-0 grid-cols-[1fr_1.3fr] gap-2 sm:gap-3">
                    <input className={`${fieldBase} px-3${req("city")}`} data-field="city" aria-required="true" aria-invalid={showPending("city")} name="city" autoComplete="shipping address-level2" placeholder="City *" value={form.city} onChange={set("city")} onBlur={leave("city")} />
                    <input className={`${fieldBase} px-3${req("state")}`} data-field="state" aria-required={market.countryCode !== "IN"} aria-invalid={showPending("state")} name="state" autoComplete="shipping address-level1" placeholder={market.countryCode === "IN" ? "State" : "State / province *"} value={form.state} onChange={set("state")} onBlur={leave("state")} />
                  </div>
                )}
              </div>
            </>
          )}
          {/* The notice that makes a follow-up call to an unfinished checkout
              fair: src/lib/voice-followup.ts only rings carts left after
              CART_CONSENT_SINCE, the day this line went up. */}
          <p className="text-xs text-slate">We may call or WhatsApp you if your order doesn&apos;t go through. Our assistant may be an AI; say &ldquo;stop&rdquo; anytime.</p>

          {installRemovedFor && (
            <p role="status" className="rounded-[12px] bg-blush/30 px-4 py-2.5 text-xs text-charcoal">
              Installation isn&apos;t available at {installRemovedFor} — we install in {INSTALL_CITIES_LABEL}. It has been removed from your order.
            </p>
          )}

          {market.countryCode === "IN" && (showGst ? <><p className="caps mt-4 text-slate">GST invoice <span className="normal-case tracking-normal text-mist">· optional, for a business</span></p>
          <div className="grid grid-cols-2 gap-3">
            <input
              className={`${field} ${form.gstin.trim() && !gstinOk ? "border-blush" : ""}`}
              placeholder="GSTIN"
              value={form.gstin}
              onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase().slice(0, 15) }))}
              maxLength={15}
              autoCapitalize="characters"
              autoFocus={gstAsked && !form.gstin}
            />
            <input className={field} placeholder="Business name" value={form.billingName} onChange={set("billingName")} />
          </div>
          {form.gstin.trim().length === 15 && !gstinChecksumOk(form.gstin) ? (
            <p className="text-xs text-charcoal/80">This GSTIN doesn&apos;t add up — please check each character.</p>
          ) : gstCheck?.state === "checking" ? (
            <p className="text-xs text-slate">Checking with the GST register…</p>
          ) : gstCheck?.state === "ok" ? (
            <p className="text-xs text-charcoal">✓ Verified on the GST register{gstCheck.status ? ` · ${gstCheck.status}` : ""}</p>
          ) : gstCheck?.state === "inactive" ? (
            <p className="text-xs text-charcoal/80">The GST register shows this GSTIN as {gstCheck.status ?? "not active"}, so we can&apos;t raise a GST invoice to it.</p>
          ) : form.gstin.trim() && form.gstin.trim().length < 15 ? (
            <p className="text-xs text-slate">A GSTIN has 15 characters.</p>
          ) : null}</> : (
            <button type="button" onClick={() => setGstAsked(true)} className="min-h-10 text-left text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal">
              Need a GST invoice for a business?
            </button>
          ))}

          <div id="checkout-validation" role="alert">{error && <p className="rounded-[12px] bg-blush/50 px-4 py-3 text-sm text-charcoal">{error}</p>}</div>
        </div>

        <div className="h-fit lg:rounded-[22px] lg:bg-wash lg:p-6 lg:sticky lg:top-32 lg:flex lg:max-h-[calc(100vh-10rem)] lg:flex-col">
          {/* Everything above the CTA scrolls internally on desktop — the cart
              summary can grow (many line items, GST breakup, consent boxes)
              but "Place order" must stay reachable without scrolling the page. */}
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="hidden lg:block">
            <p id="order-summary" className="caps mb-3 text-slate">Order summary</p>
            {bill}
          </div>

          {/* discount code (price adjustment) */}
          <div className="lg:mt-4 lg:border-t lg:border-edge lg:pt-4">
            {campaignActive ? (
              <div className="rounded-[14px] bg-[#134f57] px-4 py-3 text-[#fff9ef]">
                <p className="text-sm font-bold">Homecoming offers applied automatically</p>
                <div className="mt-2 grid gap-1 text-xs text-[#d8e3df]">
                  <span><strong className="text-[#fff9ef]">{HOMECOMING_DISCOUNT_CODE}</strong> · 25% off wallpapers</span>
                  <span><strong className="text-[#fff9ef]">{HOMECOMING_EXPRESS_CODE}</strong> · free express delivery</span>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span>Wallpaper discount</span><span>−{money(discountEstimate)}</span>
                </div>
              </div>
            ) : discountOpen ? (
              <>
                <label className="text-[0.72rem] font-semibold uppercase tracking-wide text-slate">Discount code</label>
                <div className="mt-2 flex gap-2">
                  <input
                    value={discountCode}
                    onChange={(e) => { setDiscountCode(e.target.value.toUpperCase()); setDiscount(null); }}
                    placeholder="e.g. ZVY15-10015-KQ3F"
                    autoFocus
                    className="h-10 flex-1 rounded-[12px] border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal"
                  />
                  <button onClick={() => void checkDiscount(undefined, form.email)} disabled={!discountCode.trim() || discountBusy} className="btn btn-ghost h-10 px-4 text-[0.72rem] disabled:opacity-40">
                    {discountBusy ? "…" : "Apply"}
                  </button>
                </div>
                {discount && !discount.valid && (
                  <p className="mt-1.5 text-xs text-charcoal/80">{refusalCopy(discount)}</p>
                )}
                {discount?.valid && (
                  <div className="mt-2 flex justify-between text-sm text-slate">
                    <span>{appliedLabel(discount, money)}</span><span>−{money(discountEstimate)}</span>
                  </div>
                )}
                {discount?.valid && discount.personalTo && (
                  <p className="mt-1 text-xs text-mist">Personal to {discount.personalTo} — the order email above must match.</p>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setDiscountOpen(true)}
                className="text-[0.78rem] font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
              >
                Have a code?
              </button>
            )}
          </div>

          {/* gift card (tender) */}
          {market.countryCode === "IN" && <div className="mt-1 lg:mt-4 lg:border-t lg:border-edge lg:pt-4">
            {giftOpen ? (
              <>
                <label className="text-[0.72rem] font-semibold uppercase tracking-wide text-slate">Gift card / voucher</label>
                <div className="mt-2 flex gap-2">
                  <input
                    value={giftCode}
                    onChange={(e) => { setGiftCode(e.target.value.toUpperCase()); setGift(null); }}
                    placeholder="ZYV-XXXX-XXXX-XXXX"
                    autoFocus
                    className="h-10 flex-1 rounded-[12px] border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal"
                  />
                  <button onClick={checkGift} disabled={!giftCode.trim() || giftBusy} className="btn btn-ghost h-10 px-4 text-[0.72rem] disabled:opacity-40">
                    {giftBusy ? "…" : "Apply"}
                  </button>
                </div>
                {gift && !gift.valid && <p className="mt-1.5 text-xs text-charcoal/80">That code isn&apos;t valid or has no balance.</p>}
                {gift?.valid && (
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between text-slate"><span>Gift card</span><span>−{money(giftApplyEstimate)}</span></div>
                    <div className="flex justify-between font-semibold text-charcoal"><span>Amount payable</span><span>{money(payable)}</span></div>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setGiftOpen(true)}
                className="text-[0.78rem] font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
              >
                Have a gift card?
              </button>
            )}
          </div>}
          {hasCustom && (
            <div className="mt-5 space-y-2.5 rounded-[16px] border border-edge bg-surface p-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-slate">
                Before we print your design
              </p>
              <ConsentRow
                checked={consent.rights}
                onChange={(v) => setConsent((c) => ({ ...c, rights: v }))}
              >
                I own or have full rights to print and use this image, and it doesn&apos;t infringe
                anyone&apos;s copyright.
              </ConsentRow>
              <ConsentRow
                checked={consent.enhance}
                onChange={(v) => setConsent((c) => ({ ...c, enhance: v }))}
              >
                I allow Zyvorah to enhance and adjust the image as needed for printing.
              </ConsentRow>
              <ConsentRow
                checked={consent.variation}
                onChange={(v) => setConsent((c) => ({ ...c, variation: v }))}
              >
                I understand the print may vary slightly from what I see on screen (phone/camera
                resolution, colour).
              </ConsentRow>
              <p className="pt-1 text-[0.68rem] leading-relaxed text-mist">
                By placing this order I confirm the above and agree to indemnify Zyvorah against any
                claim arising from the artwork I have supplied.
              </p>
            </div>
          )}
          </div>
          <div className="lg:shrink-0 lg:border-t lg:border-edge lg:pt-4">
          <div className="hidden lg:block">
            {placeButton}
            <SubscribeDisclosure className="text-center" />
          </div>
          {/* One line under the button: the total is on the button and delivery
              is chosen above. No promises here that the refund policy does not
              make in full (founder, 11 October 2026). */}
          <p className="mt-3 text-center text-[0.72rem] leading-relaxed text-mist">
            {payable === 0
              ? giftApplyEstimate > 0 ? "Paid with your gift card balance." : "Nothing to pay — your code covers this order."
              : "Secure payment by Razorpay."}
          </p>
          </div>
        </div>
      </div>
      <div
        ref={payBarRef}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-cloud/95 px-4 pt-3 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
      >
        {placeButton}
        <SubscribeDisclosure className="text-center" />
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => setAuthOpen(false)} />
    </div>
  );
}

function ConsentRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-[0.8rem] leading-snug text-charcoal">
      <span
        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border-2 transition-colors ${
          checked ? "border-charcoal bg-charcoal text-surface" : "border-slate"
        }`}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="m4 8 2.5 2.5L12 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

export default withServicePage("payments", "Checkout is not open yet", CheckoutPage);
