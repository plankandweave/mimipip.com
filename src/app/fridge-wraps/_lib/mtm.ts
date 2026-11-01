import { MAX_MTM_PANELS, type FridgeMeasurements, type WrapPanel } from "@/lib/wraps";

/**
 * The made-to-measure quote contract, shared by the intake form and the server
 * action that prices it.
 *
 * Types live here rather than in the `"use server"` module so that module can
 * export exactly one thing — an async function — and the client can import the
 * shapes without pulling a server action into its bundle.
 *
 * These keep their Fridge names through the family-wide rename to Wrap*, and
 * that is the point rather than an oversight: sized to your wall is fridge-only
 * (ApplianceConfig.supportsMadeToMeasure), so a `WrapQuote` would advertise a
 * generality the desk cannot quote and the measuring guide does not cover.
 */

export type QuotePanelInput = { widthCm: number; heightCm: number };

export type FridgeQuote =
  | {
      ok: true;
      /** The NORMALISED measurements the price was computed from. Anything
       *  adding this set to the cart must pin against these numbers, not the
       *  raw strings the customer typed — they are what the price means. */
      measurements: FridgeMeasurements;
      /** GST-inclusive, whole rupees. */
      price: number;
      /** The customer's own measured area, before trim allowance. */
      areaSqFt: number;
      /** What actually gets cut: each panel plus its trim allowance. */
      cutList: WrapPanel[];
      ratePerSqFt: number;
      /** True when the measured area came to less than the order floor. */
      floorApplied: boolean;
      leadTimeDays: number;
      formatCode: string;
      formatLabel: string;
    }
  | { ok: false; reason: "invalid" | "unavailable" };

/**
 * Raw form input → the measurements a price may be computed from.
 *
 * Rounds to a tenth of a centimetre, because that is the finest reading anyone
 * takes off a tape against a fridge door and an unrounded float would make the
 * quoted price impossible to reproduce from the numbers on screen. Blank rows
 * are dropped rather than treated as zero, so a half-filled form is "not yet
 * priceable" instead of "priced wrong".
 */
export function normaliseMeasurements(panels: QuotePanelInput[]): FridgeMeasurements {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    panels: panels
      .filter((p) => Number.isFinite(p.widthCm) && Number.isFinite(p.heightCm) && p.widthCm > 0 && p.heightCm > 0)
      .slice(0, MAX_MTM_PANELS)
      .map((p) => ({ widthCm: round1(p.widthCm), heightCm: round1(p.heightCm) })),
  };
}
