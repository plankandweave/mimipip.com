import { partnerCapabilities } from "@/lib/partner-capabilities";
import "server-only";
import { randomUUID } from "node:crypto";
import { mintOrderNumber } from "@/lib/order-number";
import {
  priceWall, priceWallFromCatalogue, sizeRejection,
  type CorporateAccount, type CorporateQuote,
} from "@/lib/corporate-auth";
import { getProductByHandle } from "@/lib/queries";
import { parseOpenings, planWallOpenings, type WallOpenings } from "@/lib/corporate-openings";
import { pushCorporateOrderToOs } from "@/lib/corporate-os";
import {
  minBillableWidthMm, printRulesFor, resolvePrintType, validPrintType,
  WALLPAPER_PRINT_TYPE, WALLPAPER_RULES, type ProductPrintRules,
} from "@/lib/print-types";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A multi-wall partner project: validating it, pricing it, and placing it.
 *
 * Two routes now commit the same project — the partner sending it straight to
 * print (orders/batch) and the PO raiser approving a quotation days later
 * (corporate/quotes/[token]/approve). They MUST agree on every rupee and every
 * OS push, and a project priced one way at send time and another at approval
 * time is exactly the drift a partner notices on their invoice. So the
 * arithmetic lives here once, and both routes call it.
 */

export type Placement = { zoom: number; cropX: number; cropY: number; flipH?: boolean; flipV?: boolean };

/** One wall as it arrives over the wire — geometry and artwork only. Nothing
 *  about price is read from the caller, at either entry point. */
export type RawProjectLine = Record<string, unknown>;

export type PricedLine = {
  proposal?: { studyId: string; revision: number; breakdown: Record<string, number> };
  designUrl: string; designRef: string | null; designWpx: number | null; designHpx: number | null;
  widthMm: number; heightMm: number; printName: string | null;
  productHandle: string | null; materialSlug: string | null;
  placement: Placement | null;
  /** What kind of product this wall is — it decides the print rules the OS
   *  dispatches with (migration 0104) and the billing floor its price is built
   *  on (0106). Resolved per LINE: one project can legitimately mix a wrap and
   *  a wallpaper, and a nest may only gang pieces under the same rules. */
  printType: string;
  printRules: ProductPrintRules;
  price: CorporateQuote;
  /** Per-wall exclusion plan — each wall in a project has its own openings
   *  (one storefront's glass return is not the next one's). */
  openings: WallOpenings;
  /** The openings as GEOMETRY, in the millimetres this module accepts.
   *
   *  Deliberately NOT `openings.snapshot`: that is the priced plan, an object
   *  of `{doors, plan}` whose doors are in CENTIMETRES. A quotation replays its
   *  stored lines through priceProjectLines() on approval, so what it stores
   *  has to be the shape parseOpenings() takes — otherwise a wall with a door
   *  can be quoted and then never approved. */
  wireOpenings: { widthMm: number; heightMm: number; offsetMm: number; sillMm?: number }[];
};

export type PriceFailure = { ok: false; error: string; status: number };
export type PriceSuccess = { ok: true; lines: PricedLine[] };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Validate + price every line BEFORE anything is inserted: a batch that dies
 * half-way leaves the partner guessing which walls exist. All-or-nothing.
 */
