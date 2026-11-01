/** One house hierarchy: Z. upper left, collection/name lower left.
 * Portrait content leaves the lower interaction zone for a real link sticker.
 * Used by the server compositor and local campaign film/Story exports. */
export function socialLayout(w: number, h: number) {
  const portrait = h / w >= 1.6;
  return {
    left: Math.round(w * 0.09),
    logoTop: Math.round(h * (portrait ? 0.14 : 0.042)),
    logoHeight: Math.round(w * 0.046),
    titleFoot: Math.round(h * (portrait ? 0.74 : 0.925)),
    linkTop: Math.round(h * 0.79),
    linkMaxWidth: Math.round(w * 0.31),
    urlTop: Math.round(h * 0.865),
    right: Math.round(w * 0.09),
  };
}

/** Instagram's 4:5 profile preview is the centred 1080×1350 window inside
 * a 1080×1920 cover. Translate every feed coordinate by exactly 285 px. */
export function reelCoverLayout() {
  const feed=socialLayout(1080,1350);
  return {...feed,logoTop:feed.logoTop+285,titleFoot:feed.titleFoot+285,cropTop:285,cropHeight:1350};
}

/** Wrap a string into <=`max` char lines (naive word wrap for SVG tspans). */
export function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max) {
      if (line) lines.push(line.trim());
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line.trim());
  return lines;
}

/** Does a name fit the house title block (two lines of 20 characters, as
 *  lowerThirdSvg sets it)? A longer one is refused at render. */
export const fitsHouseTitle = (title: string): boolean => wrap(title, 20).length <= 2;
