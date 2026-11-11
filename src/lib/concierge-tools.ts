import { sellableAnywhere } from "../brand/commerce/sale";
import type Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import { signDoc } from "./private-doc";
import {
  billedSqFt,
  billedPriceFor,
  MIN_PRINT_WIDTH_FT,
  MIN_WALLPAPER_SQFT,
  fixedSizePrice,
  toCm,
  areaSqFt,
  formatINR,
  INSTALL_RATE_EX_GST,
  INSTALL_RATE_LABEL,
  installationTotal,
  INSTALL_MIN_SQFT,
  INSTALL_CITIES_LABEL,
  isCanvasProduct,
  fromReadySizePrice,
  matchReadySize,
  CM_PER_INCH,
  type Unit,
} from "./pricing";
import { supplyLabel } from "./product-facts";
import {
  STANDARD_SHIPPING,
  EXPRESS_SHIPPING,
  estimateStandardDelivery,
  estimateExpressDelivery,
  formatShipDate,
} from "./shipping";
import { BRAND_TOPICS, getBrandInfo } from "./brand-knowledge";
import { refundPayment } from "./razorpay";
import { notifyOrderStatus } from "./order-notify";
import type { Product } from "./types";
import { getNamedCollectionRows } from "./queries";
import { namedCollection } from "./search-intent";

/** Compact product shape surfaced to the model and echoed to the chat UI. */
export type ConciergeProduct = {
  handle: string;
  title: string;
  code: string | null;
  image: string | null;
  fromPricePerSqft: number | null;
  /** True for Canvas Wall Art — chat card shows a finished "from ₹X", never ₹/sq ft. */
  isCanvas?: boolean;
  /** Lowest finished fixed-size price (canvas), for the chat card's "from ₹X". */
  fromPrice?: number | null;
  tags?: string[];
  /** Short "why this one" line the model gives per curated pick (show_products). */
  reason?: string;
};

