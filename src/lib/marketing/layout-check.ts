import { R2_DOMAIN_BASE } from "../media-url";
/** A measured export receipt, never a hand-ticked approval checklist. */
export const LAYOUT_VERSION = "social-layout-v2";
export type Rect = { x: number; y: number; width: number; height: number };
export type LayoutFrame = {
  surface: "feed" | "reel-cover" | "portrait";
  width: number; height: number;
  logo: Rect; text: Rect; textLeft: number; titleFoot: number;
  fonts: boolean; solidText: boolean;
};
export type LayoutAsset = { url: string; sha256: string; frames: LayoutFrame[] };
export type LayoutReceipt = { version: string; assets: LayoutAsset[] };
export type LayoutCheck = { label: string; ok: boolean; detail: string };
const near = (a: number, b: number, tolerance = 2) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;
const rect = (r: Rect) => r && [r.x,r.y,r.width,r.height].every(Number.isFinite) && r.width > 0 && r.height > 0;

/** Independent acceptance limits in export pixels. The portrait playback area
 * is deliberately separate from the profile crop; a video frame is no cover. */
export function frameChecks(f: LayoutFrame): LayoutCheck[] {
  const cover = f.surface === "reel-cover", portrait = f.surface === "portrait";
  const offset = cover ? 285 : 0;
  const top = portrait ? 269 : 57 + offset, foot = portrait ? 1421 : 1249 + offset;
  const valid = rect(f.logo) && rect(f.text);
  return [
    {label:"Logo in place",ok:!!valid && near(f.logo.x,98) && near(f.logo.y,top) && near(f.logo.height,50) && near(f.logo.width,38),detail:`Z. ink x=98, y=${top}, 38×50 px (±2 px); 41 px SVG box`},
    {label:"Bottom in place",ok:near(f.titleFoot,foot,1),detail:`Footer baseline y=${foot} px (±1 px)`},
    {label:"Placement",ok:f.width===1080 && f.height===(f.surface==="feed"?1350:1920) && ["feed","reel-cover","portrait"].includes(f.surface) && f.fonts===true && f.solidText===true,detail:`1080×${f.surface==="feed"?1350:1920}; canonical fonts; solid text`},
    {label:"Left side",ok:!!valid && near(f.textLeft,97,1) && f.text.x>=94,detail:"Text anchor x=97 px; glyph overhang ≤3 px"},
    {label:"Right side",ok:!!valid && f.text.x+f.text.width<=984 && f.logo.x+f.logo.width<=984,detail:"All lettering inside x=983 px (1 px raster tolerance)"},
    {label:"Margin",ok:!!valid && f.logo.y>=offset+54 && f.text.y>f.logo.y+f.logo.height+40 && f.text.y+f.text.height<=foot+10 && f.text.y+f.text.height< (portrait?1517:offset+1350-80),detail:portrait?"Title clears native sticker zone y=1517; no overlap":"4:5 crop: all branding inside 97 px side / ≥80 px bottom margins"},
  ];
}
export function requiresLayoutCheck(art?: Record<string,unknown>|null) {
  return typeof art?.brand_layout === "string" || art?.owner_scope === "ahimsa-five-day-20261003";
}
export function layoutReceipt(art?: Record<string,unknown>|null): LayoutReceipt | null {
  const r=art?.layout_receipt as LayoutReceipt|undefined;
  return r?.version===LAYOUT_VERSION && Array.isArray(r.assets) ? r : null;
}
export function layoutChecks(art?: Record<string,unknown>|null): LayoutCheck[] {
  const r=layoutReceipt(art);
  if(!r?.assets.length) return ["Logo in place","Bottom in place","Placement","Left side","Right side","Margin"].map(label=>({label,ok:false,detail:"Measured export receipt missing or out of date"}));
  try {
    const frames=r.assets.flatMap(a=>a.frames);
    if(!frames.length || r.assets.some(a=>!Array.isArray(a.frames)||!a.frames.length)) throw Error("missing frames");
    return frameChecks(frames[0]).map((c,i)=>({...c,ok:frames.every(f=>frameChecks(f)[i].ok),detail:`${frames.length} measured frames · ${c.detail}`}));
  } catch { return [{label:"Placement",ok:false,detail:"Invalid measurement receipt"}]; }
}
export function layoutHold(art: Record<string,unknown>|null|undefined, media?: string[]|null, cover?:string|null, required=false): string|null {
  if(!required && !requiresLayoutCheck(art)) return null;
  const checks=layoutChecks(art), failed=checks.filter(c=>!c.ok);
  if(failed.length) return `Layout check failed: ${failed.map(c=>c.label).join(", ")}. Re-export and measure before release.`;
  const receipt=layoutReceipt(art)!;
  if(receipt.assets.some(a=>!a.url.startsWith(`${R2_DOMAIN_BASE}/`)||!/^[a-f0-9]{64}$/.test(a.sha256))) return "Layout receipt lacks an immutable media fingerprint.";
  const expected=media ?? (typeof art?.video_url==="string"?[art.video_url]:[]);
  if(expected.some(url=>!receipt.assets.some(a=>a.url===url))) return "Layout receipt does not cover every exact media file.";
  const video=expected.some(u=>/\.mp4(?:\?|$)/.test(u));
  if(video){
    const url=cover ?? art?.reel_cover_url;
    if(typeof url!=="string" || !receipt.assets.some(a=>a.url===url && a.frames.some(f=>f.surface==="reel-cover"))) return "Reel needs its measured profile cover; a video-frame thumbnail cannot pass.";
  }
  return null;
}
