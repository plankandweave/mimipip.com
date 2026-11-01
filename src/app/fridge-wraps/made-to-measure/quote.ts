"use server";

import {
  MADE_TO_MEASURE_CODE,
  WRAP_MTM_RATE,
  WRAP_MTM_FLOOR,
  WRAP_MTM_LEAD_DAYS,
  areMeasurementsValid,
  madeToMeasureAreaSqFt,
  madeToMeasurePanels,
  madeToMeasurePrice,
} from "@/lib/wraps";
import { getWrapFormat } from "@/lib/wrap-queries";
import { normaliseMeasurements, type FridgeQuote, type QuotePanelInput } from "../_lib/mtm";

/**
 * Price a made-to-measure (Format Z) panel set — on the server, always.
 *
 * The browser never computes this number. The cart pins a fridge line's price
 * server-side, and a quote the customer read off a client-side multiplication
 * that disagreed with the pinned figure by a rupee would surface to them as a
 * bug at the one moment they are deciding to pay. So both sides go through the
 * same function on the same inputs:
 *
 *   price = madeToMeasurePrice(normaliseMeasurements(input))
 *
 * Called with NO rate argument on purpose. `madeToMeasurePrice` defaults to
 * WRAP_MTM_RATE; passing a rate read from somewhere else here would make this
 * a second place the made-to-measure rate is decided, which is precisely how
 * the two sides drift apart.
 *
 * The response echoes the normalised measurements. Whatever adds this set to
 * the cart must send those back verbatim — the price belongs to them, not to
 * the raw strings that were typed.
 */
export async function quoteMadeToMeasure(panels: QuotePanelInput[]): Promise<FridgeQuote> {
  const measurements = normaliseMeasurements(panels ?? []);
  if (!areMeasurementsValid(measurements)) return { ok: false, reason: "invalid" };

  const format = await getWrapFormat(MADE_TO_MEASURE_CODE);
  // Format Z is a row like any other and can be deactivated. If it is gone,
  // say so rather than quote a price for something that cannot be ordered.
  if (!format || !format.isMadeToMeasure) return { ok: false, reason: "unavailable" };

  const price = madeToMeasurePrice(measurements);
  const areaSqFt = madeToMeasureAreaSqFt(measurements);

  return {
    ok: true,
    measurements,
    price,
    areaSqFt,
    cutList: madeToMeasurePanels(measurements),
    ratePerSqFt: WRAP_MTM_RATE,
    floorApplied: areaSqFt * WRAP_MTM_RATE < WRAP_MTM_FLOOR,
    leadTimeDays: format.leadTimeDays ?? WRAP_MTM_LEAD_DAYS,
    formatCode: format.code,
    formatLabel: format.label,
  };
}
