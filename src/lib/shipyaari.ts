// Shipyaari (docs.shipyaari.com) — a second courier aggregator, quoted beside
// Shiprocket so the two can be compared on the parcels we actually send.
//
// Quote-only on purpose. Booking lives in the OS (see fulfillment/types.ts for
// why the store never books), so nothing here mints an AWB or summons a pickup.

const API_BASE = "https://api-seller.shipyaari.com/api/v1";

type ShipyaariService = {
  partnerName?: string;
  partnerServiceName?: string;
  companyServiceName?: string;
  serviceMode?: string;
  appliedWeight?: number;
  base?: number;
  tax?: number;
  total?: number;
  EDT?: number;
  zoneName?: string;
};

export type ShipyaariRate = {
  courierName: string;
  serviceMode: string | null;
  appliedWeightKg: number | null;
  // Shipyaari's `total` already carries 18% GST — the comparable number.
  totalInclGstInr: number;
  estimatedDays: number | null;
  zone: string | null;
};

let tokenCache: { token: string; expiresAt: number } | null = null;

export function shipyaariConfigured(): boolean {
  return Boolean(process.env.SHIPYAARI_EMAIL && process.env.SHIPYAARI_PASSWORD);
}

async function authToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const email = process.env.SHIPYAARI_EMAIL;
  const password = process.env.SHIPYAARI_PASSWORD;
  if (!email || !password) throw new Error("Shipyaari credentials are not configured");
  const response = await fetch(`${API_BASE}/seller/signIn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    data?: { token?: string }[];
  };
  const token = body.data?.[0]?.token;
  if (!response.ok || !body.success || !token) {
    throw new Error(body.message || `Shipyaari authentication failed (${response.status})`);
  }
  // Tokens run about a day; refresh well inside that.
  tokenCache = { token, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
  return token;
}

export async function getShipyaariDomesticRates(input: {
  pickupPostcode: string;
  deliveryPostcode: string;
  weightKg: number;
  dimensionsCm: { length: number; width: number; height: number };
  declaredValueInr: number;
}): Promise<ShipyaariRate[]> {
  const token = await authToken();
  const response = await fetch(`${API_BASE}/order/checkServiceabilityV2`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      pickupPincode: Number(input.pickupPostcode),
      deliveryPincode: Number(input.deliveryPostcode),
      invoiceValue: Math.max(1, Math.round(input.declaredValueInr)),
      paymentMode: "PREPAID",
      weight: Number(input.weightKg.toFixed(2)),
      orderType: "B2C",
      dimension: input.dimensionsCm,
    }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    data?: ShipyaariService[];
  };
  // An account with no plan answers 500 "Seller Active Plan info not found" —
  // surface that verbatim; it is the one thing that blocks every quote.
  if (!response.ok || !body.success) {
    throw new Error(body.message || `Shipyaari rate lookup failed (${response.status})`);
  }
  return (body.data ?? [])
    .map((service): ShipyaariRate | null => {
      const total = Number(service.total);
      if (!Number.isFinite(total) || total < 0) return null;
      return {
        courierName: service.partnerServiceName || service.partnerName || "Shipyaari courier",
        serviceMode: service.serviceMode ?? null,
        appliedWeightKg: Number.isFinite(Number(service.appliedWeight)) ? Number(service.appliedWeight) : null,
        totalInclGstInr: total,
        estimatedDays: Number.isFinite(Number(service.EDT)) ? Number(service.EDT) : null,
        zone: service.zoneName ?? null,
      };
    })
    .filter((rate): rate is ShipyaariRate => rate !== null)
    .sort((a, b) => a.totalInclGstInr - b.totalInclGstInr);
}
