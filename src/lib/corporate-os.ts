import "server-only";

// Server-to-server bridge to the Magnitude OS for corporate orders. The OS is
// the production system of record: it runs the approval agent, the Mimaki
// render and the hot-folder hand-off, and it owns dispatch (courier + AWB).
// The portal only mirrors what the OS reports.

const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");
const TOKEN = process.env.ZYVORAH_WEBHOOK_TOKEN ?? "";

export type CorporatePushInput = {
  partnerCheckout?: { wallpaper: number; customisation: number; total: number };
  productHandle?: string | null;
  orderRef: string;
  lineRef?: string;
  material?: string;
  materialSlug?: string;
  mediaCode?: string;
  artworkSha256?: string;
  customerId?: string;
  roomName?: string;
  wallIdentifier?: string;
  release?: {
    audit?: {
      specifiedBy: string;
      decisionBy: string;
      decisionAt: string;
      confirmedBy: string;
      confirmedAt: string;
      poUploadedBy: string;
      poAcceptedAt: string;
      confirmationVersion: number;
    };
    confirmationRef: string;
    poAcceptedAt: string;
    promisedDispatchDate: string;
    promiseDays: number;
    poDocument: {
      url: string;
      sha256: string;
      contentType: string;
      bytes: number;
    };
  };

  accountName: string;
  channel: string;            // 'vijay_sales'
  placedByEmail: string;
  poNumber?: string | null;
  /** The PROJECT these walls belong to. The OS keys its grouped documents (one
   *  proforma, one payment, one invoice for the whole sale) on this — and until
   *  it was sent, every wall of a project landed there as a stray. That is not
   *  cosmetic: two identical walls of one sale arrived as two independent sales
   *  with the same customer and the same amount, which is precisely the shape
   *  the Razorpay matcher refuses to guess at, so a real payment for them was
   *  left unmatched and both walls sat "awaiting payment". */
  groupRef?: string | null;
  printName?: string | null;
  designUrl: string;
  widthMm: number;
  heightMm: number;
  amountInr?: number | null;
  /** EX-GST rate quoted on screen — billed verbatim so the invoice can never
   *  disagree with what they approved. */
  ratePerSqft?: number | null;
  gstin?: string | null;
  state?: string | null;
  shipAddress?: string | null;
  shipCity?: string | null;
  shipPincode?: string | null;
  billingAddress?: string | null;
  shipContactName?: string | null;
  shipContactPhone?: string | null;
  placement?: { zoom: number; cropX: number; cropY: number; flipH?: boolean; flipV?: boolean } | null;
  /** Re-sending the engine handle of a previous print makes the engine reuse
   *  its cached (already AI-enhanced) image, so a repeat is byte-identical. */
  designRef?: string | null;
  /** Production policy for this account. 'payment_first' tells the OS to hold
   *  the order at awaiting_payment instead of releasing it to the printer —
   *  sent with the order so the two systems can't disagree about terms. */
  printGate?: "credit" | "payment_first" | null;
  /** Partner discount already applied, for the invoice's list → net breakdown. */
  discountPct?: number | null;
  /** Ex-GST value before the discount. */
  listAmount?: number | null;
  /** Qualifying large openings (a glass return, a full-height door) in run
   *  coordinates, mm, floor-anchored. The engine pins seams to their edges,
   *  prints short strips above and skips full-height panels. The partner has
   *  ALREADY been billed the reduced area, so omitting these would print film
   *  nobody paid for — same contract as the retail push (os-sync.ts). */
  openings?: { xMm: number; yMm: number; widthMm: number; heightMm: number }[] | null;
  excludedSqft?: number | null;
  chargeableSqft?: number | null;
  /** The media billing floor the quote was built on (migration 0106): the
   *  minimum billable width in force, and the sq ft actually billed. Sent so
   *  the OS invoice bills the same wall the same way — it re-derives the floor
   *  from the width and keeps billedSqft as the audit figure. */
  minBillableWidthMm?: number | null;
  billedSqft?: number | null;
  /** What KIND of product this wall is (product_categories.slug) and the print
   *  rules that follow from it. Resolved here, from the category table, and
   *  sent WITH the order rather than restated in the OS: one source of truth,
   *  and a copy of these numbers in a second system is a copy that disagrees
   *  one day. The OS applies them at dispatch instead of its old global
   *  zyvorah.print.* rules, which were wallpaper's rules wearing a
   *  channel-wide name. Absent = the OS keeps its existing behaviour. */
  printType?: string | null;
  printRules?: {
    overlapMm: number;
    cutBleedMm: number | null;
    maxPanelMm: number | null;
    nestAcross: boolean;
  } | null;
};

export type CorporatePushResult = {
  ok: boolean;
  osOrderId?: number | null;
  error?: string;
};

