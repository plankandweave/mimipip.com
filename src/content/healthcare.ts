import type { SectionSpace } from "@/lib/space-sections";

/**
 * The healthcare section — source of truth for /hospitals and /hospitals/[space].
 *
 * WHO IS BUYING. A hospital's projects or estates head, an architect on a
 * healthcare fit-out, or the administrator of a clinic or diagnostic centre.
 *
 * THE TONE RULE FOR THIS WHOLE SECTION. Every other section sells how a wall
 * LOOKS. This one is read by people at the worst week of their life, and by
 * staff who work fourteen-hour shifts inside it. So the copy stays plain and
 * practical: what the wall does, what it is made of, how it is cleaned. No
 * warmth-of-healing language, no promises about outcomes, and above all NO
 * MEDICAL CLAIMS — we do not say a design reduces anxiety, shortens recovery
 * or improves wayfinding compliance, because we have not measured any of that
 * and a hospital buyer will rightly ask for the study.
 *
 * WHAT WE MUST BE HONEST ABOUT. Healthcare procurement asks questions the
 * other sections do not: reaction-to-fire certification, cleanability against
 * a named disinfectant regime, antimicrobial performance, behaviour in an
 * infection-control audit. We have some of those answers and not others. Every
 * space below says so plainly rather than implying compliance — an
 * overclaim here is not a marketing risk, it is a patient-safety one, and the
 * spec sheet is the only honest place to settle it.
 *
 * Paediatrics is the one space allowed to be cheerful, for the same reason the
 * clubhouse play room is in /real-estate — and with the same restraint about
 * licensed characters, which bring a licence problem and a shelf life.
 *
 * Structurally this is /hospitality: independent collections sharing a hub and
 * a hard renders-only grid, on src/lib/space-sections.ts.
 */

export const HEALTHCARE_SPACES: SectionSpace[] = [];

export function getHealthcareSpace(slug: string): SectionSpace | undefined {
  return HEALTHCARE_SPACES.find((s) => s.slug === slug);
}