export async function priceProjectLines(
  acc: CorporateAccount, rawLines: RawProjectLine[],
): Promise<PriceSuccess | PriceFailure> {
  // Print-type lookups only — pricing itself never touches the database. With
  // no admin client the types fall back to wallpaper, exactly as an unknown
  // product does, so a misconfigured environment prices the status quo rather
  // than refusing the project.
  if(!partnerCapabilities(acc).customSizing)return {ok:false,status:403,error:"Custom wall dimensions and composition are disabled for this partner."};
  const typeSb = supabaseAdmin();
  const lines: PricedLine[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i];
    const designUrl = str(l.designUrl);
    const widthMm = Math.round(num(l.widthMm));
    const heightMm = Math.round(num(l.heightMm));
    const label = str(l.printName) || `wall ${i + 1}`;
    if (!designUrl) return { ok: false, status: 400, error: `Line ${i + 1} (${label}) has no artwork.` };
    const badSize = sizeRejection(widthMm, heightMm);
    if (badSize) return { ok: false, status: 400, error: `Line ${i + 1} (${label}): wall ${badSize}.` };

    // Openings on THIS wall, validated against THIS wall's size. A bad opening
    // fails the whole project before anything is inserted, like a bad size does
    // — half a project placed is worse than none.
    const parsedOpenings = parseOpenings(l.openings, widthMm, heightMm);
    if (!parsedOpenings.ok) {
      return { ok: false, status: 400, error: `Line ${i + 1} (${label}): ${parsedOpenings.error}.` };
    }
    const openings = await planWallOpenings(widthMm, heightMm, parsedOpenings.doors);

    const pickedHandle = str(l.productHandle) || null;
    const productHandle = acc.pricing_mode === "website" ? (pickedHandle ?? "custom-wallpaper") : pickedHandle;
    const materialSlug = str(l.materialSlug) || null;

    // What kind of product this wall is — resolved BEFORE pricing, because the
    // print rules carry the billing floor (0106). The line's own type first: a
    // library design or a band knows what it is, and a flat-rate partner has no
    // catalogue handle for the server to fall back on.
    const printType = typeSb
      ? ((await validPrintType(typeSb, l.printType)) ?? (await resolvePrintType(typeSb, productHandle)))
      : WALLPAPER_PRINT_TYPE;
    const printRules = typeSb ? await printRulesFor(typeSb, printType) : WALLPAPER_RULES;
    // The media floor: a one-lane piece bills at least run length × the
    // billable web width; a nest-capable type shares the web and has none.
    const minBillable = minBillableWidthMm(printRules);

    let price: CorporateQuote;
    if (acc.pricing_mode === "website") {
      if (!materialSlug) {
        return { ok: false, status: 400, error: `Line ${i + 1} (${label}): choose a material to price it.` };
      }
      const product = await getProductByHandle(productHandle!);
      if (!product) {
        return { ok: false, status: 400, error: `Line ${i + 1} (${label}): that design is no longer available.` };
      }
      const pm = (product.product_materials ?? []).find(
        (m) => m.available && m.materials?.slug === materialSlug && !m.materials?.coming_soon,
      );
      if (!pm) {
        return { ok: false, status: 400, error: `Line ${i + 1} (${label}): that material is not available for this design.` };
      }
      price = priceWallFromCatalogue(
        widthMm, heightMm, Number(pm.price_per_sqft),
        Number(acc.gst_pct), Number(acc.discount_pct), openings.chargeableSqft, minBillable,
      );
    } else {
      price = priceWall(
        widthMm, heightMm, Number(acc.rate_per_sqft),
        Number(acc.gst_pct), Number(acc.discount_pct), openings.chargeableSqft, minBillable,
      );
    }

    lines.push({
      designUrl,
      designRef: str(l.designRef) || null,
      designWpx: l.designWpx ? Math.round(num(l.designWpx)) : null,
      designHpx: l.designHpx ? Math.round(num(l.designHpx)) : null,
      widthMm, heightMm,
      printName: str(l.printName) || null,
      productHandle, materialSlug, printType, printRules, price, openings,
      // Re-derived from the VALIDATED doors rather than echoed from the
      // request, so a quotation can only ever replay geometry that already
      // passed this wall's checks. parseOpenings divided by ten; this
      // multiplies it back, exact for the whole millimetres the form sends.
      wireOpenings: parsedOpenings.doors.map((d) => ({
        widthMm: Math.round(d.widthCm * 10),
        heightMm: Math.round(d.heightCm * 10),
        offsetMm: Math.round(d.offsetCm * 10),
        ...(d.sillCm ? { sillMm: Math.round(d.sillCm * 10) } : {}),
      })),
      // The framing the partner confirmed in the visualizer — stored on the row
      // and sent to the print engine.
      placement: l.placement && typeof l.placement === "object" ? l.placement as Placement : null,
    });
  }
  return { ok: true, lines };
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * Per-account minimum order (migration 0094). A payment-first project lands as
 * DRAFTS — quoting stays free, and the minimum bites later, at freeze. A credit
 * project commits to production at placement, so that is its commitment point.
 * Compared on the project's combined ex-GST net.
 */
