import { quotationTotals, type Quotation } from "./model";
import { billedSqFt, GST_RATE } from "@/lib/pricing";
import { installRateExGst, RATE_CARD } from "./rates";
import { fill, requireMaterialSpec } from "./material-specs";

export type QuotationDesign = { handle: string; title: string; surfaceSlug: string; surface: string; rateInclGst: number };
const MATERIAL_KEYS: Record<string, string> = { "smooth-matt": "non-woven", "linen-touch": "linen-textured", "self-adhesive": "self-adhesive", "eco-cotton-canvas": "canvas" };

/** No price is inferred from a surface, picture caption or a model's guess. */
export function priceQuotationDesigns(q: Quotation, designs: QuotationDesign[]): Quotation {
  const lines = q.lines.map((line) => {
    if (!line.productHandle) {
      if (line.material !== "outdoor-wall-film" && !line.commissioned) {
        throw new Error(`Line ${line.seq} (${line.location}): link the exact website design before quoting, or explicitly identify commissioned artwork.`);
      }
      if (line.commissioned && !line.bespokeName?.trim()) throw new Error(`Line ${line.seq}: use the bespoke design name from the presentation.`);
      return { ...line, catalogue: null };
    }
    const matches = designs.filter((d) => d.handle === line.productHandle);
    if (matches.length !== 1) throw new Error(`Line ${line.seq}: ${line.productHandle} needs one available website surface and price.`);
    const d = matches[0];
    if (!(d.rateInclGst > 0)) throw new Error(`No website price for ${d.handle}.`);
    const material = MATERIAL_KEYS[d.surfaceSlug];
    if (!material) throw new Error(`Unsupported quotation surface for ${d.handle}: ${d.surfaceSlug}.`);
    const measured = line.widthMm && line.heightMm
      ? billedSqFt(line.widthMm / 10, line.heightMm / 10)
      : line.sqft;
    return { ...line, material, catalogue: { handle: d.handle, title: d.title, surface: d.surface,
      rateInclGst: d.rateInclGst, billableSqft: Math.max(20, measured) } };
  });
  const rates = [...new Set(lines.map((l) => l.material))].map((material) => {
    const spec = requireMaterialSpec(material);
    // Only noncatalogue outdoor or explicitly commissioned work uses a rate card.
    return { material, supplyExGst: spec.outdoor ? RATE_CARD.outdoorFilmSupplyExGst : RATE_CARD.commissionedExGst, installExGst: q.installationLocal === true ? installRateExGst(spec) : null };
  });
  const materialNotes = rates.map(({ material }) => q.materialNotes.find((n) => n.material === material) ?? { material, text: fill(requireMaterialSpec(material).note, "the specified walls") });
  const result = { ...q, lines, rates, materialNotes, gstRate: GST_RATE };
  quotationTotals(result);
  return result;
}
