"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { sendTasteSignal } from "@/components/TasteSignal";
import { gaEvent, gaAddToCart, gaAddToCartLines, gaRemoveFromCart } from "@/lib/ga";
import { metaAddToCart, metaAddToCartLines } from "@/lib/meta-pixel";
import { usePartner } from "@/components/PartnerProvider";
import { useMarket } from "@/components/MarketProvider";
import type { CropData } from "@/lib/visualizer";

export type CartItem = {
  item_id: string;
  price_changed?: boolean;
  handle: string;
  title: string;
  requires_preparation?: boolean;
  exclusivity_fee?: number;
  exclusive_project?: string | null;
  room_label?: string | null;
  concept_slug?: string | null;
  material_slug: string;
  material_name: string;
  width_cm: number;
  height_cm: number;
  area_sqft: number;
  unit_price: number;
  quantity: number;
  line_total: number;
  /** the product's category slug (product_categories) */
  category?: string | null;
  /** the family's display name, e.g. "Borders & Strips" */
  category_title?: string | null;
  /** the category's pricing unit — "metre" lines carry quantity as metres */
  pricing_unit?: "sqft" | "metre" | "piece" | null;
  /** which family this line belongs to — decides how the line is described */
  measurement_type?: "area" | "length" | "fixed" | null;
  /** the category's minimum per line; the stepper must not go below it */
  min_order_qty?: number | null;
  /** per-metre rate, for per-metre categories */
  price_per_metre?: number | null;
  /** how a length line arrives: one continuous strip, or pieces */
  supply_format?: "continuous" | "segmented" | null;
  /** length of one piece, in metres, when segmented */
  segment_length_m?: number | null;
  /** a border's fixed height, in cm */
  border_height_cm?: number | null;
  /** installation portion baked into line_total (0 if none) — for the invoice split */
  installation?: number;
  /** child's-name personalisation fee baked into line_total (0 if none) */
  personalisation?: number;
  /** the child's name the studio will hand-place, if personalisation was added */
  child_name?: string | null;
  text_overlay?: import("@/lib/text-overlay").TextOverlay | null;
  crop_data?: CropData | null;
  /** for the Bespoke Customisation SKU: the customer's customisation note */
  bespoke_note?: string | null;
  image: string | null;
  preview_url: string | null;
};