export function minOrderShortfall(acc: CorporateAccount, lines: PricedLine[]): string | null {
  const minOrder = num(acc.min_order_value_inr);
  if (acc.print_gate === "payment_first" || minOrder <= 0) return null;
  const netTotal = lines.reduce((s, l) => s + l.price.amount, 0);
  if (netTotal + 0.001 >= minOrder) return null;
  return `Minimum order is ${inr(minOrder)} (ex-GST) — this project is ${inr(netTotal)}, ${inr(minOrder - netTotal)} short. Add walls or area to reach the minimum.`;
}

/** Geometry only — what a quotation stores and replays. Never prices. */
export function wireProjectLine(l: PricedLine) {
  return {
    designUrl: l.designUrl, designRef: l.designRef,
    designWpx: l.designWpx, designHpx: l.designHpx,
    widthMm: l.widthMm, heightMm: l.heightMm, printName: l.printName,
    productHandle: l.productHandle, materialSlug: l.materialSlug,
    // The resolved type, so a quoted band approved days later still prices and
    // prints as what it was — replay re-validates it against the type table.
    printType: l.printType,
    placement: l.placement,
    openings: l.wireOpenings,
  };
}

export type ShipProfile = {
  state: string;
  gstin: string | null;
  address_line: string | null;
  city: string | null;
  pincode: string | null;
  contact_name: string | null;
  contact_phone: string | null;
};

export type PlacedLine = {
  id: string; orderRef: string; line: PricedLine;
  osOrderId?: number | null; pushError?: string;
};

export type PlaceResult =
  | { ok: true; groupRef: string; placed: PlacedLine[] }
  | { ok: false; error: string; status: number };

/**
 * Insert one corporate_order per wall, stamp them with one group_ref, and (for
 * credit accounts) push each to the OS.
 *
 * Each line is its OWN order and its OWN push: the print engine panelizes per
 * wall, so one wall per production row is what keeps cut plans and media
 * wastage honest. The group exists for the humans — dashboard, invoice, PO.
 */
