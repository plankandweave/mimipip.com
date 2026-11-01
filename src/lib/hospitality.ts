import { HOSPITALITY_SPACES } from "@/content/hospitality";
import {
  estimatorRates,
  getSectionFinishes,
  getSectionTiles,
  getSpaceEdit,
  type SectionFinish,
  type SpaceEdit,
} from "./space-sections";

/**
 * Hospitality's catalogue layer, now a thin delegation.
 *
 * The query, the tiles and the finishes lookup were duplicated here, in
 * real-estate.ts and — as retail and healthcare arrived — about to be
 * duplicated twice more. This file's own comment predicted the moment: "If a
 * third section ever needs this, that is the moment to lift it." It has been
 * lifted to src/lib/space-sections.ts; these exports stay so the pages and any
 * bookmark of this module keep working.
 */
export type { SpaceEdit };
export type HospitalityFinish = SectionFinish;
export { getSpaceEdit };

export const getHospitalityTiles = () => getSectionTiles(HOSPITALITY_SPACES);
export const getHospitalityFinishes = getSectionFinishes;
export const hospitalityEstimatorRates = estimatorRates;