const stripHtml = (s: string | null) =>
  (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// Kid-room scene renders (crib, playroom) mislead when a design is recommended
// for an adult brief — a nursery shot must never front a chat card. Prefer any
// non-kid image (featured first), then the clean flat pattern, then anything.
const KID_SCENE = /nursery|kid|toddler|play/i;

function toConciergeProduct(p: Product): ConciergeProduct {
  const imgs = [...(p.product_images ?? [])].sort(
    (a, b) => Number(b.is_featured) - Number(a.is_featured) || a.position - b.position,
  );
  const card =
    imgs.find((i) => !i.is_flat && !KID_SCENE.test(i.scene_key ?? "")) ??
    imgs.find((i) => i.is_flat) ??
    imgs[0];
  const availMaterials = (p.product_materials ?? []).filter((m) => m.available);
  const prices = availMaterials.map((m) => Number(m.price_per_sqft)).filter((n) => n > 0);
  const fromPricePerSqft = prices.length ? Math.min(...prices) : null;
  // Canvas Wall Art: fixed sizes only — never expose the per-sq-ft make rate.
  const materialSlugs = availMaterials
    .map((m) => m.materials?.slug)
    .filter((s): s is string => !!s);
  const tags = (p.product_tags ?? []).map((t) => t.tag);
  const isCanvas = isCanvasProduct(materialSlugs, tags);
  const readySizes = (p.ready_sizes ?? null) as [number, number][] | null;
  const fromPrice =
    isCanvas && readySizes?.length && fromPricePerSqft != null
      ? fromReadySizePrice(readySizes, fromPricePerSqft)
      : null;
  return {
    handle: p.handle,
    title: p.title,
    code: p.code,
    image: card?.url ?? null,
    fromPricePerSqft,
    isCanvas,
    fromPrice,
  };
}

const SELECT = `
  id, handle, code, title, description, status, ready_sizes,
  product_images ( url, alt, position, is_featured, is_flat, scene_key ),
  product_materials ( price_per_sqft, available, materials ( slug, name, description, default_price_per_sqft ) )
`;

// Words that carry no ranking signal in a wallpaper query.
const STOPWORDS = new Set([
  "a", "an", "the", "of", "for", "in", "on", "and", "or", "with", "to", "me", "my", "i",
  "want", "like", "show", "need", "some", "please",
  "wallpaper", "wallpapers", "mural", "murals", "design", "designs", "wall", "walls", "room",
]);

/**
 * Relevance-ranked catalogue search. The old version was a raw substring OR
 * with no scoring — DB order came back, so "blue ocean" surfaced any product
 * with "ocean"/"wave" anywhere (e.g. a beige "Desert Waves" texture) ahead of
 * true blue-ocean murals. Now each query term is scored per product — title
 * word > exact tag (colours/subjects live in tags) > tag substring >
 * description — products matching MORE distinct terms always rank above
 * partial matches, and partial matches are cut when full matches exist.
 */
export async function searchProducts(
  query: string,
  limit = 8,
): Promise<(ConciergeProduct & { tags: string[]; snippet: string })[]> {
  const q = query.trim().toLowerCase().slice(0, 80);
  const terms = [
    ...new Set(q.split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t))),
  ].slice(0, 6);
  if (!terms.length) return [];

  // Candidate pools: one text query across all terms + one tag query per term.
  // `member` (inner) filters; `product_tags` (plain) carries the FULL tag list
  // for scoring.
  const textOr = terms
    .flatMap((t) => [`title.ilike.%${t}%`, `description.ilike.%${t}%`])
    .join(",");
  const FULL = `${SELECT}, product_tags ( tag )`;
  // A query that names a collection outright ("black and white", "games
  // room", "The Blockprint Garden") is asking for that collection: its designs
  // join the pool and lead the ranking, as on the site's own search
  // (search-intent.ts). A failed read costs the hint, never the search.
  const namedTag = await getNamedCollectionRows()
    .then((rows) => namedCollection(query, rows)?.tag)
    .catch(() => undefined);
  const [textRes, namedRes, ...tagRes] = await Promise.all([
    supabase.from("products").select(FULL).eq("status", "active").eq("is_service", false).or(textOr).limit(60),
    namedTag
      ? supabase
          .from("products")
          .select(`${FULL}, member:product_tags!inner ( tag )`)
          .eq("status", "active").eq("is_service", false)
          .eq("member.tag", namedTag)
          .limit(40)
      : Promise.resolve({ data: [] }),
    ...terms.map((t) =>
      supabase
        .from("products")
        .select(`${FULL}, member:product_tags!inner ( tag )`)
        .eq("status", "active").eq("is_service", false)
        .ilike("member.tag", `%${t}%`)
        .limit(40),
    ),
  ]);

  const candidates = new Map<string, Product>();
  for (const res of [textRes, namedRes, ...tagRes]) {
    for (const row of (res.data ?? []) as unknown as Product[]) {
      if (sellableAnywhere(row.handle) && !candidates.has(row.handle)) candidates.set(row.handle, row);
    }
  }

  const wordIn = (text: string, term: string) =>
    new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "")}`).test(text);

  const scored = [...candidates.values()].map((p) => {
    const title = p.title.toLowerCase();
    const tags = (p.product_tags ?? []).map((t) => t.tag);
    const tagsLower = tags.map((t) => t.toLowerCase());
    const desc = stripHtml(p.description).toLowerCase();
    let score = 0;
    let covered = 0;
    for (const term of terms) {
      let best = 0;
      if (wordIn(title, term)) best = 3;
      else if (title.includes(term)) best = 2.5;
      for (const tag of tagsLower) {
        if (tag === term) best = Math.max(best, 2.8);
        else if (wordIn(tag, term)) best = Math.max(best, 2.4);
        else if (tag.includes(term)) best = Math.max(best, 1.8);
      }
      if (best === 0 && desc.includes(term)) best = 1;
      if (best > 0) {
        score += best;
        covered += 1;
      }
    }
    // A design in the collection the customer named answers the whole query.
    if (namedTag && tags.includes(namedTag)) {
      covered = terms.length;
      score += 5;
    }
    return { p, tags, score, covered };
  });

  scored.sort((a, b) => b.covered - a.covered || b.score - a.score);
  const maxCov = scored[0]?.covered ?? 0;
  if (maxCov === 0) return [];
  // Keep full-coverage matches; only backfill the next tier when full matches
  // are scarce — a product matching "ocean" alone must not ride along when
  // several true "blue ocean" matches exist.
  let kept = scored.filter((s) => s.covered === maxCov);
  if (kept.length < 3 && maxCov > 1) {
    kept = [...kept, ...scored.filter((s) => s.covered === maxCov - 1)];
  }

  return kept.slice(0, limit).map((s) => ({
    ...toConciergeProduct(s.p),
    tags: s.tags,
    // Description snippet for the model's curation — with the leading SKU
    // prefix ("FA 00076 – ") stripped so codes never leak into replies.
    snippet: stripHtml(s.p.description)
      .replace(/^[A-Za-z]{2,4}\s?\d{3,5}\s*[–—-]\s*/, "")
      .slice(0, 160),
  }));
}

export async function getProductDetails(handle: string) {
  const { data } = await supabase
    .from("products")
    .select(`${SELECT}, product_tags ( tag )`)
    .eq("handle", handle)
    .eq("status", "active")
    .maybeSingle();
  if (!data || !sellableAnywhere(handle)) return null;
  const p = data as unknown as Product;
  return {
    card: toConciergeProduct(p),
    detail: {
      handle: p.handle,
      title: p.title,
      code: p.code,
      description: stripHtml(p.description).slice(0, 600),
      tags: (p.product_tags ?? []).map((t) => t.tag),
      materials: (p.product_materials ?? [])
        .filter((m) => m.available && m.materials)
        .map((m) => ({
          slug: m.materials!.slug,
          name: m.materials!.name,
          pricePerSqft: Number(m.price_per_sqft),
        })),
      url: `/products/${p.handle}`,
    },
  };
}

export async function priceMural(
  handle: string,
  materialSlug: string,
  width: number,
  height: number,
  unit: Unit,
) {
  const { data } = await supabase
    .from("products")
    .select(
      "handle, title, ready_sizes, product_materials ( price_per_sqft, available, materials ( slug, name ) )",
    )
    .eq("handle", handle)
    .eq("status", "active")
    .maybeSingle();
  if (!data || !sellableAnywhere(handle)) return { error: `No product with handle "${handle}"` };

  type Row = {
    handle: string;
    title: string;
    ready_sizes: [number, number][] | null;
    product_materials: {
      price_per_sqft: number;
      available: boolean;
      materials: { slug: string; name: string } | null;
    }[];
  };
  const p = data as unknown as Row;
  const mat = p.product_materials.find(
    (m) => m.available && m.materials?.slug === materialSlug,
  );
  if (!mat) {
    return {
      error: `Material "${materialSlug}" not available for this design`,
      availableMaterials: p.product_materials
        .filter((m) => m.available && m.materials)
        .map((m) => m.materials!.slug),
    };
  }

  const wCm = toCm(width, unit);
  const hCm = toCm(height, unit);
  const rate = Number(mat.price_per_sqft);

  // Fixed-size (canvas/wall-art, or a ready-size wallpaper): NOT a wall the
  // customer measures — it only exists at the sizes in ready_sizes. Accepting
  // any width/height here would let a caller price (and, via /order, buy) a
  // size that was never actually configured for print. Match to the ladder
  // or refuse, exactly like the storefront's own size picker does.
  if (p.ready_sizes?.length) {
    const matched = matchReadySize(p.ready_sizes, wCm / CM_PER_INCH, hCm / CM_PER_INCH);
    if (!matched) {
      return {
        error: `"${p.title}" is sold only at fixed sizes, not a custom wall size.`,
        availableSizes: p.ready_sizes.map(([w, h]) => `${w} in × ${h} in`),
      };
    }
    const [wIn, hIn] = matched;
    return {
      product: p.title,
      material: mat.materials!.name,
      wall: `${wIn} in × ${hIn} in (fixed size)`,
      // The per-sq-ft make rate is an internal cost for a fixed-size piece —
      // never quoted, on this API or anywhere else. Only the finished price.
      totalINR: fixedSizePrice(wIn * CM_PER_INCH, hIn * CM_PER_INCH, rate),
      note: `Fixed size, printed edge to edge. GST included in the price. Free standard shipping across ${STANDARD_SHIPPING.coverage} (delivered within ${STANDARD_SHIPPING.deliveryWorkingDays} working days).`,
    };
  }

  // Small-order minimums: billing counts the print width as at least 4 ft and
  // never bills below 20 sq ft. Once the minimum is billed there is NO courier
  // charge — shipping stays free on every order.
  const measured = areaSqFt(wCm, hCm);
  const billed = billedSqFt(wCm, hCm);
  return {
    product: p.title,
    material: mat.materials!.name,
    wall: `${width} × ${height} ${unit}`,
    areaSqFt: measured,
    ...(billed > measured
      ? {
          billedSqFt: billed,
          minimumNote: `Billed at the small-order minimum — chargeable print width is never under ${MIN_PRINT_WIDTH_FT} ft and wallpaper billing never under ${MIN_WALLPAPER_SQFT} sq ft. The print itself is still made to the exact wall size, and shipping stays free. Tell the customer.`,
        }
      : {}),
    ratePerSqFt: rate,
    totalINR: billedPriceFor(wCm, hCm, rate),
    note: `GST included in the price. Free standard shipping across ${STANDARD_SHIPPING.coverage} (delivered within ${STANDARD_SHIPPING.deliveryWorkingDays} working days).`,
  };
}

// ---------------------------------------------------------------------------
// Brand knowledge + order support tools
// ---------------------------------------------------------------------------

/** Retrieve authoritative brand/policy facts for one or more topics. */
export function brandInfo(topics: string[]) {
  return getBrandInfo(Array.isArray(topics) ? topics.map(String) : []);
}

// Plain-language explanation of each pipeline stage, so the assistant can tell
// the customer what's happening now and what's next.
const STAGE_NOTE: Record<string, string> = {
  pending: "Payment is still pending — the order isn't confirmed for production yet.",
  paid: "Paid and confirmed — queued to go into production.",
  in_production: "In production — being sized to your wall size right now.",
  printed: "Printed and being prepared for dispatch.",
  shipped: "Dispatched — on its way to you with the courier.",
  delivered: "Delivered.",
  cancelled: "This order has been cancelled.",
  refunded: "This order has been refunded.",
};

/**
 * Look up a customer's own order by order number + the email used at checkout.
 * Wrong email is indistinguishable from a missing order (no enumeration).
 * Returns only customer-safe fields, enriched with a dispatch/delivery estimate.
 */
export async function checkOrderStatus(orderNumber: number, email: string) {
  if (!Number.isFinite(orderNumber) || !email) return { found: false as const };
  const { data, error } = await supabase.rpc("concierge_order_status", {
    p_order_number: Math.trunc(orderNumber),
    p_email: email.trim(),
  });
  if (error) {
    console.error("concierge_order_status failed:", error.message);
    return { found: false as const };
  }
  const o = data as {
    found: boolean;
    order_number?: number;
    status?: string;
    payment_status?: string;
    created_at?: string;
    shipping_speed?: string | null;
    city?: string | null;
    total?: number;
    courier?: string | null;
    awb?: string | null;
    tracking_url?: string | null;
    gst_invoice_url?: string | null;
    order_copy_url?: string | null;
    cancellable?: boolean;
    items?: { title: string; material: string; width_cm: number; height_cm: number; quantity: number }[];
  } | null;
  if (!o?.found) return { found: false as const };

  const express = (o.shipping_speed ?? "").toLowerCase().includes("express");
  const placed = o.created_at ? new Date(o.created_at) : new Date();
  const est = express ? estimateExpressDelivery(placed) : estimateStandardDelivery(placed);
  const shipped = ["shipped", "delivered"].includes(o.status ?? "");

  return {
    found: true as const,
    order_number: o.order_number,
    status: o.status,
    status_explanation: STAGE_NOTE[o.status ?? ""] ?? o.status,
    payment_status: o.payment_status,
    city: o.city ?? null,
    total: o.total != null ? formatINR(Number(o.total)) : null,
    speed: express ? "Express delivery" : "Standard",
    // Estimate only meaningful before it ships; after shipping, use tracking.
    dispatch_estimate: shipped
      ? null
      : `dispatch by ${formatShipDate(est.dispatchBy)}, estimated delivery by ${formatShipDate(est.deliveryTo)} (estimates, not guarantees; ${STANDARD_SHIPPING.exceptionsNote})`,
    tracking: shipped && o.tracking_url ? { courier: o.courier, awb: o.awb, url: o.tracking_url } : null,
    // Signed for this reply rather than handed out as a permanent file URL.
    // An hour is the right window here: the customer clicks it from the chat
    // they are in, and a link pasted elsewhere goes dead the same day.
    gst_invoice_url: await signDoc(o.gst_invoice_url),
    order_copy_url: await signDoc(o.order_copy_url),
    cancellable: !!o.cancellable,
    items: o.items ?? [],
  };
}

/**
 * Cancel a customer's own order (order number + email), ONLY when it's within
 * the rules — same eligibility as the self-serve cancel (pending/paid, within
 * 12h, before production). On success, refunds any captured payment and fires
 * the cancellation email. `confirmed` MUST be true (the model sets it only
 * after the customer explicitly agrees in chat). Never returns the payment id.
 */
export async function cancelOrder(orderNumber: number, email: string, confirmed: boolean) {
  if (!confirmed) {
    return { error: "Ask the customer to confirm cancellation explicitly, then call again with confirmed=true." };
  }
  if (!Number.isFinite(orderNumber) || !email) return { ok: false as const, reason: "not_found" };
  const { data, error } = await supabase.rpc("concierge_cancel_order", {
    p_order_number: Math.trunc(orderNumber),
    p_email: email.trim(),
  });
  if (error) {
    console.error("concierge_cancel_order failed:", error.message);
    return { ok: false as const, reason: "error" };
  }
  const r = data as {
    ok: boolean;
    reason?: string;
    order_id?: string;
    order_number?: number;
    was_paid?: boolean;
    razorpay_payment_id?: string | null;
  };

  // Post-cancel side effects mirror /api/order/cancel: refund + notify.
  let refund: "initiated" | "none" = "none";
  if (r.ok && r.order_id) {
    if (r.was_paid && r.razorpay_payment_id) {
      try {
        const ok = await refundPayment(r.razorpay_payment_id);
        refund = ok ? "initiated" : "none";
      } catch (e) {
        console.error("refund on concierge cancel failed:", e);
      }
    }
    try {
      await notifyOrderStatus(r.order_id, "cancelled");
    } catch (e) {
      console.error("concierge cancel notify failed:", e);
    }
  }

  // Model-safe result — never expose the payment id.
  if (!r.ok) return { ok: false as const, reason: r.reason ?? "error", order_number: r.order_number };
  return {
    ok: true as const,
    reason: r.reason ?? "cancelled",
    order_number: r.order_number,
    refund:
      refund === "initiated"
        ? "Full refund initiated to the original payment method — expect it within 7 working days."
        : r.was_paid
          ? "Refund could not be initiated automatically; the team will process it."
          : "No payment had been captured, so nothing to refund.",
  };
}

/** Log an order-related request (complaint, damage report, refund request) for the human team. */
export async function lodgeOrderRequest(email: string, orderNumber: number | null, summary: string) {
  const msg = `[Order support${orderNumber ? ` · order #${orderNumber}` : ""}] ${summary}`.slice(0, 1500);
  const { error } = await supabase.rpc("submit_contact", {
    p_name: null,
    p_email: email.trim(),
    p_message: msg,
    p_topic: "order-support",
  });
  if (error) {
    console.error("lodgeOrderRequest submit_contact failed:", error.message);
    return { ok: false as const };
  }
  return { ok: true as const };
}

/** The outcomes a licensed-character request can have — mirrors the check
 *  constraint on character_requests (migration 20261005050712). */
export const CHARACTER_REQUEST_OUTCOMES = [
  "shown_alternatives",
  "liked_alternative",
  "wants_only_character",
  "no_alternative_shown",
] as const;
export type CharacterRequestOutcome = (typeof CHARACTER_REQUEST_OUTCOMES)[number];

/**
 * Record a request for a licensed character (Elsa, Spider-Man, Peppa Pig…) and
 * what came of it. We never print licensed characters; until 4 October 2026
 * these requests were declined in words and left no trace, so how often they
 * happen — and whether an original design ever wins the customer — was
 * unknowable. Never blocks the conversation: a failed write is logged and the
 * chat carries on.
 */
export async function logCharacterRequest(
  character: string,
  outcome: string,
  opts: { franchise?: string | null; shownHandles?: string[]; channel?: "chat" | "voice"; note?: string | null } = {},
) {
  if (!character.trim()) return { ok: false as const, error: "character is required" };
  if (!(CHARACTER_REQUEST_OUTCOMES as readonly string[]).includes(outcome)) {
    return { ok: false as const, error: `outcome must be one of ${CHARACTER_REQUEST_OUTCOMES.join(", ")}` };
  }
  const { error } = await supabase.rpc("log_character_request", {
    p_character: character,
    p_outcome: outcome,
    p_franchise: opts.franchise ?? null,
    p_shown_handles: (opts.shownHandles ?? []).slice(0, 8),
    p_channel: opts.channel ?? "chat",
    p_note: opts.note ?? null,
  });
  if (error) {
    console.error("logCharacterRequest failed:", error.message);
    return { ok: false as const };
  }
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Cart tools — the concierge builds the customer's REAL cart (the same one the
// site header/cart page read, keyed by the zyv_cart session cookie).
// ---------------------------------------------------------------------------

/** Wall units the concierge accepts; pricing.Unit stays ft/cm/in. */
export type WallUnit = Unit | "mm" | "m";
const wallCm = (value: number, unit: WallUnit): number =>
  unit === "mm" ? value / 10 : unit === "m" ? value * 100 : toCm(value, unit);

export type CartWall = { width: number; height: number; unit: WallUnit };

/** One cart line as handed to the chat UI (and back to the model). */
export type ConciergeCartItem = {
  handle: string;
  title: string;
  materialName: string;
  widthCm: number;
  heightCm: number;
  areaSqft: number;
  quantity: number;
  lineTotal: number;
  installation: number;
  personalisation: number;
  childName: string | null;
  bespokeNote: string | null;
};
export type ConciergeCart = { items: ConciergeCartItem[]; subtotal: number };

/** Read the customer's live cart (same cart_get RPC the site uses). */
export async function getConciergeCart(sessionToken: string): Promise<ConciergeCart> {
  const { data, error } = await supabase.rpc("cart_get", { p_session_token: sessionToken });
  if (error) throw new Error(`cart_get failed: ${error.message}`);
  const raw = data as {
    items?: {
      handle: string;
      title: string;
      material_name: string;
      width_cm: number;
      height_cm: number;
      area_sqft: number;
      quantity: number;
      line_total: number;
      installation?: number;
      personalisation?: number;
      child_name?: string | null;
      bespoke_note?: string | null;
    }[];
    subtotal?: number;
  };
  return {
    items: (raw.items ?? []).map((it) => ({
      handle: it.handle,
      title: it.title,
      materialName: it.material_name,
      widthCm: Number(it.width_cm),
      heightCm: Number(it.height_cm),
      areaSqft: Number(it.area_sqft),
      quantity: Number(it.quantity),
      lineTotal: Number(it.line_total),
      installation: Number(it.installation ?? 0),
      personalisation: Number(it.personalisation ?? 0),
      childName: it.child_name ?? null,
      bespokeNote: it.bespoke_note ?? null,
    })),
    subtotal: Number(raw.subtotal ?? 0),
  };
}

/**
 * Add one design at one or more wall sizes to the customer's real cart — one
 * cart line per wall, priced server-side from the product's material rate
 * (never from a model-supplied number). Installation (₹35/sq ft + GST,
 * Bengaluru, Mumbai & Pune only) is judged on the COMBINED area of the walls in this call — one
 * installer visit covers all of them — and stored per line so the cart/checkout
 * GST bill shows the same split the product page does.
 */
export async function addWallsToCart(
  sessionToken: string,
  handle: string,
  materialSlug: string,
  walls: CartWall[],
  installation: boolean,
) {
  if (!walls.length) return { error: "No wall sizes given." };
  if (walls.length > 8) return { error: "At most 8 walls per add." };

  const { data } = await supabase
    .from("products")
    .select("handle, title, status, category, price_per_metre, supply_format, segment_length_m, product_categories ( title, pricing_unit, measurement_type, fixed_length_m, min_order_qty ), product_materials ( price_per_sqft, available, materials ( slug, name ) )")
    .eq("handle", handle)
    .eq("status", "active")
    .maybeSingle();
  if (!data || !sellableAnywhere(handle)) return { error: `No active product with handle "${handle}"` };
  type Row = {
    title: string;
    price_per_metre: number | null;
    supply_format: "continuous" | "segmented" | null;
    segment_length_m: number | null;
    product_categories: {
      title: string;
      pricing_unit: string;
      measurement_type: "area" | "length" | "fixed" | null;
      fixed_length_m: number | string | null;
      min_order_qty: number;
    } | null;
    product_materials: { price_per_sqft: number; available: boolean; materials: { slug: string; name: string } | null }[];
  };
  const p = data as unknown as Row;
  // This tool prices by WALL AREA. Only one of the three families is bought
  // that way. A border has no wall size and a canvas has no wall at all, so
  // quoting either here would give the customer a number the checkout won't
  // honour — say so plainly instead of failing further down on "material not
  // available", which tells the model nothing useful.
  const cat = p.product_categories;
  const family = cat?.measurement_type ?? (cat?.pricing_unit === "metre" ? "length" : "area");
  if (cat && family === "length") {
    return {
      error: `"${handle}" is in ${cat.title}, sold by the LINEAR METRE — ${supplyLabel(5, p.supply_format, p.segment_length_m)} for a 5 m order, minimum ${cat.min_order_qty} m. It has no material and no wall size, so it can't be added this way — send the customer to /products/${handle} to order it in 5 m sets, where the rate is shown in their own currency.`,
    };
  }
  if (cat && family === "fixed") {
    return {
      error: `"${handle}" is in ${cat.title} — a finished canvas printed in a FIXED size (2 ft × 2 ft up to 4 ft × 6 ft), not sized to your wall. It takes no wall dimensions, so it can't be added this way — send the customer to /products/${handle} to pick a size.`,
    };
  }
  const mat = p.product_materials.find((m) => m.available && m.materials?.slug === materialSlug);
  if (!mat) {
    return {
      error: `Material "${materialSlug}" not available for this design`,
      availableMaterials: p.product_materials.filter((m) => m.available && m.materials).map((m) => m.materials!.slug),
    };
  }
  const rate = Number(mat.price_per_sqft);

  // Validate + convert every wall before touching the cart (all-or-nothing).
  const sized = walls.map((w) => {
    const wCm = wallCm(Number(w.width), w.unit);
    const hCm = wallCm(Number(w.height), w.unit);
    return { wCm, hCm, sqft: areaSqFt(wCm, hCm) };
  });
  if (sized.some((s) => !(s.wCm >= 30 && s.wCm <= 3000 && s.hCm >= 30 && s.hCm <= 1000))) {
    return { error: "Each wall must be between 30 cm and 30 m wide and 30 cm and 10 m tall — double-check the sizes/units." };
  }

  const combinedSqft = sized.reduce((s, x) => s + x.sqft, 0);
  const installEligible = combinedSqft >= INSTALL_MIN_SQFT;
  const withInstall = installation && installEligible;

  const added: { wall: string; areaSqFt: number; billedSqFt: number; wallpaperINR: number; installationINR: number; lineTotalINR: number }[] = [];
  for (const s of sized) {
    // Billed area applies the small-order minimums (min 4 ft print width, min
    // 20 sq ft billing); installation prices on the REAL area — the fitter
    // hangs the wall that exists, not the billing floor.
    const billed = billedSqFt(s.wCm, s.hCm);
    const material = Math.round(billed * rate);
    const install = withInstall ? installationTotal(s.sqft) : 0;
    const { error } = await supabase.rpc("cart_add_item", {
      p_session_token: sessionToken,
      p_product_handle: handle,
      p_material_slug: materialSlug,
      p_width_cm: Math.round(s.wCm * 10) / 10,
      p_height_cm: Math.round(s.hCm * 10) / 10,
      p_area_sqft: billed,
      p_unit_price: rate,
      p_quantity: 1,
      p_line_total: material + install,
      p_crop_data: withInstall ? { installation: { ratePerSqft: INSTALL_RATE_EX_GST, total: install } } : null,
      p_preview_url: null,
    });
    if (error) {
      console.error("concierge cart_add_item failed:", error.message);
      return { error: "Couldn't add to the cart just now — please try again.", added };
    }
    added.push({
      wall: `${(s.wCm / 30.48).toFixed(1)} × ${(s.hCm / 30.48).toFixed(1)} ft`,
      areaSqFt: s.sqft,
      billedSqFt: billed,
      wallpaperINR: material,
      installationINR: install,
      lineTotalINR: material + install,
    });
  }

  const cart = await getConciergeCart(sessionToken);
  return {
    ok: true as const,
    product: p.title,
    material: mat.materials!.name,
    added,
    installation: withInstall
      ? `Included at ${INSTALL_RATE_LABEL} (${INSTALL_CITIES_LABEL} only — re-checked against the delivery address at checkout).`
      : installation
        ? `NOT added: installation needs ${INSTALL_MIN_SQFT}+ sq ft combined; these walls total ${combinedSqft.toFixed(1)} sq ft. Tell the customer.`
        : "Not requested.",
    cartTotalINR: cart.subtotal,
    note: "The cart card is shown to the customer automatically — reply with ONE short sentence, do not restate the line items.",
  };
}