export async function placeProject(opts: {
  sb: SupabaseClient;
  acc: CorporateAccount;
  lines: PricedLine[];
  profile: ShipProfile;
  placedByEmail: string;
  poNumber: string | null;
  /** Pre-minted group ref — the quotation route reserves one so a retry can
   *  never mint a second project. Omitted, one is minted here. */
  groupRef?: string;
}): Promise<PlaceResult> {
  const { sb, acc, lines, profile, placedByEmail, poNumber } = opts;
  if (partnerCapabilities(acc).poRequiredRelease) return { ok: false, status: 403, error: "PO-required accounts must use the private purchasing workflow." };
  const refPrefix = (acc.ref_prefix ?? "VS").toUpperCase();
  // The group's own name — quotable on a PO ("VSG-K3X9T2"), never colliding
  // with the per-line order numbers. This one KEEPS the account prefix: it is a
  // random token for humans, not a series, so the single-issuer rule does not
  // reach it.
  const groupRef = opts.groupRef ?? `${refPrefix}G-${Date.now().toString(36).toUpperCase()}`;

  // Every line's number is minted BEFORE anything is written. A project is one
  // decision by the partner, and half a project in the database because the
  // issuer went away mid-loop is the worst of both — this way a mint failure
  // leaves no rows at all. Each line gets its own id up front so it can key its
  // own mint idempotently.
  const numbered: { id: string; orderRef: string; line: PricedLine }[] = [];
  for (const line of lines) {
    const id = randomUUID();
    const minted = await mintOrderNumber(`corp-order-${id}`, "dealer");
    if (!minted) {
      return {
        ok: false, status: 503,
        error: "We couldn't reserve order numbers just now. Nothing has been placed — please try again in a moment.",
      };
    }
    numbered.push({ id, orderRef: minted.ref, line });
  }

  const placed: PlacedLine[] = [];
  for (const { id, orderRef, line } of numbered) {
    const { data: inserted, error } = await sb.from("corporate_orders").insert({
      id,
      ...(line.proposal ? { source_study_id: line.proposal.studyId, source_study_revision: line.proposal.revision, service_breakdown: line.proposal.breakdown } : {}),
      account_id: acc.id,
      order_ref: orderRef,
      group_ref: groupRef,
      placed_by_email: placedByEmail,
      print_name: line.printName,
      po_number: poNumber,
      design_url: line.designUrl,
      design_ref: line.designRef,
      design_w_px: line.designWpx,
      design_h_px: line.designHpx,
      crop_data: line.placement,
      width_mm: line.widthMm,
      height_mm: line.heightMm,
      // Chargeable area, with the plain rectangle kept alongside (migration 0087).
      area_sqft: line.price.areaSqft,
      full_area_sqft: line.price.fullAreaSqft,
      excluded_sqft: line.price.excludedSqft,
      min_billable_width_mm: line.price.minBillableWidthMm,
      print_type: line.printType,
      openings: line.openings.snapshot,
      rate_per_sqft: line.price.ratePerSqft,
      amount: line.price.amount,
      gst_pct: acc.gst_pct,
      gst_amount: line.price.gstAmount,
      total: line.price.total,
      list_amount: line.price.listAmount,
      discount_pct: line.price.discountPct,
      discount_amount: line.price.discountAmount,
      product_handle: line.productHandle,
      material_slug: line.materialSlug,
      state: profile.state,
      gstin: profile.gstin,
      ship_address: profile.address_line,
      ship_city: profile.city,
      ship_pincode: profile.pincode,
      ship_contact_name: profile.contact_name,
      ship_contact_phone: profile.contact_phone,
      status: acc.print_gate === "payment_first" ? "draft" : "submitted",
    }).select().single();

    if (error || !inserted) {
      console.error("[corporate-project] insert failed:", error?.message);
      // Lines already placed stay placed — report exactly how far we got.
      return {
        ok: false, status: 500,
        error: `Could not save line ${placed.length + 1}. ${placed.length} wall(s) were placed (${placed.map(p => p.orderRef).join(", ")}) — the rest were not. Our team has been alerted.`,
      };
    }
    placed.push({ id: inserted.id as string, orderRef, line });
  }

  // Payment-first partners keep the whole project as drafts: quote the client,
  // then freeze line by line (or all together from the dashboard). Credit
  // accounts go to production now, one OS push per wall.
  if (acc.print_gate !== "payment_first") {
    for (const p of placed) {
      const push = await pushCorporateOrderToOs({
        orderRef: p.orderRef,
        accountName: acc.name,
        channel: acc.slug.replace(/-/g, "_"),
        placedByEmail,
        poNumber,
        groupRef,
        printName: p.line.printName,
        designUrl: p.line.designUrl,
        designRef: p.line.designRef,
        widthMm: p.line.widthMm, heightMm: p.line.heightMm,
        amountInr: p.line.price.total,
        // The rate this LINE was quoted at, never the account column: a
        // discount-mode account (pricing_mode 'website') carries rate_per_sqft
        // 0, and sending that made the OS fall back to another partner's
        // contracted rate. The freeze path has always sent the quoted rate;
        // this one now matches it.
        ratePerSqft: p.line.price.ratePerSqft,
        discountPct: p.line.price.discountPct,
        listAmount: p.line.price.listAmount,
        gstin: profile.gstin,
        state: profile.state,
        shipAddress: profile.address_line,
        shipCity: profile.city,
        shipPincode: profile.pincode,
        shipContactName: profile.contact_name,
        shipContactPhone: profile.contact_phone,
        placement: p.line.placement,
        openings: p.line.openings.engineOpenings,
        excludedSqft: p.line.price.excludedSqft || null,
        chargeableSqft: p.line.openings.chargeableSqft,
        minBillableWidthMm: p.line.price.minBillableWidthMm,
        billedSqft: p.line.price.areaSqft,
        printType: p.line.printType,
        printRules: p.line.printRules,
      });
      p.osOrderId = push.ok ? push.osOrderId ?? null : null;
      p.pushError = push.ok ? undefined : (push.error ?? "unknown");
      await sb.from("corporate_orders").update(
        push.ok
          ? { os_order_id: p.osOrderId, status: "in_production" }
          : { status: "push_failed", push_error: p.pushError },
      ).eq("id", p.id);
      if (!push.ok) console.error("[corporate-project] OS push failed:", p.orderRef, p.pushError);
    }
  }

  return { ok: true, groupRef, placed };
}

export function projectTotals(placed: PlacedLine[]) {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    totalSqft: r1(placed.reduce((s, p) => s + p.line.price.areaSqft, 0)),
    totalInr: Math.round(placed.reduce((s, p) => s + p.line.price.total, 0)),
    // Film the openings work kept off the machine on this project — the desk
    // sees it per project rather than reconciling area against wall sizes.
    totalExcludedSqft: r1(placed.reduce((s, p) => s + p.line.price.excludedSqft, 0)),
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
