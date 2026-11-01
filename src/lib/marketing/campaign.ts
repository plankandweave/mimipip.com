// The "Walls Before Diwali" content calendar (Volume One, 23 Sep – 23 Oct 2026).
//
// This is the plan the engine posts DURING the campaign window, replacing the
// generic daily rotation for these dates. One design runs a three-day arc — the
// room (Wall), the close-up (Detail), the name (Word) — and no design is used
// in two arcs. Captions are the approved copy, posted verbatim (still passed
// through the same brand-safety gate). Resolved from the archived "Zyvorah
// Instagram campaign agent" session; see MEMORY / PR description for provenance.
//
// The 23 Sep launch triptych (TALK/SEE/DECIDE) and the eight 9:16 Stories are
// bespoke creative the feed engine does not compose; they are kept here as
// CAMPAIGN_MANUAL so the plan is complete and the board can show them, but they
// are not queued automatically.

import type { Pillar } from "./voice";
import type { MediaKind } from "./media/types";

export const CAMPAIGN_KEY = "walls-before-diwali-2026";

/** Inclusive day-key window (YYYY-MM-DD, 5 AM IST logical days). Outside this
 *  range the engine falls back to its normal rotation. */
export const CAMPAIGN_WINDOW = { start: "2026-09-23", end: "2026-10-23" } as const;

export type Beat = "wall" | "detail" | "word";

export type CampaignFeedSlot = {
  dayKey: string;
  seq: number;
  beat: Beat;
  collection: string;
  handle: string;
  design: string;
  pillar: Pillar;
  format: MediaKind;
  /** Approved copy, posted verbatim. */
  caption: string;
  /** Art-direction note for the reviewer / creative — what this frame should be. */
  artDirection: string;
};