// ---- browsing the catalogue, not just guessing at it ----
//
// The concierge could search by keyword and nothing else. It could not list
// what collections exist, see what had just arrived, walk a collection, or find
// designs like a given one — so it had to guess words at a catalogue it could
// not see, and a customer asking "what do you have?" or "anything new?" got an
// answer from nowhere. These are the browse verbs a shop assistant needs.

/** Every collection a customer can actually be sent to, with live counts. */
export async function listCollections(
  kind?: string,
): Promise<{ handle: string; title: string; kind: string; count: number }[]> {
  const [{ data: cols, error }, { data: counts }] = await Promise.all([
    supabase
      .from("collections")
      .select("handle, title, kind, rule_tag, rule_tags")
      .order("position", { ascending: true, nullsFirst: false }),
    supabase.rpc("populated_collection_tags"),
  ]);
  if (error) throw error;
  const populated = new Set(((counts ?? []) as { tag: string }[]).map((r) => r.tag));
  const rows = (cols ?? []) as {
    handle: string; title: string; kind: string; rule_tag: string | null; rule_tags: string[] | null;
  }[];
  return rows
    .filter((c) => !kind || c.kind === kind)
    // Never offer a customer a collection with nothing in it.
    .filter((c) => (c.rule_tags?.length ? c.rule_tags : c.rule_tag ? [c.rule_tag] : []).some((t) => populated.has(t)))
    .map((c) => ({ handle: c.handle, title: c.title, kind: c.kind, count: 0 }));
}

