// DTDC direct, priced from our contract rate card.
//
// Unlike Shiprocket and Shipyaari, DTDC's own API (Shipsy-built) books, labels
// and tracks but has no quote endpoint: a direct account's price IS the rate
// card DTDC's sales rep issues with the customer code. So this prices a parcel
// the way the card does — zone, first slab, additional slabs, fuel surcharge,
// docket charge, GST — and every number comes from the card file. Nothing is
// defaulted: a missing figure is an error, never a zero that looks like a deal.

export type DtdcZone = "within_city" | "within_state" | "metro" | "rest_of_india" | "special";

export type DtdcRateCard = {
  // Who issued it and when, so a stale card is visible in the output.
  source: string;
  firstSlabKg: number;
  additionalSlabKg: number;
  zones: Record<DtdcZone, { firstSlabInr: number; additionalSlabInr: number }>;
  fuelSurchargePct: number;
  docketChargeInr: number;
  minimumChargeInr: number;
  // true when the card's figures already include 18% GST.
  gstIncluded: boolean;
  // Per-pincode overrides where the card files a lane differently from the
  // default map below (DTDC's metro list varies by contract).
  laneZones?: Record<string, DtdcZone>;
};

const ZONES: DtdcZone[] = ["within_city", "within_state", "metro", "rest_of_india", "special"];

// Default zoning FROM PUNE for the comparison lanes. The card's laneZones wins.
export const PUNE_LANE_ZONES: Record<string, DtdcZone> = {
  "411001": "within_city",
  "400051": "within_state",
  "110001": "metro",
  "560001": "metro",
  "500032": "metro",
  "600028": "metro",
  "700091": "metro",
  "380015": "metro",
  "302001": "rest_of_india",
  "781001": "special",
};

function num(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`DTDC rate card: ${field} must be a non-negative number (got ${JSON.stringify(value)})`);
  }
  return value;
}

export function parseDtdcRateCard(raw: unknown): DtdcRateCard {
  const card = raw as Partial<DtdcRateCard> | null;
  if (!card || typeof card !== "object") throw new Error("DTDC rate card: not a JSON object");
  if (typeof card.source !== "string" || !card.source.trim()) throw new Error("DTDC rate card: source is required");
  if (typeof card.gstIncluded !== "boolean") throw new Error("DTDC rate card: gstIncluded must be true or false");
  const zones = {} as DtdcRateCard["zones"];
  for (const zone of ZONES) {
    const z = card.zones?.[zone];
    zones[zone] = {
      firstSlabInr: num(z?.firstSlabInr, `zones.${zone}.firstSlabInr`),
      additionalSlabInr: num(z?.additionalSlabInr, `zones.${zone}.additionalSlabInr`),
    };
  }
  const firstSlabKg = num(card.firstSlabKg, "firstSlabKg");
  const additionalSlabKg = num(card.additionalSlabKg, "additionalSlabKg");
  if (firstSlabKg === 0 || additionalSlabKg === 0) throw new Error("DTDC rate card: slab sizes must be above zero");
  for (const [pin, zone] of Object.entries(card.laneZones ?? {})) {
    if (!ZONES.includes(zone)) throw new Error(`DTDC rate card: laneZones.${pin} is not a zone (${zone})`);
  }
  return {
    source: card.source,
    firstSlabKg,
    additionalSlabKg,
    zones,
    fuelSurchargePct: num(card.fuelSurchargePct, "fuelSurchargePct"),
    docketChargeInr: num(card.docketChargeInr, "docketChargeInr"),
    minimumChargeInr: num(card.minimumChargeInr, "minimumChargeInr"),
    gstIncluded: card.gstIncluded,
    laneZones: card.laneZones,
  };
}

export function dtdcZoneFor(card: DtdcRateCard, deliveryPostcode: string): DtdcZone | null {
  return card.laneZones?.[deliveryPostcode] ?? PUNE_LANE_ZONES[deliveryPostcode] ?? null;
}

// The card's price for one parcel, including GST — comparable with the other
// two aggregators' GST-inclusive figures.
export function dtdcPriceInclGst(card: DtdcRateCard, zone: DtdcZone, chargeableWeightKg: number): number {
  const rates = card.zones[zone];
  const extraSlabs = Math.max(0, Math.ceil((chargeableWeightKg - card.firstSlabKg) / card.additionalSlabKg - 1e-9));
  const freight = rates.firstSlabInr + extraSlabs * rates.additionalSlabInr;
  const beforeGst = Math.max(card.minimumChargeInr, freight * (1 + card.fuelSurchargePct / 100) + card.docketChargeInr);
  return Math.round((card.gstIncluded ? beforeGst : beforeGst * 1.18) * 100) / 100;
}