export const CAMPAIGN_FEED: CampaignFeedSlot[] = [
  {
    dayKey: "2026-09-24", seq: 4, beat: "wall", collection: "Katha",
    handle: "mayur", design: "Mayur (मयूर)", pillar: "reveal", format: "feed",
    caption: "Mayur from Katha settles across this sitting room like a calm procession: sweeping tails, dew-deep blues, and a hush of antique gold that plays with brass, teak and woven cotton. At true scale, the birds rise just above the console, their gaze level with the sofa; the negative space keeps the room breathing. Style with an urli, a cane chair, and a soft rug; let the wall do the speaking. Cut to your wall, made to order for your space. Message us your wall size to see Mayur in your room. #Zyvorah #IndianInteriors #WallpaperIndia #WallDecorIndia #MadeToMeasure #HomeStylingIndia #LuxuryInteriorsIndia",
    artDirection: "The design in a real room, at true scale, full bleed.",
  },
  {
    dayKey: "2026-09-25", seq: 5, beat: "detail", collection: "Katha",
    handle: "mayur", design: "Mayur (मयूर)", pillar: "reveal", format: "feed",
    caption: "Up close, Mayur is all gesture: the hand in the arc of each feather, tiny stipples softening the eye, crosshatch turning shadow into depth. Washes shift from indigo to malachite, and a quiet old-gold edge catches light. Sized to your wall, made to order at ₹300/sq ft. India's most intelligent way to discover, visualise and order wallpaper. Ask for a true-scale close-up on your screen. #Zyvorah #KathaCollection #ArtForWalls #WallpaperIndia #DesignDetails #MadeToOrder #IndianHomes",
    artDirection: "A macro crop of the artwork itself — the mark, the grain, the hand. No room.",
  },
  {
    dayKey: "2026-09-26", seq: 6, beat: "word", collection: "Katha",
    handle: "mayur", design: "Mayur (मयूर)", pillar: "collection_story", format: "feed",
    caption: "Beauty, grace and royalty in one symbol: the monsoon dancer, the eye of the garden, the mor pankh held in so many Indian homes. In Katha, our collection of stories, each Sanskrit name carries its meaning into the room. This one brings poise and ceremony without noise. Share your wall’s height and width; we size Mayur to fit. #Zyvorah #KathaCollection #SanskritNames #IndianAesthetic #WallpaperIndia #WallArtIndia #HomeDecorIndia",
    artDirection: "Typographic plate: the name in Devanagari and English, and what it means, on a saturated ground.",
  },
  {
    dayKey: "2026-09-27", seq: 7, beat: "wall", collection: "Stallion Spirit",
    handle: "the-run-of-nine", design: "The Run of Nine", pillar: "reveal", format: "feed",
    caption: "Nine horses sweep the length of the wall, shoulders aligned, manes lifted, every stride carrying the room forward without hurry. In a living space or entry, The Run of Nine from Stallion Spirit sets a gracious tempo—calm energy for gatherings as the festive days draw near. Made to measure, made to order, cut to your wall at ₹300/sq ft. Message us to size it perfectly for your space. #IndianInteriors #DiwaliDecor #WallArtIndia #HomeStylingIndia #MadeToMeasure #InteriorDesignIndia #Zyvorah",
    artDirection: "The design in a real room, at true scale, full bleed.",
  },
  {
    dayKey: "2026-09-28", seq: 8, beat: "detail", collection: "Stallion Spirit",
    handle: "the-run-of-nine", design: "The Run of Nine", pillar: "reveal", format: "feed",
    caption: "Up close, the stride is a language of lines: lean muscles mapped by soft shading, manes broken into quick, wind-lit strokes, hooves suggested rather than drawn so speed stays in the white of the ground. The rhythm tightens where backs align, loosens at the tail—an artist’s shorthand for motion held mid-beat. You can read breath in the negative space, direction in every curve. #ArtDetail #IndianHomes #HorseArt #WallDecorIndia #DesignCloseup #StallionSpirit #HomeDetails",
    artDirection: "A macro crop of the artwork itself — the mark, the grain, the hand. No room.",
  },
  {
    dayKey: "2026-09-29", seq: 9, beat: "word", collection: "Stallion Spirit",
    handle: "the-run-of-nine", design: "The Run of Nine", pillar: "collection_story", format: "feed",
    caption: "Nine horses in synchronised motion—the herd caught at the instant it becomes one body, one intention. The name carries that single beat when momentum and good fortune join, the way Indian homes invite horses to usher in progress as celebrations begin. The store you can talk to. #StallionSpirit #IndianDecor #AuspiciousHomes #WallArtIndia #DiwaliHomes #DesignWithMeaning",
    artDirection: "Typographic plate: the name in Devanagari and English, and what it means, on a saturated ground.",
  },
  {
    dayKey: "2026-09-30", seq: 10, beat: "wall", collection: "Katha",
    handle: "kamdhenu", design: "Kamdhenu (कामधेनु)", pillar: "reveal", format: "feed",
    caption: "Low, honeyed light across teak and brass; Kamdhenu settles the room with a hush that feels like plenty. At true scale the motifs breathe, leaving space for fabric, wood and stone to speak. The palette rests in warm rice and sandalwood, touched with soft marigold — festive without noise, calm enough for every day. From Katha, our study of stories and season. Made to measure and cut to your wall, made to order at ₹300/sq ft. The store you can talk to. Message us to size Kamdhenu to your wall. #WallsBeforeDiwali #IndianInteriors #WallpaperIndia #HomeDecorIndia #InteriorDesignIndia #MadeToMeasure #DiwaliDecor",
    artDirection: "The design in a real room, at true scale, full bleed.",
  },
  {
    dayKey: "2026-10-01", seq: 11, beat: "detail", collection: "Katha",
    handle: "kamdhenu", design: "Kamdhenu (कामधेनु)", pillar: "reveal", format: "feed",
    caption: "Up close, the line keeps a human pace — firm, then feather-light; small pauses where the wrist breathed. Soft, translucent washes sit behind delicate strokes, letting light halo the forms rather than fill them. Tiny shifts in tone, a gentle grain, and edges that wander by choice give the artwork its quiet life when you stand near. Request a macro preview on your wall before you order. #KathaCollection #DesignDetails #IndianHomes #WallDecorIndia #ModernIndianHome #SlowDesign #CraftedForYou",
    artDirection: "A macro crop of the artwork itself — the mark, the grain, the hand. No room.",
  },
  {
    dayKey: "2026-10-02", seq: 12, beat: "word", collection: "Katha",
    handle: "kamdhenu", design: "Kamdhenu (कामधेनु)", pillar: "collection_story", format: "feed",
    caption: "Kamdhenu — the celestial cow of abundance and purity, she who grants what is wished for. We choose her name for a wall that greets the season of lamps with quiet generosity and keeps that blessing close, day after day. An invocation for clean-hearted plenty, held softly at home. Tell us your wall dimensions to begin. #Kamdhenu #IndianAesthetics #DiwaliHome #IndianDecor #WallpaperIndia #InteriorDesignIndia #WallsBeforeDiwali",
    artDirection: "Typographic plate: the name in Devanagari and English, and what it means, on a saturated ground.",
  },
  {
    dayKey: "2026-10-03", seq: 13, beat: "wall", collection: "TAASH",
    handle: "taash-bisaat-gehra", design: "Bisaat — Gehra", pillar: "reveal", format: "feed",
    caption: "Bisaat — Gehra steadies a space the way a board steadies a game: a clear field, a calm structure, energy banked into order. The scale sits true to a wall, generous enough for sofas, sideboards and art to breathe between the squares. Brass, cane and teak feel at home; textiles find their own rhythm against it, from kilims to jamdani. Made to measure at ₹400/sq ft, cut to your wall and made to order. Ask us to show this wall in your room before you decide. #IndianHomes #IndianInteriors #WallpaperIndia #HomeDecorIndia #MadeToMeasure #BespokeWalls #DiwaliDecor #Zyvorah",
    artDirection: "The design in a real room, at true scale, full bleed.",
  },
  {
    dayKey: "2026-10-04", seq: 14, beat: "detail", collection: "TAASH",
    handle: "taash-bisaat-gehra", design: "Bisaat — Gehra", pillar: "reveal", format: "feed",
    caption: "The squares aren’t mechanical; the hand is there. You can trace faint pencil rulings, a soft burr at the edges of colour, tiny shifts that make the grid feel alive. A crease from years tucked in a tin crosses the field; time has left tea marks and graphite whispers. TAASH began with a humble, uncut sheet of cards — its truth stayed. See Bisaat — Gehra carry that patina. Ask for a close-up on your wall. #IndianInteriors #IndianHomes #WallpaperIndia #WallArtIndia #BespokeWalls #MadeToMeasure #CraftedInIndia",
    artDirection: "A macro crop of the artwork itself — the mark, the grain, the hand. No room.",
  },
  {
    dayKey: "2026-10-05", seq: 15, beat: "word", collection: "TAASH",
    handle: "taash-bisaat-gehra", design: "Bisaat — Gehra", pillar: "collection_story", format: "feed",
    caption: "Bisaat is the board — the field of play. Gehra is deep — our most forthright take from the card sheet, a strong checkerboard in rich red and carbon black on a warm, natural ground. It carries the hush and thrill of taash nights into the room, without raising its voice. The store you can talk to. Share your wall size and we’ll size it to fit. #Zyvorah #IndianInteriors #WallpaperIndia #DiwaliDecor #HomeDecorIndia #MadeToMeasure #BespokeWalls",
    artDirection: "Typographic plate: the name in Devanagari and English, and what it means, on a saturated ground.",
  },
  {
    dayKey: "2026-10-06", seq: 16, beat: "wall", collection: "TAASH",
    handle: "taash-jodi", design: "Jodi", pillar: "reveal", format: "feed",
    caption: "Evening falls, the cards come out, and the room settles in. On the wall, Jodi keeps an easy rhythm: pairs of heart and spade moving evenly across the space, a calm counterpoint to full plates and lively hands. At true scale the repeat feels generous, companionable, never busy — sized to your wall, cut to your wall, and made to order at ₹400/sq ft. It sits happily behind a dining table, a snug sofa, or the nook where the game begins. Message us to size your wall. #WallsBeforeDiwali #IndianInteriors #DiwaliDecor #WallpaperIndia #MadeToMeasure #DiningRoomDecor #TaashNight #HomeStylingIndia",
    artDirection: "The design in a real room, at true scale, full bleed.",
  },
  {
    dayKey: "2026-10-07", seq: 17, beat: "detail", collection: "TAASH",
    handle: "taash-jodi", design: "Jodi", pillar: "reveal", format: "feed",
    caption: "Close up, you can see the kinship without the match: the heart’s curve carries a soft wobble, the spade’s shoulders sit a touch squarer. Tiny asymmetries keep the motif human, the edges gentle rather than rigid; the red holds steady while the negative space does the work. Spacing between the two is intentional, so each pair breathes before the next arrives. A new kind of wallpaper store — discover, size, personalise and order your wall entirely through conversation. #WallsBeforeDiwali #PatternDetails #IndianDesign #HandDesigned #WallpaperIndia #DesignCloseup #HomeDecorIndia",
    artDirection: "A macro crop of the artwork itself — the mark, the grain, the hand. No room.",
  },
  {
    dayKey: "2026-10-08", seq: 18, beat: "word", collection: "TAASH",
    handle: "taash-jodi", design: "Jodi", pillar: "collection_story", format: "feed",
    caption: "Jodi is the pair — a small, steady idea that carries a festival evening on its back. Two shapes that seem alike at first glance sit together by design: heart and spade as companions, not opponents. It belongs with TAASH, our ode to the Indian card table where the night lingers and stories grow. Name it for togetherness, for balance, for the quiet pact between two. #WallsBeforeDiwali #Jodi #Taash #HindiWords #IndianInteriors #DiwaliAtHome #DesignStory",
    artDirection: "Typographic plate: the name in Devanagari and English, and what it means, on a saturated ground.",
  },
  {
    dayKey: "2026-10-09", seq: 19, beat: "wall", collection: "TAASH",
    handle: "taash-tikdi", design: "Tikdi", pillar: "reveal", format: "feed",
    caption: "In Tikdi, small suits travel in calm trios across the room, a steady rhythm that settles into gentle texture from a step away. It sits easily behind a sofa, along a corridor, or wrapping a study, giving the space composure with a hint of play. Shown here at true scale, the room reads balanced and open. Made to measure and cut to your wall, made to order at ₹400/sq ft. The store you can talk to. #WallpaperIndia #IndianInteriors #InteriorDesignIndia #DiwaliDecor #HomeStyling #MadeToMeasure #DesignInIndia",
    artDirection: "The design in a real room, at true scale, full bleed.",
  },
  {
    dayKey: "2026-10-10", seq: 20, beat: "detail", collection: "TAASH",
    handle: "taash-tikdi", design: "Tikdi", pillar: "reveal", format: "feed",
    caption: "Those tiny hearts, clubs, diamonds and spades aren’t flat symbols. Each trio keeps a small wobble at its edge, a soft, lived-in black that shifts slightly from mark to mark, just as on the original sheet. The groups drift, pause, then move again, giving the wall a pulse you only notice when you lean in. Quiet from a distance; full of character when you’re near. #WallpaperDetails #IndianInteriors #TaashCollection #WallArtIndia #HomeDecorIndia #DesignInIndia #MadeToMeasure",
    artDirection: "A macro crop of the artwork itself — the mark, the grain, the hand. No room.",
  },
  {
    dayKey: "2026-10-11", seq: 21, beat: "word", collection: "TAASH",
    handle: "taash-tikdi", design: "Tikdi", pillar: "collection_story", format: "feed",
    caption: "From TAASH. Tikdi means three of a kind — luck, order and a touch of mischief, held together. On the wall it becomes company: threes travelling lightly, steady enough for everyday, playful enough for festival evenings. A small word carrying a generous idea. #Tikdi #TaashCollection #IndianInteriors #WallpaperIndia #DiwaliHomes #DesignInIndia #HomeStyling",
    artDirection: "Typographic plate: the name in Devanagari and English, and what it means, on a saturated ground.",
  },
  {
    dayKey: "2026-10-12", seq: 22, beat: "wall", collection: "Dwadasha",
    handle: "dwadasha-vakratunda", design: "Vakratunda (वक्रतुण्ड)", pillar: "reveal", format: "feed",
    caption: "From our Dwadasha collection, Vakratunda takes the wall as a single field and steadies the room with a gentle, curved presence. At true scale it rises above a low sofa, leaving air to breathe and light to pool on brass and wood. This is our sized to your wall wallpaper, cut to your wall and made to order, at ₹300/sq ft. A quiet centre for gatherings, and a place for the eye to rest between lamps and textiles. Share your wall size to begin. #WallsBeforeDiwali #IndianHomes #InteriorDesignIndia #HomeDecorIndia #MadeToMeasure #WallMural #Dwadasha",
    artDirection: "The design in a real room, at true scale, full bleed.",
  },
  {
    dayKey: "2026-10-13", seq: 23, beat: "detail", collection: "Dwadasha",
    handle: "dwadasha-vakratunda", design: "Vakratunda (वक्रतुण्ड)", pillar: "reveal", format: "feed",
    caption: "Seen whole, Vakratunda is a single, off‑centre gesture — an acrylic sweep that bends with purpose, then rests. Earthen ochres and charcoal settle into a field of quiet lime, letting negative space carry the weight. It doesn’t shout; it steadies, giving furniture a horizon to lean against. Watch daylight skim the arc through the day, and evening lamps coax its edge to glow. Save this for the wall you want to hold. #WallsBeforeDiwali #ArtForWalls #ContemporaryIndia #WallArtIndia #AcrylicArt #InteriorStylingIndia #ModernIndianHomes",
    artDirection: "A macro crop of the artwork itself — the mark, the grain, the hand. No room.",
  },
  {
    dayKey: "2026-10-14", seq: 24, beat: "word", collection: "Dwadasha",
    handle: "dwadasha-vakratunda", design: "Vakratunda (वक्रतुण्ड)", pillar: "collection_story", format: "feed",
    caption: "Vakratunda (वक्रतुण्ड). The first of the twelve names — the one with the curved trunk. Spoken at the start of any undertaking, it clears the way with a bend rather than a blow. As Navratri begins, we greet beginnings with a curve that knows how to turn. Name it on your wall, softly. #WallsBeforeDiwali #Vakratunda #Dwadasha #Sanskrit #Navratri #IndianDesign #HomeDecorIndia",
    artDirection: "Typographic plate: the name in Devanagari and English, and what it means, on a saturated ground.",
  },
  {
    dayKey: "2026-10-15", seq: 25, beat: "wall", collection: "Dwadasha",
    handle: "dwadasha-gajanana", design: "Gajanana (गजानन)", pillar: "reveal", format: "feed",
    caption: "At true scale, Gajanana steadies the room — a centred figure that meets eye level and holds the wall without crowding the furniture. Warm umbers and evening blues gather under low light; the rug and wood read deeper, brass reads brighter. Conversation softens. Place it in an entry, a sitting corner, or by the pooja — where beginnings are made. Ask us to size Gajanana to your wall. #IndianInteriors #HomeDecorIndia #WallMurals #PujaRoomDecor #EntrywayDesign #UnderstatedLuxury #DiwaliHomes #Zyvorah",
    artDirection: "The design in a real room, at true scale, full bleed.",
  },
  {
    dayKey: "2026-10-16", seq: 26, beat: "detail", collection: "Dwadasha",
    handle: "dwadasha-gajanana", design: "Gajanana (गजानन)", pillar: "reveal", format: "feed",
    caption: "The artwork is shown complete: a seated, elephant-faced form composed with generous breathing space and balanced lines. Gentle contours, layered colour, and a calm gaze invite the eye to return, then rest. Nothing is rushed; proportion leads the height of a human body, so the blessing meets you as you enter. Sized for harmony, never dominance, it holds light beautifully through the day. When you’re ready, we make it to order for your exact wall size. Ask for the full artwork guide. #IndianArt #IndianInteriors #WallArtIndia #SacredSpaces #CalmHome #MadeToOrder #DesignDetails",
    artDirection: "A macro crop of the artwork itself — the mark, the grain, the hand. No room.",
  },
  {
    dayKey: "2026-10-17", seq: 27, beat: "word", collection: "Dwadasha",
    handle: "dwadasha-gajanana", design: "Gajanana (गजानन)", pillar: "collection_story", format: "feed",
    caption: "Gajanana (गजानन) — the elephant-faced one — another of the twelve names honoured in Dwadasha. A name is an invocation; speak it and a beginning opens. That is why this collection is not mere adornment, but a way to start a room with intention. From Dwadasha, sized to your wall at ₹300/sq ft. Tell us the name you’d like to live with. #Dwadasha #GaneshaNames #IndianInteriors #SlowDesign #WallStories #UnderstatedLuxury #MadeInIndia",
    artDirection: "Typographic plate: the name in Devanagari and English, and what it means, on a saturated ground.",
  },
  {
    dayKey: "2026-10-18", seq: 28, beat: "wall", collection: "Maharaja's Court",
    handle: "maharaja-s-elephant-ii", design: "Maharaja's Elephant II", pillar: "reveal", format: "feed",
    caption: "Shown in a puja room, Maharaja’s Elephant II stands with formal calm. From our Maharaja’s Court collection, it brings ceremonial stillness into a small, sacred space, grounding brass, stone, and sandalwood tones. Scaled to true height, the elephant holds the wall without crowding the room; open ground keeps the diya light and flowers centre stage. Cut to your wall and placed exactly where your shrine asks, it is ₹300/sq ft. Ask for a wall plan for your room. #IndianInteriors #PujaRoom #HeritageHome #WallMural #DiwaliDecor #MadeToMeasure #IndianDecor",
    artDirection: "The design in a real room, at true scale, full bleed.",
  },
  {
    dayKey: "2026-10-19", seq: 29, beat: "detail", collection: "Maharaja's Court",
    handle: "maharaja-s-elephant-ii", design: "Maharaja's Elephant II", pillar: "reveal", format: "feed",
    caption: "Macro on Maharaja’s Elephant II: the anklet bells, the beaded net, the edge tassels—each stroke laid with deliberate restraint. The line carries weight and lift; shading is hatched, not filled, so the regalia sits light against the ground. This is the quiet that lets ceremony feel intimate. Made to measure when you’re ready. Ask for sizing help and we’ll map it to your wall. #ArtDetails #LineDrawing #HeritageDesign #IndianCraft #WallMural #DecorInspiration #MadeToMeasure",
    artDirection: "A macro crop of the artwork itself — the mark, the grain, the hand. No room.",
  },
  {
    dayKey: "2026-10-20", seq: 30, beat: "word", collection: "Maharaja's Court",
    handle: "maharaja-s-elephant-ii", design: "Maharaja's Elephant II", pillar: "collection_story", format: "feed",
    caption: "Maharaja’s Elephant II: the court elephant in full ceremonial regalia, a study in fine line. In Indian homes the gaja is auspicious—strength with gentleness, a welcome at the threshold, a blessing for beginnings. This naming nods to the darbar, and to a second, more measured sketch of the same guardian. Made to order, for the wall that sets the tone. Tell us this name when you enquire. #MaharajasCourt #ElephantMotif #AuspiciousHome #WallArtIndia #CustomWalls #MadeToOrder #InteriorIndia",
    artDirection: "Typographic plate: the name in Devanagari and English, and what it means, on a saturated ground.",
  },
  {
    dayKey: "2026-10-21", seq: 31, beat: "wall", collection: "Maharaja's Court",
    handle: "royal-peacock", design: "Royal Peacock", pillar: "reveal", format: "feed",
    caption: "In a living room of teak and soft lime, Royal Peacock from Maharaja's Court holds the centre without noise. The bird stands composed; filigree gold traces plume and crown, the palette kept to ceremony rather than show. At true scale the crown sits at eye level, the tail easing toward the skirting, letting furniture breathe. Ask to see Royal Peacock on your wall before you decide. #IndianInteriors #MuralWallpaper #MaharajasCourt #PeacockMotif #HomeDecorIndia #LuxuryInteriorsIndia #DiwaliDecor",
    artDirection: "The design in a real room, at true scale, full bleed.",
  },
  {
    dayKey: "2026-10-22", seq: 32, beat: "detail", collection: "Maharaja's Court",
    handle: "royal-peacock", design: "Royal Peacock", pillar: "reveal", format: "feed",
    caption: "Up close, the hand is calm: feather by feather, a field of small, deliberate lines. The gold reads like fine threadwork; the open ground is not empty, it holds light so the bird stays formal. Tiny asymmetries in crest and eye keep the dignity human. India's most intelligent way to discover, visualise and order wallpaper. Ask for a close-up and a room visual in your own light. #IndianInteriors #DesignDetails #PeacockArt #MaharajasCourt #HomeDecorIndia #LuxuryInteriorsIndia #MadeToOrder",
    artDirection: "A macro crop of the artwork itself — the mark, the grain, the hand. No room.",
  },
  {
    dayKey: "2026-10-23", seq: 33, beat: "word", collection: "Maharaja's Court",
    handle: "royal-peacock", design: "Royal Peacock", pillar: "collection_story", format: "feed",
    caption: "Royal Peacock names a white peacock in gold filigree—the court bird drawn at its most formal. Not the fanfare of colour, but a rare hush: whiteness for restraint, gold for rank, posture for ceremony. It closes the mood of Maharaja's Court with a bow rather than a drum. Explore Royal Peacock and the full collection. #IndianInteriors #MaharajasCourt #PeacockMotif #CulturalDesign #MuralWallpaper #WallsBeforeDiwali",
    artDirection: "Typographic plate: the name in Devanagari and English, and what it means, on a saturated ground.",
  },
];

