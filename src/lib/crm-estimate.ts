// Preliminary estimates live in existing internal notes, never billing fields.
export const ESTIMATE_HEADING = "PRELIMINARY TICKET ESTIMATE · INR";

export function estimateTemplate(date: string, opportunity = ""): string {
  return `${ESTIMATE_HEADING}
Opportunity: ${opportunity || "[name the inquiry/project]"}
Status: not yet estimated
Area assumptions (sq ft): unknown — confirm scope
Rate assumption (INR/sq ft): unknown — confirm project-specific pricing
Low / base / high (INR): not yet estimated
Source: [reference or supplied recap; identify measurement vs assumption]
Estimate date: ${date}
Confidence: unknown — insufficient scope/pricing basis
Exclusions: GST, installation and site work unless confirmed included
Review needed: confirm area, coverage, rate and inclusions before a material decision
Planning only; no quote, order or client approval.`;
}

export function latestEstimate(notes: readonly { body: string; happened_at: string; id: string }[]): string | null {
  const latest = notes.filter((n) => n.body.includes(ESTIMATE_HEADING))
    .sort((a, b) => b.happened_at.localeCompare(a.happened_at) || b.id.localeCompare(a.id))[0];
  return latest ? latest.body.slice(latest.body.indexOf(ESTIMATE_HEADING)) : null;
}