/** Walk a collection the way the website's own listing does. */
export async function browseCollection(
  handle: string,
  limit = 8,
): Promise<(ConciergeProduct & { tags: string[] })[]> {
  const { data: col, error: colErr } = await supabase
    .from("collections")
    .select("rule_tag, rule_tags, category_scope")
    .eq("handle", handle)
    .maybeSingle();
  if (colErr) throw colErr;
  if (!col) return [];
  const c = col as { rule_tag: string | null; rule_tags: string[] | null; category_scope: string | null };
  const tags = c.rule_tags?.length ? c.rule_tags : c.rule_tag ? [c.rule_tag] : null;

  // Same RPC the collection page uses, so the concierge and the website can
  // never disagree about what is in a collection.
  const { data: page, error: pageErr } = await supabase.rpc("collection_page_v2", {
    p_base_tags: tags, p_category: c.category_scope, p_filter_tags: null,
    p_signature: false, p_new: false, p_sort: "newest", p_limit: limit, p_offset: 0,
  });
  if (pageErr) throw pageErr;
  const handles = ((page ?? []) as { handle: string }[]).map((r) => r.handle);
  return loadConciergeCards(handles);
}

/** What has arrived recently, newest first. */
export async function whatsNew(limit = 8): Promise<(ConciergeProduct & { tags: string[] })[]> {
  const { data, error } = await supabase
    .from("products")
    .select(`${SELECT}, product_tags ( tag )`)
    .eq("status", "active").eq("is_service", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as unknown as Product[]) ?? []).filter(p => sellableAnywhere(p.handle)).map((p) => ({
    ...toConciergeProduct(p),
    tags: (p.product_tags ?? []).map((t) => t.tag),
  }));
}

