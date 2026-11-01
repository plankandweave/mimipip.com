import { REAL_ESTATE_SPACES } from "@/content/real-estate";
import {
  estimatorRates,
  getSectionFinishes,
  getSectionTiles,
  getSpaceEdit,
  type SectionFinish,
  type SpaceEdit,
} from "./space-sections";

/** Real estate's catalogue layer — see the note in hospitality.ts. */
export type { SpaceEdit };
export type RealEstateFinish = SectionFinish;
export { getSpaceEdit };

export const getRealEstateTiles = () => getSectionTiles(REAL_ESTATE_SPACES);
export const getRealEstateFinishes = getSectionFinishes;
export const realEstateEstimatorRates = estimatorRates;