export async function pushCorporateOrderToOs(input: CorporatePushInput): Promise<CorporatePushResult> {
  if (!TOKEN) return { ok: false, error: "OS link not configured" };
  try {
    const res = await fetch(`${OS_BASE}/api/zyvorah/web-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-zyvorah-token": TOKEN },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        orderRef: input.orderRef,
        channel: input.channel,
        corporateName: input.accountName,
        poNumber: input.poNumber ?? undefined,
        release: input.release ?? undefined,
        groupRef: input.groupRef ?? undefined,
        gstin: input.gstin ?? undefined,
        state: input.state ?? undefined,
        billingAddress: input.billingAddress ?? undefined,
        placedByEmail: input.placedByEmail,
        customer: {
          name: input.accountName,
          email: input.placedByEmail,
          phone: input.shipContactPhone ?? undefined,
          address: [input.shipAddress, input.shipCity, input.state].filter(Boolean).join(", ") || undefined,
          city: input.shipCity ?? undefined,
          pincode: input.shipPincode ?? undefined,
          state: input.state ?? undefined,
        },
        amountInr: input.amountInr ?? undefined,
        partnerCheckout: input.partnerCheckout,
        productHandle: input.productHandle ?? undefined,
        ratePerSqft: input.ratePerSqft ?? undefined,
        printGate: input.printGate ?? undefined,
        discountPct: input.discountPct ?? undefined,
        listAmount: input.listAmount ?? undefined,
        printType: input.printType ?? undefined,
        printRules: input.printRules ?? undefined,
        items: [{
          lineRef: input.lineRef ?? "1",
          customerId: input.customerId, roomName: input.roomName, wallIdentifier: input.wallIdentifier,
          // The number this wall already has. The portal mints it from the one
          // issuer before this push; without it here the OS asked the same
          // issuer again and one wall left with two numbers (ZVY-20467 on the
          // partner's confirmation, ZVY-20468 on the board and the job sheet).
          // The OS adopts a ZVY it is given and mints only when it isn't.
          ...(/^ZVY-[0-9]+$/.test(input.orderRef) ? { zvy: input.orderRef } : {}),
          designUrl: input.designUrl,
          designRef: input.designRef ?? undefined,
          designName: input.printName ?? undefined,
          orderedTitle: input.printName ?? undefined,
          widthMm: input.widthMm,
          ...(input.minBillableWidthMm != null
            ? { minBillableWidthMm: input.minBillableWidthMm, ...(input.billedSqft != null ? { billedSqft: input.billedSqft } : {}) }
            : {}),
          heightMm: input.heightMm,
          material: input.material ?? "paste",
          materialSlug: input.materialSlug ?? undefined,
          mediaCode: input.mediaCode ?? undefined,
          artworkSha256: input.artworkSha256 ?? undefined,
          qty: 1,
          ...(input.placement ? { placement: input.placement } : {}),
          // Only sent when something actually qualified — an empty array would
          // read to the engine as "openings considered, none found", which is
          // true but noise, and the retail push has the same guard.
          ...(input.openings?.length
            ? {
                openings: input.openings,
                ...(input.excludedSqft != null ? { excludedSqft: input.excludedSqft } : {}),
                ...(input.chargeableSqft != null ? { chargeableSqft: input.chargeableSqft } : {}),
              }
            : {}),
        }],
      }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `OS ${res.status}: ${text.slice(0, 200)}` };
    const json = JSON.parse(text) as { items?: { id: number }[]; partnerCheckoutAccepted?: boolean };
    if (input.partnerCheckout && !json.partnerCheckoutAccepted) return {ok:false,error:"OS has not confirmed the customisation fee. Payment remains on hold."};
    return { ok: true, osOrderId: json.items?.[0]?.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type OsOrderStatus = {
  printStatus: string | null;
  stage: string | null;
  panels: number | null;
  /** Production milestones, with their dates — the partner sees the same
   *  timeline our desk does, so "where is my order" needs no phone call. */
  approvedAt: string | null;
  printingAt: string | null;
  printedAt: string | null;
  /** Printing finished AND checked — boxed, waiting on a courier. */
  labelReleasedAt: string | null;
  dispatchedAt: string | null;
  /** The courier's delivered scan — Delhivery's OTP handover (25 Oct 2026). */
  deliveredAt?: string | null;
  podNo: string | null;
  courier: string | null;
  trackingUrl: string | null;
  designRef: string | null;
  printOrderNo: string | null;
  /**
   * The OS reports WHAT state a job is in, not why. If production ever starts
   * sending a reason alongside `needs_input`, it arrives under a key we don't
   * declare — so the whole object is passed through rather than picked apart,
   * and lib/corporate-attention.ts reads any reason it finds. Without this
   * index signature the spread below would drop unknown keys and a partner
   * could never be told what production actually asked.
   */
  [extra: string]: unknown;
};

/** Live status for a batch of OS order ids — one call for the whole dashboard. */
export async function fetchOsStatuses(ids: number[]): Promise<Record<number, OsOrderStatus>> {
  if (!TOKEN || ids.length === 0) return {};
  try {
    const res = await fetch(`${OS_BASE}/api/zyvorah/channel-order-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-zyvorah-token": TOKEN },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as { orders?: (OsOrderStatus & { id: number })[] };
    const out: Record<number, OsOrderStatus> = {};
    for (const o of json.orders ?? []) out[o.id] = o;
    return out;
  } catch {
    return {};
  }
}

/**
 * The partner's whole account as the OS holds it — their walls and their
 * documents, not merely the ones that came through this portal.
 *
 * The portal lists from `corporate_orders`, which only ever holds what was
 * ordered HERE. Vijay Sales had 90 walls in production and 70 rows here, and
 * every one of their 31 documents — including the tax invoice they pay against
 * — existed only in the OS. This is the read that closes that gap, so the
 * partner's view and the desk's view are the same account seen twice.
 *
 * Never throws: the OS being slow or down degrades the portal to what it always
 * showed, and must never take the page with it.
 */
export type PartnerInstallation = {
  installerName: string; installerPhone: string; status: string; tentativeDate: string;
  paidBy: "partner" | "us"; emailSentAt: string | null; acceptedAt: string | null; responseDueAt: string | null;
};
export type PartnerMirrorOrder = {
  installation?: PartnerInstallation | null;
  osOrderId: number;
  printOrderNo: string | null;
  printName: string | null;
  widthMm: number | null; heightMm: number | null;
  printStatus: string | null; stage: string | null;
  batchRef: string | null; groupRef: string | null;
  poNumber: string | null;
  dispatchedAt: string | null; printedAt: string | null; createdAt: string | null;
  /** False for a wall taken at our desk: showable, but with no row here to act on. */
  viaPortal: boolean;
};

export type PartnerMirrorDocument = {
  id: number;
  kind: "quotation" | "proforma" | "tax";
  number: string;
  status: string | null;
  batchRef: string | null; groupRef: string | null; orderId: number | null;
  taxableTotal: number | null; grandTotal: number | null;
  cgst: number | null; sgst: number | null; igst: number | null;
  ratesIncludeGst: boolean | null;
  sentAt: string | null; createdAt: string | null;
};

export type PartnerInstallerOption = { name: string; phone: string; city: string };
export type PartnerMirror = {
  installerOptions?: PartnerInstallerOption[];
  orders: PartnerMirrorOrder[];
  documents: PartnerMirrorDocument[];
};

/** The OS channel code for an account slug — 'vijay-sales' → 'vijay_sales'. */
export const channelForSlug = (slug: string) => slug.replace(/-/g, "_");

export async function fetchPartnerMirror(slug: string): Promise<PartnerMirror> {
  const empty: PartnerMirror = { orders: [], documents: [] };
  if (!TOKEN) return empty;
  try {
    const r = await fetch(
      `${OS_BASE}/api/zyvorah/partner-mirror?channel=${encodeURIComponent(channelForSlug(slug))}`,
      { headers: { "x-zyvorah-token": TOKEN }, cache: "no-store", signal: AbortSignal.timeout(20_000) },
    );
    if (!r.ok) return empty;
    const j = (await r.json()) as { ok?: boolean } & PartnerMirror;
    return j?.ok ? { orders: j.orders ?? [], documents: j.documents ?? [], installerOptions: j.installerOptions ?? [] } : empty;
  } catch {
    return empty;
  }
}

/** One document's PDF, streamed straight through. Null when the OS says no. */
export async function fetchPartnerDocumentPdf(slug: string, documentId: number): Promise<ArrayBuffer | null> {
  if (!TOKEN) return null;
  try {
    const r = await fetch(
      `${OS_BASE}/api/zyvorah/partner-mirror/document/${documentId}/pdf?channel=${encodeURIComponent(channelForSlug(slug))}`,
      { headers: { "x-zyvorah-token": TOKEN }, cache: "no-store", signal: AbortSignal.timeout(30_000) },
    );
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

export async function nominatePartnerInstaller(slug: string, orderId: number, installerPhone: string): Promise<void> {
  if (!TOKEN) throw new Error("Installer assignment is unavailable");
  const r = await fetch(`${OS_BASE}/api/zyvorah/partner-mirror/assign`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-zyvorah-token": TOKEN }, cache: "no-store", signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ channel: channelForSlug(slug), orderId, installerPhone }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Could not assign installer"); }
}
