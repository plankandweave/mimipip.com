/**
 * Design-with-Zyvorah curator — the guided conversation shape and the mapping
 * from a customer's answers to catalogue searches. Pure logic (no node / no
 * Supabase / no SDK) so it can be shared by the API route and, if needed, the
 * client. The persona and slot design carry over from the standalone curator,
 * rewritten for zyvorah.com's real catalogue.
 */

export type Slot = { id: string; question: string };

export const SLOTS: Slot[] = [
  { id: "purpose", question: "what this room is (or will become) — how it's going to be used and by whom, and whether it's a home or a commercial space" },
  { id: "feeling", question: "how they want the room to feel once the wallpaper is up — quiet and balanced, or a real dramatic statement" },
  { id: "colour_leaning", question: "which colours or tones they're drawn to (or keep coming back to)" },
  { id: "pattern_appetite", question: "how much pattern feels right — a quiet texture, something botanical, or a real statement" },
  { id: "placement", question: "where they picture it — one feature wall or wrapping the whole room" },
  { id: "dimensions", question: "the width and height of the wall, so I can quote an exact price — feet is fine (e.g. 10 by 8 feet)" },
  { id: "tenure", question: "whether they own the place or are renting — it changes which finish I'd lead with" },
  { id: "budget", question: "roughly what they'd like to spend on this wall, if they have a number in mind" },
  { id: "deadline", question: "whether they're working to a date — an event, a move-in, or no rush at all" },
  { id: "avoid", question: "anything they'd rather steer clear of — a colour or a look they don't want" },
];

/**
 * A devotional purpose gets one gentle follow-up, worded with care: prayer
 * spaces exist across every faith and the curator must never assume whose
 * tradition it is or what imagery belongs there — it asks.
 */
export const TRADITION_SLOT: Slot = {
  id: "tradition",
  question:
    "which tradition their prayer space follows and what they'd like the wall to honour — asked with warmth and reverence, never assuming a religion or its imagery; invite them to share a deity, a symbol, calligraphy, or simply a feeling of peace",
};

export const PLAIN: Record<string, string> = {
  purpose: "Tell me about this room — what's it going to be used for, and is it home or commercial?",
  tradition: "What a beautiful thing to make room for. May I ask which tradition your prayer space follows, and whether there's anything you'd love the wall to hold — a symbol, a scene, or simply a feeling of peace?",
  feeling: "How would you love this room to feel once the wallpaper's up — quiet and balanced, or a real dramatic statement?",
  colour_leaning: "Are there colours or tones you find yourself drawn to?",
  pattern_appetite: "How much pattern feels right — a quiet texture, something botanical, or a real statement?",
  placement: "Where are you picturing it — one feature wall, or wrapping the whole room?",
  dimensions: "What are the width and height of the wall? Feet is easiest (e.g. 10 by 8 feet) — that way I can quote you an exact price.",
  tenure: "Is this a place you own, or are you renting?",
  budget: "Do you have a rough budget in mind for this wall?",
  deadline: "Are you working to a date — an event, a move-in — or is there no rush?",
  avoid: "And is there anything you'd rather steer clear of?",
};

