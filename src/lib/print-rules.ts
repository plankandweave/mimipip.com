import "server-only";
import { MAX_PANEL_CM, PANEL_OVERLAP_CM } from "./visualizer";

/**
 * Live production panel geometry, read from the MGI OS — the single authority
 * for how the Mimaki actually splits a wall into printed strips (rules
 * `zyvorah.print.max_panel_mm` / `zyvorah.print.overlap_mm`).
 *
 * Every customer-facing panel plan (configurator card, order-proof PDF,
 * order-copy PDF) derives from THESE values, so when production changes a rule
 * on the OS it reaches the storefront within one cache window — no website
 * deploy, no constant to remember to update. The constants in visualizer.ts
 * are only the offline fallback for when the OS can't be reached.
 */

const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

export type PrintRules = {
  /** Max PRINTED strip width (content + both overlaps), cm. */
  maxPanelCm: number;
  /** Printed pattern-match overlap on each strip edge, cm. */
  overlapCm: number;
  /** True when the values came from the OS (false = offline fallback). */
  live: boolean;
};

export const FALLBACK_RULES: PrintRules = {
  maxPanelCm: MAX_PANEL_CM,
  overlapCm: PANEL_OVERLAP_CM,
  live: false,
};

/** Never throws; falls back to the baked-in mirror of the current rules. */
export async function fetchPrintRules(): Promise<PrintRules> {
  try {
    const r = await fetch(`${OS_BASE}/api/zyvorah/print-rules`, {
      // Data-cache the answer for 5 minutes: rule edits are rare and a stale
      // window this short is invisible, while product pages stay fast.
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return FALLBACK_RULES;
    const j = (await r.json()) as { ok?: boolean; maxPanelMm?: number; overlapMm?: number };
    const maxPanelMm = Number(j?.maxPanelMm);
    const overlapMm = Number(j?.overlapMm);
    // Sanity bounds: a rule fat-fingered to 0 (or 13000) must not turn every
    // wall into one panel / a hundred slivers on the storefront.
    if (!j?.ok || !(maxPanelMm >= 300 && maxPanelMm <= 3000)) return FALLBACK_RULES;
    return {
      maxPanelCm: maxPanelMm / 10,
      overlapCm: overlapMm >= 0 && overlapMm <= 100 ? overlapMm / 10 : PANEL_OVERLAP_CM,
      live: true,
    };
  } catch {
    return FALLBACK_RULES;
  }
}