/**
 * Designs that LOOK like a given one, via the CLIP image embeddings. This is
 * the question keyword search cannot answer — "something like this but calmer"
 * has no keyword.
 */
export async function similarTo(handle: string, limit = 6): Promise<(ConciergeProduct & { tags: string[] })[]> {
  const { data, error } = await supabase.rpc("related_products_by_embedding", {
    product_handle: handle, match_count: Math.min(limit, 12),
  });
  if (error) throw error;
  const handles = ((data ?? []) as { handle: string }[]).map((r) => r.handle);
  return loadConciergeCards(handles);
}

/** Load full cards for a list of handles, preserving the order given. */
async function loadConciergeCards(handles: string[]): Promise<(ConciergeProduct & { tags: string[] })[]> {
  if (!handles.length) return [];
  const { data, error } = await supabase
    .from("products")
    .select(`${SELECT}, product_tags ( tag )`)
    .in("handle", handles);
  if (error) throw error;
  const order = new Map(handles.map((h, i) => [h, i]));
  return ((data as unknown as Product[]) ?? [])
    .filter(p => sellableAnywhere(p.handle))
    .map((p) => ({ ...toConciergeProduct(p), tags: (p.product_tags ?? []).map((t) => t.tag) }))
    .sort((a, b) => (order.get(a.handle) ?? 0) - (order.get(b.handle) ?? 0));
}

