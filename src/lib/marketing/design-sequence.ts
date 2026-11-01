// One wallpaper per format across the saved calendar, including ideas and
// previously published entries. Asset URLs, titles and dates are not identity.
import { handleFromProductUrl } from "./idea-source";

export type DesignSlot = {
  id?: string; day_key: string; seq: number; channel: string; kind: string;
  status: string; handle?: string | null; art?: Record<string, unknown> | null;
  published?: boolean;
};
export type DesignViolation = { slot: string; with: string; design: string; reason: string };
export const designSlotKey = (s: DesignSlot) => s.id ?? `${s.day_key}#${s.seq}`;
const clean = (v: unknown) => typeof v === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(v.trim()) ? v.trim().toLowerCase() : null;
export function designHandles(s: Pick<DesignSlot, "handle" | "art">): string[] {
  const a = s.art ?? {};
  const handles = [s.handle, a.story_design_handle, handleFromProductUrl(a.product_url), handleFromProductUrl(a.story_link_url),
    ...(Array.isArray(a.design_handles) ? a.design_handles : [])].map(clean).filter((v): v is string => !!v);
  // Legacy finished frames record the original catalogue image, not a handle.
  if (!handles.length && typeof a.source_image === "string") {
    const match = a.source_image.match(/\/product-images\/(?:[^/]+\/)?([^/]+)\/[^/?]+(?:\?.*)?$/);
    const h = clean(match?.[1]); if (h) handles.push(h);
  }
  return [...new Set(handles)];
}
export function designSequenceViolations(rows: DesignSlot[]): DesignViolation[] {
  const first = new Map<string, DesignSlot>();
  const out: DesignViolation[] = [];
  const seq = rows.filter(s => s.channel === "instagram" && ["feed", "carousel", "story", "reel"].includes(s.kind)
    && (s.published || (s.status !== "removed" && s.art?.selected !== false)))
    // Published history wins even if a newly imported slot has an earlier date.
    .sort((a,b) => Number(!!b.published)-Number(!!a.published) || a.day_key.localeCompare(b.day_key) || a.seq-b.seq || designSlotKey(a).localeCompare(designSlotKey(b)));
  for (const s of seq) {
    const format = s.kind === "carousel" ? "feed" : s.kind;
    for (const design of designHandles(s)) {
      const key = `${format}:${design}`;
      const previous = first.get(key);
      if (previous && designSlotKey(previous) !== designSlotKey(s)) out.push({slot:designSlotKey(s),with:designSlotKey(previous),design,
        reason:`${s.day_key} ${format} repeats ${design}, already assigned to ${previous.day_key} #${previous.seq}. One wallpaper appears once per format; a different room image or film file does not make a different design.`});
      else first.set(key,s);
    }
  }
  return out;
}
export function assertDesignSequence(rows: DesignSlot[], touched: Set<string>): void {
  const errors = designSequenceViolations(rows).filter(v => touched.has(v.slot) || touched.has(v.with));
  if (errors.length) throw new Error(errors.map(v=>v.reason).join(" · "));
}
