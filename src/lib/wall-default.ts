import { MIMIPIP_PRICING } from '@/brand/pricing-policy';
/** MimiPip's standard preview wall. Explicit customer dimensions take priority. */
export const DEFAULT_WALL_FT = MIMIPIP_PRICING.standardWidthFt;
export const DEFAULT_WALL_HEIGHT_FT = MIMIPIP_PRICING.standardHeightFt;
export type WallStart = { w: number; h: number };
export function initialWallFt(startReady: [number, number] | null | undefined, initialWidthFt?: number, initialHeightFt?: number): WallStart {
  if (startReady) return { w: startReady[0] / 12, h: startReady[1] / 12 };
  return {
    w: initialWidthFt && initialWidthFt > 0 ? initialWidthFt : DEFAULT_WALL_FT,
    h: initialHeightFt && initialHeightFt > 0 ? initialHeightFt : DEFAULT_WALL_HEIGHT_FT,
  };
}
