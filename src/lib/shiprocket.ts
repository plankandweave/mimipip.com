const API_BASE = "https://apiv2.shiprocket.in/v1/external";

type ShiprocketCourier = {
  courier_company_id?: number;
  courier_name?: string;
  freight_charge?: number;
  rate?: number;
  etd?: string;
  estimated_delivery_days?: string;
};

export type ShiprocketRate = {
  courierId: number | null;
  courierName: string;
  internalCostInr: number;
  // Comparable with Shipyaari's GST-inclusive `total`. Shiprocket's `rate` is
  // the all-in figure when present; `freight_charge` alone is ex-GST.
  inclGstInr: number;
  estimatedDelivery: string | null;
};

let tokenCache: { token: string; expiresAt: number } | null = null;

export function shiprocketPickupPostcode(): string | null {
  const explicit = process.env.SHIPROCKET_PICKUP_POSTCODE?.trim();
  if (explicit && /^[1-9]\d{5}$/.test(explicit)) return explicit;
  const address = process.env.SELLER_ADDRESS ?? "";
  return address.match(/\b[1-9]\d{5}\b/)?.[0] ?? null;
}

export function shiprocketConfigured(): boolean {
  return Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);
}

async function authToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password) throw new Error("Shiprocket credentials are not configured");
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!response.ok || !body.token) throw new Error(body.message || `Shiprocket authentication failed (${response.status})`);
  tokenCache = { token: body.token, expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000 };
  return body.token;
}

export async function getShiprocketDomesticRates(input: {
  deliveryPostcode: string;
  chargeableWeightKg: number;
  declaredValueInr?: number;
  pickupPostcode?: string;
}): Promise<ShiprocketRate[]> {
  const token = await authToken();
  const pickup = input.pickupPostcode ?? shiprocketPickupPostcode() ?? await primaryPickupPostcode(token);
  const params = new URLSearchParams({
    pickup_postcode: pickup,
    delivery_postcode: input.deliveryPostcode,
    cod: "0",
    weight: input.chargeableWeightKg.toFixed(2),
  });
  if (input.declaredValueInr && input.declaredValueInr > 0) {
    params.set("declared_value", String(Math.round(input.declaredValueInr)));
  }
  const response = await fetch(`${API_BASE}/courier/serviceability/?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    data?: { available_courier_companies?: ShiprocketCourier[] };
  };
  if (!response.ok) throw new Error(body.message || `Shiprocket rate lookup failed (${response.status})`);
  return (body.data?.available_courier_companies ?? [])
    .map((courier): ShiprocketRate | null => {
      const cost = Number(courier.freight_charge ?? courier.rate);
      if (!Number.isFinite(cost) || cost < 0) return null;
      const allIn = Number(courier.rate);
      return {
        courierId: courier.courier_company_id ?? null,
        courierName: courier.courier_name || "Shiprocket courier",
        internalCostInr: cost,
        inclGstInr: Number.isFinite(allIn) && allIn >= cost ? allIn : Math.round(cost * 1.18 * 100) / 100,
        estimatedDelivery: courier.etd || courier.estimated_delivery_days || null,
      };
    })
    .filter((rate): rate is ShiprocketRate => rate !== null)
    .sort((a, b) => a.internalCostInr - b.internalCostInr);
}

async function primaryPickupPostcode(token: string): Promise<string> {
  const response = await fetch(`${API_BASE}/settings/company/pickup`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    data?: { shipping_address?: ShiprocketPickup[] };
    shipping_address?: ShiprocketPickup[];
  };
  if (!response.ok) throw new Error(body.message || `Shiprocket pickup lookup failed (${response.status})`);
  const addresses = body.data?.shipping_address ?? body.shipping_address ?? [];
  const primary = addresses.find((address) => address.is_primary_location === 1 || address.is_primary_location === true)
    ?? addresses[0];
  const postcode = String(primary?.pin_code ?? primary?.pincode ?? primary?.postcode ?? "").trim();
  if (!/^[1-9]\d{5}$/.test(postcode)) throw new Error("Shiprocket account has no usable pickup postcode");
  return postcode;
}

type ShiprocketPickup = {
  is_primary_location?: number | boolean;
  pin_code?: string | number;
  pincode?: string | number;
  postcode?: string | number;
};
