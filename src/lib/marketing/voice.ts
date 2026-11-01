// The Zyvorah marketing voice, distilled from the brand's own live surfaces —
// the concierge system prompt, the founder-note email (src/lib/founder-email.ts),
// the order-copy PDF, and the site's editorial headlines. This is the single
// source of truth the caption generator is prompted with, so autonomous posts
// sound like the brand and not like "AI marketing copy."
//
// Two rules sit above everything and are ALSO enforced mechanically by the
// safety gate (src/lib/marketing/safety.ts) — never rely on the model alone:
//   1. Never reveal how anything is made. See BANNED_TERMS.
//   2. Never state a price the live catalogue can't back up.

/**
 * Terms that must NEVER appear in public content — printer/machine brands,
 * suppliers, ink chemistry, internal tooling, pipeline internals. Matched
 * case-insensitively as whole words/phrases by the safety gate. Add to this
 * list as the operation grows; the gate treats any hit as a hard block.
 */
export const BANNED_TERMS: string[] = [
  // Manufacturing / equipment — the core trade-secret surface.
  "mimaki",
  "roland",
  "epson",
  "hp latex",
  "latex ink",
  "eco-solvent",
  "eco solvent",
  "solvent ink",
  "uv ink",
  "printhead",
  "print head",
  "rip software",
  "onyx",
  "caldera",
  "gsm",
  "coating line",
  "lamination",
  "substrate supplier",
  "ink supplier",
  "our supplier",
  "our vendor",
  "our factory",
  "our printer",
  "the machine",
  // Internal systems / pipeline — nobody outside needs these words.
  "supabase",
  "ade20k",
  "clip embedding",
  "segmentation model",
  "furniture_score",
  "homography",
  "mcp endpoint",
  "razorpay key",
  "service role",
  // Margin / cost internals.
  "cost price",
  "our cost",
  "margin",
  "markup",
  "wholesale cost",
  "landed cost",
];

/**
 * British / Indian-English spellings the brand uses everywhere. The safety gate
 * flags the American form so captions never drift. (value = correct form.)
 */
export const SPELLING_CANON: Record<string, string> = {
  color: "colour",
  colors: "colours",
  colored: "coloured",
  favorite: "favourite",
  favorites: "favourites",
  watercolor: "watercolour",
  watercolors: "watercolours",
  neighbor: "neighbour",
  neighborhood: "neighbourhood",
  meter: "metre",
  meters: "metres",
  center: "centre",
  centered: "centred",
};

/**
 * Positioning (July 2026, from a global competitive review of Hovia, Photowall,
 * Rebel Walls, Wallsauce, Spoonflower, Graham & Brown et al.): no other
 * dedicated wallpaper retailer publicly combines conversational shopping,
 * room/mood/budget understanding, in-chat recommendations + pricing + cart,
 * true-scale room visualisation, photo matching, print-your-own and
 * made-to-measure ordering. That category is OURS. The engine markets it hard —
 * with the claims discipline the research itself prescribed.
 */
export const POSITIONING = {
  // Approved public claims, strongest first. Use these verbatim or closely.
  claims: [
    "A new kind of wallpaper store — discover, size, personalise and order your wall entirely through conversation.",
    "India's most intelligent way to discover, visualise and order wallpaper.",
    "The world's most complete conversational (agentic) wallpaper-shopping experience we know of.",
    "The store you can talk to.",
  ],
  // The capability list that substantiates the claims — draw specifics from
  // here rather than asserting vague superiority.
  proofPoints: [
    "shop the entire catalogue by conversation — describe your room, get real designs",
    "see any design on your own wall at true scale before you buy",
    "photograph anything you love and find its match in the collection",
    "price your exact wall in chat — size, material, GST-inclusive, honestly",
    "approve the exact crop and composition before anything is made",
    "upload your own artwork and order it as your wall",
    "original mural wallpaper designs for your wall",
  ],
  // Claims discipline (from the same research): never the unqualified
  // "world's best wallpaper website" — too broad, invites contradiction.
  neverClaim: ["world's best wallpaper", "best wallpaper website in the world", "#1 wallpaper website"],
} as const;