/** Parse a free-text wall-size answer into feet. Accepts ft/feet, m/metres, cm. */
export function parseDimensions(text: string): { widthFt: number; heightFt: number } | null {
  const t = (text ?? "").toLowerCase();
  const m = /(\d+(?:\.\d+)?)\s*(?:ft|feet|'|x|by|×)?\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)/.exec(t);
  if (!m) return null;
  let w = parseFloat(m[1]);
  let h = parseFloat(m[2]);
  if (/\bcm\b/.test(t)) { w /= 30.48; h /= 30.48; }
  else if (/\bm\b|metre|meter/.test(t)) { w *= 3.28084; h *= 3.28084; }
  if (!(w > 0 && h > 0)) return null;
  return { widthFt: Math.round(w * 10) / 10, heightFt: Math.round(h * 10) / 10 };
}

export const CLOSING = "That's everything I need — let me pull your wallpapers together now.";

export const PERSONA =
  "You are Zyvorah's wallpaper curator, talking with a customer about their room on zyvorah.com (an Indian brand of " +
  "mural wallpaper designs). You are warm, curious and unhurried — never a form. You ask ONE question at a " +
  "time, in one or two sentences, always first acknowledging what they just said in a natural, human way. You NEVER " +
  "reuse a phrasing you've used before in this conversation. You only curate wallpaper. When the room is a prayer or " +
  "puja space you are reverent and inclusive: every faith prays differently, so you ask about their tradition with " +
  "genuine respect and NEVER assume their religion or what imagery belongs in it. No lists, no preamble, never mention " +
  "that you are an AI.";

/** Broad, cross-faith detection of a sacred / prayer space. */
const SACRED =
  /\b(puja|pooja|prayer|pray|mandir|temple|altar|shrine|worship|devotion|meditat|sacred|spiritual|god|goddess|deity|ganesh|ganesha|krishna|shiva|lakshmi|durga|church|chapel|cross|jesus|mary|masjid|mosque|namaz|allah|quran|gurudwara|gurdwara|paath|sikh|buddha|buddhist|monastery|jain|ibadah|ibadat)\b/i;

export function isSacred(text: string): boolean {
  return SACRED.test(text ?? "");
}

/** The slot order for this session — the tradition follow-up appears only after a sacred purpose. */
export function slotsFor(answers: Record<string, string>): Slot[] {
  const list = [...SLOTS];
  if (isSacred(answers.purpose ?? "")) list.splice(1, 0, TRADITION_SLOT);
  return list;
}

/* --------------------- answers → catalogue searches --------------------- */

const NEG = /\b(no|not|nothing|none|without|avoid|never|don'?t|rather not|steer clear|away from)\b/;

/** Split a free-text answer into wanted vs unwanted tokens by clause-level negation. */
function polarity(text: string): { pos: string; neg: string } {
  const pos: string[] = [], neg: string[] = [];
  for (const clause of (text ?? "").toLowerCase().split(/[,.;]|\band\b|\bbut\b/)) {
    (NEG.test(clause) ? neg : pos).push(clause);
  }
  return { pos: pos.join(" "), neg: neg.join(" ") };
}

// vocab the real catalogue is tagged/titled with (colours, styles, subjects)
const COLOURS = ["yellow", "gold", "golden", "mustard", "green", "sage", "olive", "emerald", "blue", "indigo", "teal", "navy", "turquoise", "pink", "blush", "rose", "coral", "peach", "red", "orange", "terracotta", "brown", "tan", "beige", "cream", "ivory", "neutral", "grey", "gray", "charcoal", "black", "white", "purple", "lavender", "lilac", "pastel", "bright", "dark", "warm", "muted"];
const STYLES = ["floral", "flowers", "botanical", "tropical", "jungle", "palm", "leaf", "foliage", "garden", "geometric", "abstract", "chinoiserie", "landscape", "mountain", "forest", "woodland", "watercolour", "watercolor", "vintage", "ethnic", "indian", "japandi", "minimal", "birds", "bird", "animal", "nautical", "coastal", "ocean", "damask", "stripe", "texture", "marble", "art", "mural", "nature", "scenic", "map", "quirky"];
const ROOMS: Record<string, string> = {
  nursery: "nursery", baby: "nursery", infant: "nursery", crib: "nursery",
  kid: "kids", kids: "kids", child: "kids", playroom: "kids", teen: "teen",
  bedroom: "bedroom", bed: "bedroom", master: "bedroom",
  living: "living room", lounge: "living room", drawing: "living room", family: "living room",
  kitchen: "kitchen", dining: "kitchen",
  office: "office", study: "home office", work: "home office", desk: "home office",
  foyer: "foyer", entry: "foyer", entrance: "foyer", hallway: "foyer", corridor: "foyer",
  puja: "pooja", pooja: "pooja", prayer: "pooja", mandir: "pooja", temple: "pooja", worship: "pooja",
  cafe: "cafe", restaurant: "restaurant", hotel: "hotel", spa: "spa", office_space: "office",
};

function pickWords(text: string, vocab: string[]): string[] {
  const low = ` ${(text ?? "").toLowerCase()} `;
  return vocab.filter((w) => low.includes(w));
}

/** Build a small set of catalogue search phrases from the conversation. */
export function curationQueries(answers: Record<string, string>): string[] {
  const colourText = polarity(answers.colour_leaning ?? "").pos;
  const colours = pickWords(colourText, COLOURS);
  const styles = [...new Set([...pickWords(answers.pattern_appetite ?? "", STYLES), ...pickWords(answers.feeling ?? "", STYLES)])];

  const purposeLow = ` ${(answers.purpose ?? "").toLowerCase()} `;
  const rooms = [...new Set(Object.keys(ROOMS).filter((k) => purposeLow.includes(k)).map((k) => ROOMS[k]))];

  const queries: string[] = [];
  for (const c of colours.slice(0, 2)) queries.push(c);
  for (const s of styles.slice(0, 2)) queries.push(s);
  if (colours[0] && styles[0]) queries.push(`${colours[0]} ${styles[0]}`);
  for (const r of rooms.slice(0, 1)) queries.push(r);

  // sacred: honour the tradition with gentle, non-presumptuous subject searches
  if (isSacred(`${answers.purpose ?? ""} ${answers.tradition ?? ""}`)) {
    const t = `${answers.purpose ?? ""} ${answers.tradition ?? ""}`.toLowerCase();
    if (/ganesh/.test(t)) queries.push("ganesh");
    if (/buddha|buddhist/.test(t)) queries.push("buddha");
    if (/krishna|radha/.test(t)) queries.push("krishna");
    queries.push("lotus", "divine");
  }

  // always have something to search on
  if (!queries.length) {
    queries.push(...styles.slice(0, 1), ...colours.slice(0, 1));
    if (!queries.length) queries.push("floral", "landscape");
  }
  return [...new Set(queries)].slice(0, 6);
}

/** Colours / looks the customer asked to steer clear of — surfaced to the ranker. */
export function avoidTokens(answers: Record<string, string>): string[] {
  const fromAvoid = pickWords(answers.avoid ?? "", [...COLOURS, ...STYLES]);
  const negatedColour = pickWords(polarity(answers.colour_leaning ?? "").neg, COLOURS);
  return [...new Set([...fromAvoid, ...negatedColour])];
}

// Colour families — a wanted shade is "met" if any family member shows up in
// the candidate pool (sage counts as green, blush as pink, navy as blue…).
const COLOUR_FAMILY: Record<string, string[]> = {
  green: ["green", "sage", "olive", "emerald", "forest", "moss", "fern", "verdant"],
  blue: ["blue", "navy", "indigo", "teal", "turquoise", "azure", "cobalt"],
  pink: ["pink", "blush", "rose", "coral", "magenta"],
  yellow: ["yellow", "gold", "golden", "mustard", "ochre", "amber"],
  red: ["red", "terracotta", "crimson", "scarlet", "rust"],
  orange: ["orange", "peach", "apricot", "tangerine"],
  purple: ["purple", "lavender", "lilac", "violet", "plum", "mauve"],
  brown: ["brown", "tan", "chocolate", "walnut", "coffee"],
  grey: ["grey", "gray", "charcoal", "slate", "ash"],
  neutral: ["neutral", "cream", "ivory", "beige", "greige", "taupe", "sand", "oat"],
};
const familyOf = (colour: string): string[] => {
  for (const members of Object.values(COLOUR_FAMILY)) if (members.includes(colour)) return members;
  return [colour];
};

/**
 * A named colour the customer clearly wanted that no candidate can honour (by
 * family) — so the curator can say "the closest I could find" instead of
 * quietly substituting. Vague words (warm, bright…) never trigger it.
 */
export function unmetColour(answers: Record<string, string>, candidateHaystack: string): string | null {
  const wanted = pickWords(polarity(answers.colour_leaning ?? "").pos, COLOURS)
    .filter((c) => !["warm", "muted", "bright", "dark", "neutral"].includes(c));
  if (!wanted.length) return null;
  const hay = candidateHaystack.toLowerCase();
  for (const c of wanted) {
    if (!familyOf(c).some((w) => hay.includes(w))) return c;
  }
  return null;
}
