// Anonymous taste learning ("the Pinterest effect"): every visitor gets a
// decayed running average of the CLIP embeddings of the designs they engage
// with, and the storefront quietly proposes designs near that vector — new
// ones, never what they've already engaged (the profile's `seen` list), with a
// slice of exploration so the feed widens taste instead of narrowing it.

export const TASTE_COOKIE = "zyv_taste";

// Signal weights — stronger commitment moves the taste vector further.
export const TASTE_WEIGHTS: Record<string, number> = {
  view: 1, // opened a product page
  visualize: 3, // placed it on their own room photo
  save: 4, // wishlist / board
  sample: 6, // paid for a design sample
  cart: 8, // added to cart
};

// Funnel-only signals: recorded in site_events, never blended into the taste
// vector. They say something about OUR shop (we invited someone to keep their
// list; they gave us an address) rather than about the design they happened to
// be looking at, so weighting a design by them would teach the model noise.
// They also carry no handle requirement — the invitation is about a list.
export const LOG_ONLY_EVENTS = new Set(["save_prompt", "save_identify"]);

// How much the previous taste persists per event. High enough that one stray
// click doesn't hijack the profile; low enough that taste can drift.
const DECAY = 0.85;

export function parseVec(text: string): number[] {
  return text.replace(/^\[|\]$/g, "").split(",").map(Number);
}

export function toVecLiteral(v: number[]): string {
  return `[${v.map((n) => Number.isFinite(n) ? n.toFixed(6) : "0").join(",")}]`;
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (!norm) return v;
  return v.map((x) => x / norm);
}

/** taste' = normalize(DECAY·taste + (w/maxW)·product) — both unit vectors. */
export function blendTaste(prev: number[] | null, product: number[], weight: number): number[] {
  const w = Math.min(1, weight / 8);
  const p = normalize(product);
  if (!prev || prev.length !== p.length) return p;
  return normalize(prev.map((x, i) => DECAY * x + w * p[i]));
}

/**
 * Final pick: mostly the closest matches, plus a slice sampled from further
 * down the ranking so the feed explores adjacent taste instead of collapsing
 * into the same handful of designs. Deterministic-ish shuffle not needed —
 * ranked pool in, mixed list out.
 */
export function mixWithExploration(rankedHandles: string[], count: number): string[] {
  const exploit = Math.ceil(count * 0.75);
  const head = rankedHandles.slice(0, exploit);
  const tail = rankedHandles.slice(exploit, exploit + 30);
  // sample the remainder from the tail
  const picks: string[] = [...head];
  const pool = [...tail];
  while (picks.length < count && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(i, 1)[0]);
  }
  return picks.slice(0, count);
}