/** Content pillars — the weekly rotation the selector draws from. */
export type Pillar =
  | "reveal" // hero design shown at true scale on a wall (workhorse Reel/post)
  | "room_story" // one design across several room scenes (carousel)
  | "the_zyvorah_way" // design-led shopping and wall visualisation
  | "founders_favourite" // Roheena's signed picks, human warmth
  | "feature" // Ask Zyvorah / See-it-on-your-wall / match-a-photo demos
  | "agentic_story" // the category claim: a store you can talk to, end to end
  | "collection_story"; // the story behind a named collection

export const PILLARS: Record<Pillar, { label: string; brief: string }> = {
  reveal: {
    label: "Design reveal",
    brief:
      "Lead with the design's feeling and name. Let the artwork carry the message. One clear CTA.",
  },
  room_story: {
    label: "Room story",
    brief:
      "Same design, shown belonging in more than one kind of room. Speak to how it changes a space, not specs.",
  },
  the_zyvorah_way: {
    label: "The Zyvorah way",
    brief:
      "Show how a named mural design belongs in a real room. Let the artwork and the room carry the story.",
  },
  founders_favourite: {
    label: "Founder's favourite",
    brief:
      "Warm, first-person from Roheena. If the product has a founders_note, let its spirit lead. Signed, personal, never salesy.",
  },
  feature: {
    label: "Feature demo",
    brief:
      "Show one of the interactive tools — Ask Zyvorah (stylist chat), See it on your wall (true-scale preview), or match-a-photo — as a helpful superpower, not a tech brag.",
  },
  agentic_story: {
    label: "The store you can talk to",
    brief:
      "The category claim: this is a new kind of wallpaper store — you can discover, size, price, personalise and order entirely through conversation. Lead with ONE approved positioning claim, ground it in 2-3 concrete proof points (describe your room and get real designs; see it on your own wall at true scale; price your exact wall in chat, GST included; approve the exact crop before it's made). Confident, wondrous, never boastful — show the magic, don't just assert it.",
  },
  collection_story: {
    label: "Collection story",
    brief:
      "Tell the story or meaning behind the named collection or the design's name (e.g. a Sanskrit meaning, a tradition). Culture and intent over product specs.",
  },
};

/**
 * The caption-writer system prompt. Extends the founder-note voice
 * (src/lib/founder-email.ts) to social. Deliberately strict on the two
 * hard rules so the model rarely produces something the gate must reject.
 */
export const CAPTION_SYSTEM = `You write Instagram captions for Zyvorah — an Indian design house for original mural wallpapers. The customer chooses a design and imagines it in their own room.

POSITIONING (July 2026 — substantiated by a global competitive review)
Zyvorah is a new kind of wallpaper store: the whole journey — discovering designs, seeing them on your own wall at true scale, pricing your exact wall, personalising, ordering — can happen through conversation. No other wallpaper retailer we know of combines this. Approved claim lines (use verbatim or closely, at most one per caption):
- "A new kind of wallpaper store — discover, size, personalise and order your wall entirely through conversation."
- "India's most intelligent way to discover, visualise and order wallpaper."
- "The store you can talk to."
CLAIMS DISCIPLINE: never say "world's best wallpaper website" or any unqualified best-in-the-world claim — always ground superiority in the concrete capabilities instead.

VOICE
- Warm, intelligent, editorial, quietly premium. Short declarative sentences and fragments. Confident, never hype.
- Indian / British English spelling always (colour, favourite, metre, centre).
- You may use the ✦ sparkle motif at most ONCE per caption, and only where it earns its place.
- Lead with the named design, its story, and how it changes a room. Do not use sizing or production as a selling point. Avoid sizing and production claims in customer-facing copy.
- When you state price, say it honestly and exactly as given: the from-price per square foot, GST included, any size. Never invent or round a price. If no price is given to you, do not mention price.
- End with ONE call to action, drawn from the one you're told to use.

HARD RULES — breaking either is a failure:
1. NEVER describe or hint at how the wallpaper is manufactured. No machines, printer brands, inks, suppliers, factories, software, or internal process. Describe the design, the FEELING and the room instead.
2. NEVER state internal business information — costs, margins, vendors, or the names of any tools or systems used to run the business.

FORMAT
- 40–90 words for the body, unless told otherwise.
- Then a blank line, then 8–15 lowercase hashtags relevant to the design, its rooms, and the Indian interiors niche.
- Return ONLY the caption text (body + hashtags). No preamble, no explanation, no quotes around it.`;
