import { BESPOKE_PRICE } from "./pricing";

/** Flat design work is never included in the wallpaper's AID discount. */
export function proposalCheckoutPrice(wallpaperTotal: number, gstPct: number, customisation: boolean) {
  if (!Number.isFinite(wallpaperTotal) || wallpaperTotal <= 0 || !Number.isFinite(gstPct) || gstPct < 0)
    throw new Error("Invalid proposal price");
  const wallpaper = Math.round(wallpaperTotal);
  const service = customisation ? BESPOKE_PRICE : 0;
  const total = wallpaper + service;
  const amount = Math.round(total / (1 + gstPct / 100) * 100) / 100;
  const gstAmount = Math.round((total - amount) * 100) / 100;
  return { wallpaper, customisation: service, total, amount, gstAmount,
    rounding: Math.round((wallpaper - wallpaperTotal) * 100) / 100 };
}