/** Tool definitions passed to the Claude API — kept stable for prompt caching. */
export const CONCIERGE_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_products",
    description:
      "Search MimiPip's wallpaper catalogue by keyword. Results come back RELEVANCE-RANKED (best first) with each design's style tags and a short description — use those to judge fit. Call this before recommending any design — never recommend from memory. Try 2-3 different keywords if the first search returns few results.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search keyword or phrase, e.g. 'tropical jungle' or 'nursery animals'",
        },
        limit: { type: "number", description: "Max results (default 8)" },
      },
      required: ["query"],
    },
  },
  {
    name: "show_products",
    description:
      "Present a curated, ordered set of designs to the customer as visual cards in the chat. Call this ONCE per recommendation, after searching, with 2–6 picks ordered best-fit first. ONLY the picks you pass here are shown — order matters. Each pick needs a short 'reason' (under 12 words) naming the ONE specific thing that makes THAT design the pick — not a generic 'great choice'. Pattern: 'Best <criterion>: <concrete detail>', e.g. 'Best colour match: muted blue, stone and beige.', 'Best for a calm bedroom: softer composition, lower visual movement.', 'Best value for your 10 ft × 8 ft wall: ₹16,000 on Soft Matte.'. Vary the criterion per card (colour, mood/room fit, price/value once a wall size is known, scale or placement) — never repeat the same criterion across all picks. Only state something you can actually support from the search results, the customer's own words, a price_mural result, or their attached photo — never invent a specific you haven't verified. The customer can size, price and add each design to their cart directly inside the chat from these cards.",
    input_schema: {
      type: "object" as const,
      properties: {
        picks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              handle: { type: "string", description: "Product handle, from search_products." },
              reason: {
                type: "string",
                description:
                  "Short one-line reason THIS design is shown, under 12 words, pattern 'Best <criterion>: <concrete detail>'.",
              },
            },
            required: ["handle", "reason"],
          },
          description: "2–6 picks, best match first, each with its own short reason.",
        },
      },
      required: ["picks"],
    },
  },
  {
    name: "list_collections",
    description:
      "List the collections a customer can actually browse — by room, colour, style, mood, or curated set. Use when the customer asks what you have, what collections exist, or is browsing without a specific idea yet ('show me something', 'what's popular for a bedroom'). Only collections with designs in them are returned. Follow with browse_collection to see the designs inside one.",
    input_schema: {
      type: "object" as const,
      properties: {
        kind: {
          type: "string",
          description:
            "Optional filter: 'room', 'color', 'category' (style/subject), 'mood', or 'curated'. Omit for all.",
        },
      },
      required: [],
    },
  },
  {
    name: "browse_collection",
    description:
      "See the designs inside one collection, best first — the same order the website shows. Use after list_collections, or whenever the customer names something that is clearly a collection ('the ikat collection', 'your blue wallpapers', 'pooja room'). Prefer this over search_products when the customer is browsing a category rather than hunting a specific thing.",
    input_schema: {
      type: "object" as const,
      properties: {
        handle: { type: "string", description: "Collection handle from list_collections, e.g. 'ikat' or 'blue-wallpaper'" },
        limit: { type: "number", description: "Max designs (default 8)" },
      },
      required: ["handle"],
    },
  },
  {
    name: "whats_new",
    description:
      "The designs most recently added to the catalogue, newest first. Use when the customer asks what's new, what just arrived, or what they haven't seen before.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Max designs (default 8)" },
      },
      required: [],
    },
  },
  {
    name: "similar_to",
    description:
      "Find designs that LOOK like a given design, judged on the artwork itself rather than its words. Use when the customer likes one design but wants a variation — 'something like this but calmer', 'more like the third one'. This answers what keyword search cannot, because a look has no keyword.",
    input_schema: {
      type: "object" as const,
      properties: {
        handle: { type: "string", description: "The design to find lookalikes for, e.g. 'ikat-reverie'" },
        limit: { type: "number", description: "Max designs (default 6)" },
      },
      required: ["handle"],
    },
  },
  {
    name: "get_product",
    description:
      "Get full details for one product by its handle: description, style tags, available materials with per-sq-ft rates, and the product page URL. Use after search_products when the customer wants to know more about a specific design.",
    input_schema: {
      type: "object" as const,
      properties: {
        handle: { type: "string", description: "The product handle, e.g. 'flo-0010'" },
      },
      required: ["handle"],
    },
  },
  {
    name: "price_mural",
    description:
      `Calculate the exact price of a mural wallpaper design for a customer's wall. Takes the product handle, material, and wall dimensions. Returns the wall's area in sq ft, the per-sq-ft rate and the total in INR. Always use this for pricing — never estimate. It applies our small-order billing floors (chargeable print width at least ${MIN_PRINT_WIDTH_FT} ft, billing never under ${MIN_WALLPAPER_SQFT} sq ft), so for any small wall the total will NOT equal area × rate — when it returns billedSqFt/minimumNote, quote the total it gives and explain the minimum.`,
    input_schema: {
      type: "object" as const,
      properties: {
        handle: { type: "string", description: "Product handle" },
        material_slug: {
          type: "string",
          description:
            "Material slug: 'smooth-matt' (Soft Matte) for murals; 'self-adhesive-vinyl' for ready-size designs",
        },
        width: { type: "number", description: "Wall width" },
        height: { type: "number", description: "Wall height" },
        unit: { type: "string", enum: ["ft", "cm", "in"], description: "Unit of the dimensions" },
      },
      required: ["handle", "material_slug", "width", "height", "unit"],
    },
  },
  {
    name: "add_to_cart",
    description:
      `Add a design to the customer's REAL cart (the same cart the site's cart page and checkout use) — one cart line per wall. Call this the moment you have the design + wall size(s) + material; pass ALL the customer's walls in ONE call. Prices are computed server-side from the catalogue rate. Set installation:true when the customer asked for professional installation (${INSTALL_CITIES_LABEL} ONLY — never any other city, ${INSTALL_RATE_LABEL}; needs ${INSTALL_MIN_SQFT}+ sq ft combined across the walls in this call — if below, it's skipped and the result tells you). Installation is also re-checked against the delivery address at checkout, so never add it for a customer outside those cities.` +
      " The updated cart is shown to the customer automatically as a card, so afterwards reply with ONE short sentence only — never restate line items.",
    input_schema: {
      type: "object" as const,
      properties: {
        handle: { type: "string", description: "Product handle, from search_products/get_product" },
        material_slug: {
          type: "string",
          description: "'smooth-matt' (Soft Matte) for murals, or 'self-adhesive-vinyl' (Smooth Matte (Self-Adhesive)) for ready-size designs",
        },
        walls: {
          type: "array",
          items: {
            type: "object",
            properties: {
              width: { type: "number", description: "Wall width" },
              height: { type: "number", description: "Wall height" },
              unit: { type: "string", enum: ["ft", "cm", "in", "mm", "m"], description: "Unit BOTH dimensions are in" },
            },
            required: ["width", "height", "unit"],
          },
          description: "Every wall to paper, one entry each (1–8). E.g. three walls = three entries.",
        },
        installation: { type: "boolean", description: "true only if the customer asked for professional installation" },
      },
      required: ["handle", "material_slug", "walls", "installation"],
    },
  },
  {
    name: "show_cart",
    description:
      "Show the customer their current cart as a card in the chat (itemised, with the GST-inclusive total). Call when they ask what's in their cart or want to review it before checkout. After calling, reply with ONE short sentence — the card carries the details.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_brand_info",
    description:
      "Retrieve authoritative, up-to-date facts about Zyvorah to answer any question about delivery/dispatch timelines, returns/cancellation/refunds, materials & finishes, installation & care, samples, pricing & GST, gift cards, services (bespoke, commercial, trade, installation, tools), the brand itself, or international. ALWAYS call this before answering such questions — never answer from memory. Request every relevant topic in one call.",
    input_schema: {
      type: "object" as const,
      properties: {
        topics: {
          type: "array",
          items: { type: "string", enum: [...BRAND_TOPICS] },
          description: "One or more brand topics to retrieve facts for.",
        },
      },
      required: ["topics"],
    },
  },
  {
    name: "check_order_status",
    description:
      "Look up a customer's OWN order by its order number AND the email used at checkout — BOTH are required. Returns the current stage, a dispatch/delivery estimate (or tracking once shipped), and invoice links. If it returns found:false, the number+email didn't match — ask them to double-check both. Never reveal any order detail without both the number and the matching email.",
    input_schema: {
      type: "object" as const,
      properties: {
        order_number: { type: "number", description: "The order number from their confirmation" },
        email: { type: "string", description: "The email used at checkout" },
      },
      required: ["order_number", "email"],
    },
  },
  {
    name: "cancel_order",
    description:
      "Cancel a customer's OWN order (order number + checkout email). It ONLY succeeds if the order is still cancellable (before production, within 12 hours) — otherwise it returns a reason and you should offer to lodge the request instead. Flow: FIRST check_order_status, THEN tell the customer it's eligible and that a full refund follows to their original payment method, THEN get an explicit 'yes, cancel it' from them, and ONLY THEN call this with confirmed=true. Never cancel without that explicit confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        order_number: { type: "number" },
        email: { type: "string", description: "The email used at checkout" },
        confirmed: {
          type: "boolean",
          description: "Set true ONLY after the customer has explicitly confirmed they want to cancel.",
        },
      },
      required: ["order_number", "email", "confirmed"],
    },
  },
  {
    name: "lodge_order_request",
    description:
      "Record an order-related request for the human team when you cannot action it yourself — a complaint, a damage/defect report, or a refund/cancellation request that's no longer auto-eligible. Verify the order with check_order_status first. For transit damage, remind the customer of the 48-hour window and that photos go to hello@zyvorah.com. The team replies within one working day.",
    input_schema: {
      type: "object" as const,
      properties: {
        email: { type: "string", description: "The customer's email" },
        order_number: { type: "number", description: "Their order number, if known" },
        summary: { type: "string", description: "A concise summary of the request/issue in the customer's words" },
      },
      required: ["email", "summary"],
    },
  },
  {
    name: "log_character_request",
    description:
      "Record that the customer asked for a licensed character or franchise (e.g. Elsa / Frozen, Spider-Man, Peppa Pig, Barbie) and what came of it. Call it once when you have shown original alternatives (or found none), and again if their reply changes the outcome. Silent bookkeeping — never mention it to the customer.",
    input_schema: {
      type: "object" as const,
      properties: {
        character: { type: "string", description: "The character the customer asked for, as they said it, e.g. \"Elsa\"" },
        franchise: { type: "string", description: "The film, show or brand it belongs to, if known, e.g. \"Frozen\"" },
        outcome: {
          type: "string",
          enum: [...CHARACTER_REQUEST_OUTCOMES],
          description:
            "shown_alternatives: you showed original designs, no answer yet. liked_alternative: they engaged with one (asked about it, sized it, wanted a sample). wants_only_character: they said only the real character will do. no_alternative_shown: nothing suitable was found to show.",
        },
        shown_handles: {
          type: "array",
          items: { type: "string" },
          description: "Handles of the original designs you showed for this request (max 8)",
        },
      },
      required: ["character", "outcome"],
    },
  },
];
