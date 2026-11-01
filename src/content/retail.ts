import type { SectionSpace } from "@/lib/space-sections";

/**
 * The retail section — source of truth for /retail and /retail/[space].
 *
 * WHO IS BUYING. A store owner, a retail chain's projects team, or the fit-out
 * contractor working to their drawings. The distinguishing fact about this
 * buyer is ROLLOUT: a decision made for one store is very often made for
 * fourteen, on a programme, with a fixed shopfitting budget per square foot and
 * a shutdown window measured in nights rather than weeks.
 *
 * WHAT MAKES THE BRIEF DIFFERENT FROM EVERY OTHER SECTION. In an office or a
 * lobby the wall is the thing being looked at. In a shop it is competing with
 * the merchandise, and losing on purpose is the correct outcome. A retail wall
 * has one job — make the product in front of it look better — and a design
 * that photographs beautifully with nothing in front of it can still be the
 * wrong answer once the rail is hung. So the edits here lean on backdrop
 * qualities: depth without detail at eye level, no hard verticals to fight a
 * rail, nothing that competes for colour with stock that changes four times a
 * year.
 *
 * The exception is the fitting room, which is the one wall in a shop that is
 * looked at directly, alone, in an unflattering mirror, at the exact moment a
 * customer decides whether to buy. It gets its own space for that reason.
 *
 * Structurally this is /hospitality: independent collections sharing a hub and
 * a hard renders-only grid, on the shared machinery in src/lib/space-sections.ts.
 */

export const RETAIL_SPACES: SectionSpace[] = [];

export function getRetailSpace(slug: string): SectionSpace | undefined {
  return RETAIL_SPACES.find((s) => s.slug === slug);
}
