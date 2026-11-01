import { NextResponse } from "next/server";
import {
  WALLPAPER_PACKAGE,
  chargeableWeightKg,
  internationalDeliveryUsd,
  marketFor,
  normalizeCountryCode,
  volumetricWeightKg,
} from "@/lib/markets";
import { getShiprocketDomesticRates, shiprocketConfigured } from "@/lib/shiprocket";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const countryCode = normalizeCountryCode(body?.countryCode) ?? "IN";
  const market = marketFor(countryCode);
  const areaSqFt = Math.max(0, Math.min(10000, Number(body?.areaSqFt) || 0));
  const tubeCount = Math.max(1, Math.min(100, Math.ceil(Number(body?.tubeCount) || 1)));
  const weight = chargeableWeightKg(areaSqFt, tubeCount);
  const packageInfo = {
    lengthMm: WALLPAPER_PACKAGE.lengthMm,
    diameterMm: WALLPAPER_PACKAGE.diameterMm,
    tubeCount,
    volumetricWeightKg: volumetricWeightKg(tubeCount),
    chargeableWeightKg: weight,
  };

  if (countryCode !== "IN") {
    return NextResponse.json({
      countryCode,
      currency: "USD",
      customerCharge: internationalDeliveryUsd(countryCode, areaSqFt, tubeCount),
      shippingIncluded: true,
      customsIncluded: false,
      verifiedWithShiprocket: false,
      basis: "regional international allowance; final courier is selected at dispatch",
      package: packageInfo,
    });
  }

  const postcode = typeof body?.deliveryPostcode === "string" ? body.deliveryPostcode.trim() : "";
  if (!/^[1-9]\d{5}$/.test(postcode)) {
    return NextResponse.json({ error: "invalid_delivery_postcode", package: packageInfo }, { status: 400 });
  }
  if (!shiprocketConfigured()) {
    return NextResponse.json({
      countryCode,
      currency: market.currency,
      customerCharge: 0,
      shippingIncluded: true,
      verifiedWithShiprocket: false,
      configured: false,
      package: packageInfo,
    });
  }

  try {
    const rates = await getShiprocketDomesticRates({
      deliveryPostcode: postcode,
      chargeableWeightKg: weight,
      declaredValueInr: Number(body?.declaredValueInr) || undefined,
    });
    return NextResponse.json({
      countryCode,
      currency: "INR",
      customerCharge: 0,
      shippingIncluded: true,
      verifiedWithShiprocket: true,
      configured: true,
      package: packageInfo,
      cheapestInternalRate: rates[0] ?? null,
      rates,
    });
  } catch (error) {
    console.error("Shiprocket rate lookup failed:", error);
    return NextResponse.json({
      countryCode,
      currency: "INR",
      customerCharge: 0,
      shippingIncluded: true,
      verifiedWithShiprocket: false,
      configured: true,
      error: "shiprocket_unavailable",
      package: packageInfo,
    }, { status: 502 });
  }
}