export type ManualPost = {
  dayKey: string;
  kind: "launch" | "story";
  collection: string;
  design: string;
  handle: string | null;
  format: MediaKind;
  caption: string;
};

/** Bespoke posts the feed engine does not compose (kept for a complete plan). */
export const CAMPAIGN_MANUAL: ManualPost[] = [
  { dayKey: "2026-09-23", kind: "launch", collection: "", design: "TALK", handle: null, format: "feed", caption: "TALK. Tell us about your room — light, size, colours, what you love. We listen, then send back real designs shaped to your space. No trawling through thousands. This is Walls Before Diwali: Talk, See, Decide — and it begins with you. Everything we suggest is sized to your wall, made to order, cut to your wall. Message us to start. #WallsBeforeDiwali #IndianHomes #InteriorDesignIndia #WallpaperIndia #WallMuralsIndia #MadeToMeasure #DiwaliDecor #HomeDecorIndia" },
  { dayKey: "2026-09-23", kind: "launch", collection: "", design: "SEE", handle: null, format: "feed", caption: "SEE. Send a photo of your wall and we’ll place your chosen design on it at true scale — doors, switches and tricky corners included. No guessing; your room, before anything is made to order and cut to your wall. Walls Before Diwali: Talk • See • Decide. DM your wall photo to try it. 👀 #IndianInteriors #WallpaperIndia #HomeDecorIndia #InteriorDesignIndia #MadeToMeasure #DiwaliDecor #MumbaiHomes" },
  { dayKey: "2026-09-23", kind: "launch", collection: "", design: "DECIDE", handle: null, format: "feed", caption: "DECIDE is where it becomes real. Get a price for your exact wall, approve the crop, and place your order — all in the same conversation. Your wallpaper is sized to your wall, cut to your wall, made to order once you say yes. Talk. See. Decide. DM us to start. ✨ #WallpaperIndia #WallMuralsIndia #IndianHomes #IndianInteriors #HomeDecorIndia #InteriorDesignIndia #DiwaliDecor" },
  { dayKey: "2026-09-24", kind: "story", collection: "Katha", design: "Gaj Gatha (गज गाथा)", handle: "gaj-gatha", format: "story", caption: "Strength, wisdom, memory — Gaj Gatha belongs where stories gather. Which wall is calling? Tap to vote: Living room or Bedroom. Made to measure, cut to your wall before Diwali." },
  { dayKey: "2026-09-27", kind: "story", collection: "Stallion Spirit", design: "Thunderous Gallop", handle: "thunderous-gallop", format: "story", caption: "DM your wall photo and width. We’ll place Thunderous Gallop true to scale, made to order and cut to your wall, so you feel three stallions charge through your room." },
  { dayKey: "2026-09-30", kind: "story", collection: "Katha", design: "Padma (पद्म)", handle: "padma", format: "story", caption: "The lotus is a promise: purity amidst chaos, light on water. It returns to our walls because homes hold both. Padma is my quiet reminder before Diwali preparations begin — Roheena." },
  { dayKey: "2026-10-03", kind: "story", collection: "TAASH", design: "Ishaara", handle: "taash-ishaara", format: "story", caption: "Ishaara holds three quiet marks and plenty of breathing room. The open space is intentional — let your wall exhale. Made to measure, so the silence fits your room." },
  { dayKey: "2026-10-07", kind: "story", collection: "TAASH", design: "Booti", handle: "taash-booti", format: "story", caption: "Booti is the tiniest spade in TAASH — from across the room it reads like fine fabric; up close, a secret. Tap to vote: Across the room or Up close." },
  { dayKey: "2026-10-10", kind: "story", collection: "TAASH", design: "Ikka — Hukum", handle: "taash-ikka-hukum", format: "story", caption: "Lights low, laughter rising, taash on the table. Ikka — Hukum glows like aged card, the darkest panel, lit from within. Made to measure, cut to your wall for card night." },
  { dayKey: "2026-10-14", kind: "story", collection: "Dwadasha", design: "Ganapati (गणपति)", handle: "dwadasha-ganapati", format: "story", caption: "Before we start anything, we say his name. Ganapati from Dwadasha brings that first blessing home. Made to order, cut to your wall — begin your Navratri with steadiness and grace." },
  { dayKey: "2026-10-17", kind: "story", collection: "Dwadasha", design: "Lambodara (लम्बोदर)", handle: "dwadasha-lambodara", format: "story", caption: "Lambodara, the generous belly, brings joy into corners. Order walls by 20 October to be up for Diwali. Made to measure, made to order, cut to your wall." },
];

const FEED_BY_DAY = new Map<string, CampaignFeedSlot>(CAMPAIGN_FEED.map((s) => [s.dayKey, s]));

/** The campaign feed slot for a logical day, if the calendar defines one. */
export function campaignFeedSlot(dayKey: string): CampaignFeedSlot | undefined {
  return FEED_BY_DAY.get(dayKey);
}

/** Is this day inside the campaign window (so the engine should defer to it)? */
export function inCampaignWindow(dayKey: string): boolean {
  return dayKey >= CAMPAIGN_WINDOW.start && dayKey <= CAMPAIGN_WINDOW.end;
}
