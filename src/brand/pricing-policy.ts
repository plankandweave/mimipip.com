/** Mimi Pip commercial policy. Customer-facing INR selling prices include GST.

 * Source: owner's 7 November costing instruction. FX is a review basis,
 * not a live exchange-rate claim. Unknown charges are never treated as zero.
 */
export const MIMIPIP_PRICING = {
  printingInrPerSqFt: 25,
  mediaInrPerSqFt: 30,
  electricityInrPerSqFt: 1,
  sellingInrPerSqFt: 200,
  sellingUsdPerSqFt: 10,
  customWallpaperFreightInrPerShipment: 7500,
  reviewInrPerUsd: 93.905,
  standardWidthFt: 8,
  standardHeightFt: 9,
  gstRate: 0.18 as number | null,
} as const;

export type PricingLine = {
  id: string;
  areaSqFt: number;
  quantity: number;
  route: 'custom-wallpaper' | 'stocked-item';
};
export type StockFulfilment = {
  domesticPostageUsd: number;
  bulkInboundInr: number;
  fulfilmentInr: number;
};
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const valid = (n: number) => Number.isFinite(n) && n >= 0;

export function productionCostPerSqFt(): number {
  return MIMIPIP_PRICING.printingInrPerSqFt + MIMIPIP_PRICING.mediaInrPerSqFt + MIMIPIP_PRICING.electricityInrPerSqFt;
}

/** One shipment quote, so two wallpaper lines do not receive freight twice. */
export function quoteMimiPipOrder(lines: PricingLine[], market: 'IN' | 'US', options: {
  inrPerUsd?: number;
  gstRate?: number | null;
  stockFulfilment?: StockFulfilment;
} = {}) {
  if (!lines.length) throw new Error('A quote needs at least one product.');
  for (const line of lines) {
    if (!line.id || !valid(line.areaSqFt) || line.areaSqFt <= 0 || !Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new Error('A confirmed positive area and whole quantity are required.');
    }
  }
  const totalArea = lines.reduce((sum, line) => sum + line.areaSqFt * line.quantity, 0);
  const wallpaperArea = lines.filter(line => line.route === 'custom-wallpaper').reduce((sum, line) => sum + line.areaSqFt * line.quantity, 0);
  const hasStock = lines.some(line => line.route === 'stocked-item');
  const goodsInr = money(totalArea * MIMIPIP_PRICING.sellingInrPerSqFt);
  const costInr = money(totalArea * productionCostPerSqFt());
  const fx = options.inrPerUsd ?? MIMIPIP_PRICING.reviewInrPerUsd;
  if (!valid(fx) || fx <= 0) throw new Error('A positive currency conversion basis is required.');
  const taxRate = options.gstRate ?? MIMIPIP_PRICING.gstRate;
  if (taxRate !== null && (!valid(taxRate) || taxRate > 1)) throw new Error('Invalid tax rate.');
  const stock = options.stockFulfilment;
  if (stock && !Object.values(stock).every(valid)) throw new Error('Invalid fulfilment costs.');
  const freightInr = market === 'US' && wallpaperArea > 0 ? MIMIPIP_PRICING.customWallpaperFreightInrPerShipment : 0;
  const pending = market === 'US' && hasStock && !stock;
  const stockInr = market === 'US' && hasStock && stock ? stock.domesticPostageUsd * fx + stock.bulkInboundInr + stock.fulfilmentInr : 0;
  // Freight is an internal shipment cost, never an added US wallpaper charge.
  const beforeTax = money(market === 'US'
    ? wallpaperArea * MIMIPIP_PRICING.sellingUsdPerSqFt + ((totalArea - wallpaperArea) * MIMIPIP_PRICING.sellingInrPerSqFt + stockInr) / fx
    : goodsInr);
  const tax = market === 'IN' && taxRate !== null ? money(beforeTax - beforeTax / (1 + taxRate)) : null;
  return {
    currency: market === 'IN' ? 'INR' as const : 'USD' as const,
    goodsInr, costInr, totalAreaSqFt: totalArea,
    freightInr,
    freightInrPerWallpaperSqFt: wallpaperArea > 0 ? freightInr / wallpaperArea : 0,
    beforeTax: pending ? null : market === 'IN' && tax !== null ? money(beforeTax - tax) : beforeTax,
    tax,
    total: !pending && tax !== null ? beforeTax : null,
    status: pending ? 'fulfilment-required' as const : 'before-tax-estimate' as const,
  };
}
