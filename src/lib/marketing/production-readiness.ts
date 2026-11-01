/** A review card is not a production brief. These holds apply before rendering,
 * approval and publishing, including posts composed before a hold was added. */
export type ProductionSlot = {
  title?: string | null;
  kind?: string | null;
  status?: string | null;
  art?: Record<string, unknown> | null;
};

export function productionHold(slot: ProductionSlot): string | null {
  const art = slot.art ?? {};
  if (slot.status === "removed") return "This plan item was removed.";
  const holdReason = typeof art.hold_reason === "string" ? art.hold_reason : "Production is on hold.";
  // A planned Story whose only hold says that its final portrait must be
  // produced must remain composable: composing is the action that creates
  // that portrait and its measured receipt.
  if (art.production_hold === true && !(slot.kind === "story" && /final portrait source-faithful Story export required/i.test(holdReason))) {
    return holdReason;
  }
  const blockers = Array.isArray(art.blockers) ? art.blockers.filter((b): b is string =>
    typeof b === "string" && !!b.trim() &&
      !/link sticker|automatic Story publishing remains held/i.test(b) &&
      !(slot.kind === "story" && /final.*(?:portrait|source-faithful).*export.*(?:missing|required)/i.test(b))
  ) : [];
  if (blockers.length) return `Production incomplete: ${blockers.join("; ")}`;
  if (/\b(?:publication verification|reel\s*[—–-]\s*publication|record only)\b/i.test(slot.title ?? "")) {
    return "An internal tracking title cannot be used as creative text. Supply the finished creative and its public title.";
  }
  if (slot.kind === "reel") {
    if (art.source_audio_present === false || (art.audio_required === true && art.audio_verified !== true)) {
      return "The narrated Reel is missing verified audio. Supply the finished picture-and-sound master.";
    }
    if (typeof art.local_source === "string" && !art.video_url && !art.library_id) {
      return "The Reel references a local file only. Attach its finished video; a poster cannot replace it.";
    }
  }
  return null;
}
