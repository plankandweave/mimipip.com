// The plate grounds. Named, not derived: a tint slider is how a palette drifts.
// Kept apart from plate.ts so the Workers app can read a mat without pulling in
// sharp (plate.ts draws; this only knows colours).

export type Mat = { ground: string; ink: string; rule: string };

/** The campaign's mats (rose / teal / brass from the brief) and one ground per
 *  collection so a word plate sits in the family of the arc it closes. */
export const MATS: Record<string, Mat> = {
  rose: { ground: "#C9807E", ink: "#FAFAF7", rule: "#F3D6D2" },
  teal: { ground: "#2F6B6A", ink: "#FAFAF7", rule: "#A9D1CF" },
  brass: { ground: "#B08A3E", ink: "#0F0F0F", rule: "#F3E3B8" },
  indigo: { ground: "#1F2A5C", ink: "#FAFAF7", rule: "#9DB0CC" },
  card: { ground: "#8B1A1A", ink: "#FAFAF7", rule: "#E8B4A8" },
  saffron: { ground: "#C9791D", ink: "#0F0F0F", rule: "#F6E1B8" },
  umber: { ground: "#5C3A21", ink: "#FAFAF7", rule: "#D9B99A" },
  forest: { ground: "#1B4D3E", ink: "#FAFAF7", rule: "#A8E6CF" },
  ink: { ground: "#0F0F0F", ink: "#FAFAF7", rule: "#525252" },
};

export const MAT_BY_COLLECTION: Record<string, string> = {
  Katha: "indigo",
  "Stallion Spirit": "umber",
  TAASH: "card",
  Dwadasha: "saffron",
  "Maharaja's Court": "forest",
};

export function matFor(name: string | undefined | null): Mat {
  const m = name ?? "ink";
  if (MATS[m]) return MATS[m];
  if (/^#[0-9a-f]{6}$/i.test(m)) return { ground: m, ink: "#FAFAF7", rule: "#FAFAF7" };
  return MATS.ink;
}

/** "Mayur (मयूर)" → "Mayur": the English name alone, for a plate that sets
 *  the Devanagari on its own line. */
export function englishName(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