type CartState = {
  items: CartItem[];
  subtotal: number;
  count: number;
  loading: boolean;
  readError: boolean;
  mutationError: string | null;
  mutating: boolean;
  add: (payload: AddPayload) => Promise<boolean>;
  /** Add a whole office concept (many walls) as ONE tracked add-to-cart. */
  addConcept: (body: unknown) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateQty: (itemId: string, quantity: number) => Promise<void>;
  remove: (itemId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
};

type AddPayload = {
  productHandle: string;
  materialSlug: string;
  widthCm: number;
  heightCm: number;
  areaSqft: number;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  crop?: CropData;
  roomComposite?: string | null;
};

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { market } = useMarket();
  const [items, setItems] = useState<CartItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const mutationPending = useRef(false);
  // A read started before a write must never restore an obsolete basket.
  const revision = useRef(0);

  const apply = (data: { items?: CartItem[]; subtotal?: number }) => {
    setReadError(false);
    setLoading(false);
    setMutationError(null);
    setItems(data.items ?? []);
    setSubtotal(data.subtotal ?? 0);
  };

  // A partner's person has no cart here — see src/lib/partner-mode.ts. Don't
  // even ask; the answer would be a 403 and an empty badge either way.
  const { partner, loading: partnerLoading } = usePartner();
  const refresh = useCallback(async () => {
    if (partnerLoading) return;
    if (partner) { setLoading(false); return; }
    const requestRevision = ++revision.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch("/api/cart", { signal: controller.signal });
      if (!res.ok) throw new Error("cart_unavailable");
      const data = await res.json();
      if (!Array.isArray(data.items)) throw new Error("cart_unavailable");
      if (requestRevision === revision.current) apply(data);
    } catch {
      if (requestRevision === revision.current) setReadError(true);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [partner, partnerLoading]);

  useEffect(() => {
    // The cart is external state; defer synchronization until this commit ends.
    let live = true;
    void Promise.resolve().then(() => { if (live) return refresh(); });
    return () => { live = false; };
  }, [refresh]);

  const add = useCallback(async (payload: AddPayload) => {
    const requestRevision = ++revision.current;
    gaEvent("cart_add_attempt", { item_id: payload.productHandle, cart_flow: "product" });
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        gaEvent("cart_add_failed", { item_id: payload.productHandle, cart_flow: "product", failure_stage: "response", http_status: res.status });
        return false;
      }
      const data = (await res.json()) as { items?: CartItem[]; subtotal?: number; added?: boolean };
      if (!Array.isArray(data.items) && data.added !== true) return false;
      if (Array.isArray(data.items) && requestRevision === revision.current) apply(data);
      else void refresh();
      // adding to cart is the strongest taste signal
      sendTasteSignal(payload.productHandle, "cart");
      // the response carries the real cart line, so GA gets the design's title
      // and material rather than the bare handle
      const line = data.items?.find(
        (it) => it.handle === payload.productHandle && it.material_slug === payload.materialSlug,
      );
      gaAddToCart({
        ...payload,
        title: line?.title,
        materialName: line?.material_name,
        countryCode: market.countryCode,
        currency: market.currency,
      });
      // Meta takes the line total as the shopper sees it — GST included — so
      // it is passed raw here while gaAddToCart nets it down. See meta-pixel.ts.
      metaAddToCart({
        handle: payload.productHandle,
        title: line?.title,
        lineTotalInr: payload.lineTotal,
        quantity: payload.quantity,
        countryCode: market.countryCode,
        currency: market.currency,
      });
      return true;
    } catch {
      gaEvent("cart_add_failed", { item_id: payload.productHandle, cart_flow: "product", failure_stage: "network_or_response" });
      return false;
    }
  }, [market.countryCode, market.currency, refresh]);

  /**
   * Add an office concept — many walls in one shopper action.
   *
   * It lives here, beside `add`, for one reason: this is the single place
   * where a cart addition tells BOTH measurement channels about itself. The
   * concept builder used to POST the route directly and then call refresh(),
   * so every office-concept add was invisible to GA4 and Meta alike — no
   * retargeting, no optimisation signal, no funnel. One entry point per kind
   * of addition is what stops that happening again.
   *
   * The RPC returns the cart snapshot itself, so this also drops the second
   * round trip the builder was making.
   *
   * New lines are diffed against the cart we already hold, because the route
   * is idempotent: a retry with the same requestId inserts nothing and returns
   * the unchanged cart. Nothing new means nothing happened, so nothing fires.
   */
  const addConcept = useCallback(async (body: unknown): Promise<{ ok: true } | { ok: false; error: string }> => {
    gaEvent("cart_add_attempt", { cart_flow: "concept" });
    const requestRevision = ++revision.current;
    const previousIds = new Set(items.map((it) => it.item_id));
    let res: Response;
    try {
      res = await fetch("/api/cart/concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      gaEvent("cart_add_failed", { cart_flow: "concept", failure_stage: "network" });
      return { ok: false, error: "Connection interrupted. Your selection is saved; please try again." };
    }
    const data = (await res.json().catch(() => null)) as
      | { items?: CartItem[]; subtotal?: number; error?: string }
      | null;
    if (!res.ok) {
      gaEvent("cart_add_failed", { cart_flow: "concept", failure_stage: "response", http_status: res.status });
      return { ok: false, error: data?.error || "Could not add your concept. Please try again." };
    }
    if (!data || !Array.isArray(data.items)) {
      gaEvent("cart_add_failed", { cart_flow: "concept", failure_stage: "invalid_response" });
      return { ok: false, error: "Could not confirm your cart. Please open your cart before trying again." };
    }
    if (data && requestRevision === revision.current) apply(data);
    else void refresh();

    const newLines = (data?.items ?? []).filter((it) => !previousIds.has(it.item_id));
    if (newLines.length) {
      for (const handle of new Set(newLines.map((it) => it.handle))) sendTasteSignal(handle, "cart");
      const lines = newLines.map((it) => ({
        handle: it.handle,
        title: it.title,
        materialName: it.material_name,
        lineTotalInr: it.line_total,
        quantity: Math.max(1, it.quantity),
      }));
      gaAddToCartLines({ lines, countryCode: market.countryCode, currency: market.currency });
      metaAddToCartLines({ lines, countryCode: market.countryCode, currency: market.currency });
    }
    return { ok: true };
  }, [items, market.countryCode, market.currency, refresh]);

  const changeLine = useCallback(async (method: "PATCH" | "DELETE", itemId: string, quantity?: number) => {
    if (mutationPending.current) return false;
    mutationPending.current = true;
    setMutating(true);
    setMutationError(null);
    const requestRevision = ++revision.current;
    try {
      const response = await fetch("/api/cart", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, ...(quantity === undefined ? {} : { quantity }) }),
      });
      const data = await response.json();
      if (!response.ok || (!Array.isArray(data.items) && data.changed !== true)) throw new Error("cart_change_failed");
      if (Array.isArray(data.items)) {
        if (requestRevision === revision.current) apply(data);
        else void refresh();
      } else {
        setReadError(true);
        setMutationError("Your change was saved, but we couldn’t reload the cart. Reload before checkout.");
        void refresh();
      }
      return true;
    } catch {
      setMutationError("We couldn’t confirm your cart change. Reload your cart before trying again.");
      return false;
    } finally {
      mutationPending.current = false;
      setMutating(false);
    }
  }, [refresh]);

  const updateQty = useCallback(async (itemId: string, quantity: number) => {
    await changeLine("PATCH", itemId, quantity);
  }, [changeLine]);

  const remove = useCallback(async (itemId: string) => {
    const leaving = items.find((it) => it.item_id === itemId);
    const removed = await changeLine("DELETE", itemId);
    if (removed && leaving) {
      try { gaRemoveFromCart({ item: leaving, countryCode: market.countryCode, currency: market.currency }); } catch { /* Saved cart changes cannot fail on analytics. */ }
    }
    return removed;
  }, [changeLine, items, market.countryCode, market.currency]);

  const count = items.reduce((n, i) => n + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, subtotal, count, loading, readError, mutationError, mutating, add, addConcept, updateQty, remove, refresh }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

