// TAASH — Zyvorah × Mati. The collection, as the book defines it.
//
// The 130-page TAASH book is the authority on the collection: its names,
// Devanagari, pronunciation, meaning, print scale and grouping. Wallpaper names
// are also live catalogue identifiers and must remain unchanged.
//
// The counts come from the book's own foreword — "twenty-one surfaces cut from
// a deck that was never cut, fourteen to repeat, seven to hang whole" — over
// three limestone grounds. An earlier collection-manifest.txt in the print
// folder says fourteen/five/four and puts Chaukhana — Sindoor among the
// repeats; it is superseded. The book and TAASH-PRINT-SPEC.txt independently
// agree on SEVEN murals, and Chaukhana — Sindoor is plate MURAL 07.
//
// A GROUND is never shared. Three of the fourteen repeats print onto one
// ({Booti → Chuna, Parakh → Chheent, Kona → Resha}); the other eleven carry
// their own. If a design moves to a different ground it becomes a different
// design and takes a new name.

export type TaashGroup = "repeat" | "mural" | "ground";

export type TaashDesign = {
  /** Product handle in the catalogue. */
  handle: string;
  name: string;
  devanagari: string;
  /** The book's own pronunciation key, e.g. "BI-SA AT · GEH-RA". */
  pronunciation: string;
  /** The two- or three-word gloss under the name. */
  meaning: string;
  /** The book's plate note. Site copy, verbatim. */
  essay: string;
  /** One line, lifted from the plate note above, for the card. A card carries
   *  no price and no repeat: the collection is sold on the design first, and a
   *  spec sheet under a photograph is the fastest way to stop someone looking.
   *  Verbatim from the book, so the page and the printed edition agree. */
  line: string;
  group: TaashGroup;
  /** One sentence for the collection page: what the design DOES in a room.
   *  Editorial, not transcription — the book's plate note is `essay`, its
   *  one-liner is `line`, and both stay verbatim. This is the line a customer
   *  reads while deciding whether to look, and it is Roheena's, not the
   *  book's (feedback, 4 September 2026). */
  roomLine: string;
  /** The card's line on /mati: the NAME taught, then the design. Each opens by
   *  handing the reader the Hindi word — what it means at the card table, in
   *  the press-room or on the mason's wall — because for a visitor with no
   *  Devanagari the name is otherwise a locked door, and the names are the
   *  collection's whole story.
   *
   *  THE REGISTER (Roheena, 5 September, after two misses): plain, not
   *  literary. One idea per sentence — the word and its meaning in one clause,
   *  then what you are actually looking at, then at most one short beat on what
   *  it does for a room. The test for every line: could you say it aloud to a
   *  customer in a showroom without feeling silly? "Cut deep into a century of
   *  sepia" failed that test; "Dhoop means sunlight. This sheet sat in it for
   *  years" passes. Asterisked spans are transliterations and render italic. */
  story: string;
  /** Plate number as printed: "01" … "14", "MURAL 01" …, "GROUND 01" … */
  plate: string;
  /** Recommended repeat, e.g. "3 × 3". Null on murals and grounds. */
  scale: string | null;
  /** The ground this repeat prints onto, if it does not carry its own. */
  ground: string | null;
  /** Source artwork filename, for the seeding script. */
  source: string;
};

/** What each group costs, ₹ per sq ft, GST-INCLUSIVE like every other price on
 *  the site (Roheena, 3 September 2026).
 *
 *  The whole collection sits ABOVE standard wallpaper: ₹400 for all twenty-one
 *  repeats and murals, ₹300 for the three limestone grounds. A TAASH repeat is
 *  therefore not priced like an ordinary standard design, and the fact that
 *  ₹400 happens to equal today's Autograph rate is a coincidence of this month,
 *  not a relationship — see the note on the price tier below.
 *
 *  Superseded: TAASH-Rate-Card.pdf and the book's own specifications spread
 *  both quote ₹300 / ₹400 / ₹200. The card said "exclusive of GST" and the book
 *  said nothing at all, so a reader of either would have been quoted ₹300 and
 *  charged ₹472. The rates come out of the book entirely and the card is being
 *  reissued GST-inclusive; this constant is the authority in the meantime.
 */
export const TAASH_RATE: Record<TaashGroup, number> = {
  repeat: 400,
  mural: 400,
  ground: 300,
};
/** The tag every TAASH product carries; the `taash` collection's rule_tag. */
export const TAASH_TAG = "TAASH";

/** The partner slug in royalty_partners. Mati earns 20% of the EX-GST value of
 *  wallpaper lines only, so the royalty tracks these rates with no code change.
 */
export const TAASH_PARTNER = "mati";

/** TAASH's pricing tier: Saanjha (साँझा, "shared"), the collaboration tier,
 *  with Atelier arriving alongside the January 2027 collection. Both are real
 *  rows in `price_tiers` (migration 0140) and products.price_tier is a foreign
 *  key to that table, so a new tier is an insert rather than a deploy.
 *
 *  Saanjha is NOT Autograph. They shared a rate for exactly one month and are
 *  otherwise unrelated: Saanjha pins no rate and no stock, because TAASH's own
 *  grounds are ₹300 while everything else is ₹400 and one pinned rate cannot say
 *  that. So price comes from the product's own material row — which is what
 *  lib/taash-queries reads — and never from autograph_rate().
 *
 *  Two rules for anything reading the tier:
 *    - the Autograph BADGE and the linen pin are isAutographTier(), still true
 *      only of Autograph. TAASH must never carry that badge.
 *    - anything about WHERE a design may appear is isExclusiveTier(). Spelling
 *      exclusivity as `price_tier === 'autograph'` silently answers "not
 *      exclusive" for Saanjha and hands the collection to a reseller storefront.
 *
 *  This constant is collection COPY. The gates read TIER_LABEL in lib/pricing.
 */
export const TAASH_TIER_NAME = "Saanjha";

export const TAASH_DESIGNS: TaashDesign[] = [
  {
    handle: "taash-bisaat-gehra",
    name: "Bisaat — Gehra",
    devanagari: "बिसात · गहरा",
    pronunciation: "BI-SA AT · GEH-RA",
    meaning: "the board, deep",
    essay: "Card faces laid out as a chequerboard, each square its own little block-print with a patterned border, then the whole thing rubbed thin along the weave. Red, black and cream all at full strength — the only design that spends all three at once, which is what makes it the cover.",
    line: "Red, black and cream all at full strength — the only design that spends all three at once.",
    group: "repeat",
    roomLine: "A strong, graphic field of red, black and unbleached ground. Designed for a wall that should hold the room.",
    story: "*Bisaat* is the board a game is played on; *gehra* means deep. The full chequerboard of the deck — red, black and cream at full strength. The boldest wall in the collection.",
    plate: "01",
    scale: "2 × 2",
    ground: null,
    source: "Bisaat — Gehra.png",
  },
  {
    handle: "taash-bisaat-ghisa",
    name: "Bisaat — Ghisa",
    devanagari: "बिसात · घिसा",
    pronunciation: "BI-SA AT · GHI-SA",
    meaning: "the board, worn",
    essay: "The same board after it has been handled. The red has gone to rose, the black to a bruise, and several squares have given up their pips entirely. Where Gehra announces itself, Ghisa has stopped trying — which is why it is the one that will end up in most rooms.",
    line: "The red has gone to rose, the black to a bruise, and several squares have given up their pips entirely.",
    group: "repeat",
    roomLine: "The same game, softened by time. Washed colour, imperfect edges and the warmth of something much loved.",
    story: "*Ghisa* means worn — rubbed down by years of handling. The same chequerboard, faded: red gone to rose, black gone soft. The gentler of the two boards, and the easier to live with.",
    plate: "02",
    scale: "3 × 3",
    ground: null,
    source: "Bisaat — Ghisa.png",
  },
  {
    handle: "taash-tikdi",
    name: "Tikdi",
    devanagari: "तिकड़ी",
    pronunciation: "TIK-REE",
    meaning: "the trio",
    essay: "Spades and hearts in a single black, set three across and stepped so the eye never quite settles into a grid. The ink is heavy enough to have spread at the shoulders of every pip, and one in every dozen has filled in completely.",
    line: "The ink is heavy enough to have spread at the shoulders of every pip.",
    group: "repeat",
    roomLine: "A tailored all-over repeat of pips and pauses. Quiet from afar, richly detailed up close.",
    story: "*Tikdi* means a trio — three of a kind. Spades and hearts arranged in threes, in a single black. Quiet from a distance, detailed up close.",
    plate: "03",
    scale: "3 × 3",
    ground: null,
    source: "Tikdi.png",
  },
  {
    handle: "taash-jodi",
    name: "Jodi",
    devanagari: "जोड़ी",
    pronunciation: "JO-REE",
    meaning: "the pair",
    essay: "Two suits held in a single red, so the shapes do all the work of telling themselves apart. Spades read as hearts wearing a hat until you look twice — exactly the joke the collection keeps making.",
    line: "Spades read as hearts wearing a hat until you look twice.",
    group: "repeat",
    roomLine: "Hearts and spades in an unexpectedly tender conversation. Playful in spirit, composed in presence.",
    story: "*Jodi* means a pair — of cards, or of people. Hearts and spades printed in the same red, so alike you look twice. A design with warmth and a little mischief.",
    plate: "04",
    scale: "2 × 2",
    ground: null,
    source: "Jodi.png",
  },
  {
    handle: "taash-booti",
    name: "Booti",
    devanagari: "बूटी",
    pronunciation: "BOO-TEE",
    meaning: "the small motif",
    essay: "The whole collection reduced to its smallest possible unit: a spade at a centimetre, set on a fine diaper with nothing else in it. At this scale it stops reading as a card and starts reading as woven cloth — nearer a lining paper than a wallpaper.",
    line: "At this scale it stops reading as a card and starts reading as woven cloth.",
    group: "repeat",
    roomLine: "The smallest motif in the collection, reading as cloth rather than pattern. A room that feels lined, not papered.",
    story: "*Booti* is the block-printer's word for a small motif — the tiny sprig repeated across cloth. A spade at one centimetre, over and over, until the wall reads like woven fabric.",
    plate: "05",
    scale: "4 × 4",
    ground: "Chuna",
    source: "Booti.png",
  },
  {
    handle: "taash-parakh",
    name: "Parakh",
    devanagari: "परख",
    pronunciation: "PA-RAKH",
    meaning: "the proof",
    essay: "Clubs printed at full weight with a single red pip let in every few repeats, the way a pressman drops one colour into a proof sheet to check his register. The red is not decoration. It is the test.",
    line: "The red is not decoration. It is the test.",
    group: "repeat",
    roomLine: "An even, disciplined field with one red pip that keeps catching the eye. Calm walls with a pulse in them.",
    story: "*Parakh* means to test — the way a jeweller tests gold. Black clubs with a single red pip let in every so often, the mark a printer uses to check his work. The red is the test.",
    plate: "06",
    scale: "3 × 3",
    ground: "Chheent",
    source: "Parakh.png",
  },
  {
    handle: "taash-kona",
    name: "Kona",
    devanagari: "कोना",
    pronunciation: "KO-NA",
    meaning: "the corner",
    essay: "Clubs and small red diamonds set wide, with more sheet than mark. Most of this design is the paper it is printed on, and the pips gather toward the corners as though the block had been laid down carelessly and never straightened.",
    line: "Most of this design is the paper it is printed on.",
    group: "repeat",
    roomLine: "Mostly open ground with marks drifting to the edges. Gives a small room air and a large one restraint.",
    story: "*Kona* means corner — the part of a card your thumb wears first. A sparse pattern where the marks gather toward the edges, leaving the middle open and calm.",
    plate: "07",
    scale: "3 × 3",
    ground: "Resha",
    source: "Kona.png",
  },
  {
    handle: "taash-nishaan",
    name: "Nishaan",
    devanagari: "निशान",
    pronunciation: "NI-SHA AN",
    meaning: "the trace",
    essay: "What is left after the ink has gone. Clubs and diamonds survive as bruises in the plaster rather than as prints on it, and from four feet away the wall is simply grey. Walk up to it and the game surfaces.",
    line: "From four feet away the wall is simply grey. Walk up to it and the game surfaces.",
    group: "repeat",
    roomLine: "Grey from across the room, a full pattern up close. For spaces that should reward a second look.",
    story: "*Nishaan* means a mark or a trace. From across the room this wall is plain grey; step closer and the suits appear, pressed faintly into the plaster.",
    plate: "08",
    scale: "3 × 3",
    ground: null,
    source: "Nishaan.png",
  },
  {
    handle: "taash-soona",
    name: "Soona",
    devanagari: "सूना",
    pronunciation: "SOO-NA",
    meaning: "the empty",
    essay: "The quietest thing in the collection. A limewashed wall with a stain, a fold, and one club that did not quite lift off the block. It is the design to use where a pattern would be too much and plain paint would be too little.",
    line: "Where a pattern would be too much and plain paint would be too little.",
    group: "repeat",
    roomLine: "Almost plain, but never flat. Where paint would feel bare and a pattern would feel busy.",
    story: "*Soona* means empty — the feeling of a room after everyone has left. Limewash, one faint club, almost nothing. For walls that want quiet.",
    plate: "09",
    scale: "1 × 1",
    ground: null,
    source: "Soona.png",
  },
  {
    handle: "taash-dhaari",
    name: "Dhaari",
    devanagari: "धारी",
    pronunciation: "DHA A-REE",
    meaning: "the stripe",
    essay: "The oxblood reads as a dyed ground rather than a printed one, so the hearts sit half-sunk into it. The stripe does the structural work and the pips float. The only design in the set with a vertical to it, and the only one that will lift a low ceiling.",
    line: "The stripe does the structural work and the pips float.",
    group: "repeat",
    roomLine: "A vertical rhythm that lifts a low ceiling and lengthens a wall. Structure first, ornament second.",
    story: "*Dhaari* means stripe. Deep red bands with hearts resting inside them — lines that move like fabric, not like a ruler.",
    plate: "10",
    scale: "2 × 2",
    ground: null,
    source: "Dhaari.png",
  },
  {
    handle: "taash-bahi",
    name: "Bahi",
    devanagari: "बही",
    pronunciation: "BA-HEE",
    meaning: "the ledger",
    essay: "A press-house ledger: rows of spades ruled off by hand, a batch number written at the foot, a smear left to dry where somebody closed the book too soon. The sole keeper of the 4552 numerals and the only design in the collection that is a document rather than a pattern.",
    line: "A smear left to dry where somebody closed the book too soon.",
    group: "repeat",
    roomLine: "Ruled rows and handwritten marks that read as a document on the wall. Studies, offices and rooms that like evidence.",
    story: "*Bahi* is a ledger — the cloth-bound account book of every old Indian shop. Rows of spades ruled like entries, with a batch number and a smear left as they were found. A pattern that is really a document.",
    plate: "11",
    scale: "2 × 2",
    ground: null,
    source: "Bahi.png",
  },
  {
    handle: "taash-kaagaz",
    name: "Kaagaz",
    devanagari: "काग़ज़",
    pronunciation: "KA A-GAZ",
    meaning: "the paper",
    essay: "Pips set wide on warm stock, guide circles left in, and a compass arc still ruled across the sheet where the setter marked his spacing. The under-drawing was never cleaned up, because the under-drawing is the point.",
    line: "The under-drawing was never cleaned up, because the under-drawing is the point.",
    group: "repeat",
    roomLine: "Wide-set marks on warm stock with the setting lines left in. Gentle, open and easy to live beside.",
    story: "*Kaagaz* means paper. The sheet before printing: pencil circles and compass lines the maker never erased. A wall with its working shown.",
    plate: "12",
    scale: "3 × 3",
    ground: null,
    source: "Kaagaz.png",
  },
  {
    handle: "taash-chhapa",
    name: "Chhapa",
    devanagari: "छापा",
    pronunciation: "CHHA-PA",
    meaning: "the print",
    essay: "All four suits, printed large and printed plain, with nothing between them but the sheet. No border, no ground, no volume — the collection's specimen page, and the design every pip in the card deck was lifted from.",
    line: "All four suits, printed large and printed plain, with nothing between them but the sheet.",
    group: "repeat",
    roomLine: "Four suits, large and unadorned, with plenty of sheet between them. Confident without raising its voice.",
    story: "*Chhapa* means a print — the strike of a wooden block. All four suits, large and plain, straight from the block. The simplest design here, and the most direct.",
    plate: "13",
    scale: "3 × 3",
    ground: null,
    source: "Chhapa.png",
  },
  {
    handle: "taash-dhoop",
    name: "Dhoop",
    devanagari: "धूप",
    pronunciation: "DHOOP",
    meaning: "the sunlight",
    essay: "The only sheet in the collection whose ink has gone brown. Spades and clubs set wide on a warm cream ground, oxidised to tobacco, with a fold running down the centre where the sheet sat creased in a window. Everything else here is printed in black or red; this one was printed in black and then left in the light for thirty years.",
    line: "Printed in black, then left in the light for thirty years.",
    group: "repeat",
    roomLine: "Ink gone brown in the light, on a warm cream ground. Makes a north-facing room feel sunlit.",
    story: "*Dhoop* means sunlight. This sheet sat in it for years, and the black ink has warmed to brown. A pattern the sun softened.",
    plate: "14",
    scale: "3 × 3",
    ground: null,
    source: "Dhoop.png",
  },
  {
    handle: "taash-ishaara",
    name: "Ishaara",
    devanagari: "इशारा",
    pronunciation: "I-SHA A-RA",
    meaning: "the gesture",
    essay: "Two clubs and a spade, one of them turned, set dead centre on an otherwise empty wall. Nothing else in the collection is this restrained — the whole design is three marks and the silence around them, which is why it can only work as a single panel. Tiled, the emptiness becomes wallpaper; hung whole, it becomes a room that happens to have a card in it.",
    line: "Three marks and the silence around them.",
    group: "mural",
    roomLine: "Three marks and a great deal of quiet. A wall that behaves like a held breath.",
    story: "*Ishaara* means a gesture or a signal — the quiet nod between partners in a card game. Two clubs and a spade on an empty wall, and nothing else. The most restrained design in the collection.",
    plate: "MURAL 01",
    scale: null,
    ground: null,
    source: "Ishaara.png",
  },
  {
    handle: "taash-ikka-hukum",
    name: "Ikka — Hukum",
    devanagari: "इक्का · हुक़ुम",
    pronunciation: "IK-KA · HU-KUM",
    meaning: "Ace of Spades",
    essay: "The dirtiest of the four and the darkest — a foxed sepia ground gone almost to bitumen around the edges, with the pip cut deep and lit from inside like worked metal. It does not want a bright room. It wants a reflective one.",
    line: "It does not want a bright room. It wants a reflective one.",
    group: "mural",
    roomLine: "The darkest panel in the collection, lit from within. For a room with low light and a point of view.",
    story: "*Hukum* is spades, in Hindi — the word also means command. One black ace with the weight of old ink, at the scale of a wall. Bold, spare, quietly commanding.",
    plate: "MURAL 02",
    scale: null,
    ground: null,
    source: "Ikka — Hukum.png",
  },
  {
    handle: "taash-ikka-chidi",
    name: "Ikka — Chidi",
    devanagari: "इक्का · चिड़ी",
    pronunciation: "IK-KA · CHI-REE",
    meaning: "Ace of Clubs",
    essay: "The densest ornament in the collection: three medallions of scrollwork with a rosette at the join. At wall scale it stops reading as a card and reads as a pierced screen with light behind it.",
    line: "At wall scale it reads as a pierced screen with light behind it.",
    group: "mural",
    roomLine: "Dense scrollwork that reads as a carved screen at wall scale. Ornament with real depth to it.",
    story: "*Chidi* is clubs — named for the little bird, chidiya. The most detailed of the four aces: dense scrollwork, made for walls you see up close.",
    plate: "MURAL 03",
    scale: null,
    ground: null,
    source: "Ikka — Chidi.png",
  },
  {
    handle: "taash-ikka-eent",
    name: "Ikka — Eent",
    devanagari: "इक्का · ईंट",
    pronunciation: "IK-KA · EENT",
    meaning: "Ace of Diamonds",
    essay: "The only ace with real colour left in it — rose and rust inside the lozenge, red spatter thrown across the field like something spilled and never wiped up.",
    line: "Red spatter thrown across the field like something spilled and never wiped up.",
    group: "mural",
    roomLine: "Rose and rust inside the lozenge, with colour thrown across the field. The warmest wall here.",
    story: "*Eent* is diamonds — in Hindi, the word means brick: the one suit named for what walls are made of. The reddest of the four aces, with a little defiance in it.",
    plate: "MURAL 04",
    scale: null,
    ground: null,
    source: "Ikka — Eent.png",
  },
  {
    handle: "taash-ikka-paan",
    name: "Ikka — Paan",
    devanagari: "इक्का · पान",
    pronunciation: "IK-KA · PA AN",
    meaning: "Ace of Hearts",
    essay: "Red ink on a ground gone almost to tobacco. The vine filling the heart sits closer to a shawl than to a European court card — the softest of the four, and the one that will take a room with people in it.",
    line: "The softest of the four, and the one that will take a room with people in it.",
    group: "mural",
    roomLine: "A softened red on tobacco ground, closer to a shawl than a card. Takes a room full of people well.",
    story: "*Paan* is hearts — named after the betel leaf, which shares its shape. A red ace filled with vines, softer than the other three. Romantic in impulse, composed in scale.",
    plate: "MURAL 05",
    scale: null,
    ground: null,
    source: "Ikka — Paan.png",
  },
  {
    handle: "taash-dhalai",
    name: "Dhalai",
    devanagari: "ढलाई",
    pronunciation: "DHA-LYE",
    meaning: "poured lime",
    essay: "Cool grey-beige with a fine vertical drag through it and dark weathering down one side — the surface a wall takes when it is cast against timber shuttering and then left. The coolest thing in the collection and the only one that reads as architecture rather than paper. It carries no pip at all, which is why it can only be hung whole: at repeat scale it is a texture, and at wall scale it is a room.",
    line: "The surface a wall takes when it is cast against timber and then left.",
    group: "mural",
    roomLine: "Cool poured lime with a vertical drag. Reads as architecture, not as paper.",
    story: "*Dhalai* means casting — lime poured and left to set. No cards at all: just the surface itself, cool and architectural. A wall that reads as stone, not paper.",
    plate: "MURAL 06",
    scale: null,
    ground: null,
    source: "Dhalai.png",
  },
  {
    handle: "taash-chaukhana-sindoor",
    name: "Chaukhana — Sindoor",
    devanagari: "चौखाना · सिंदूर",
    pronunciation: "CHOW-KHA A-NA · SIN-DOOR",
    meaning: "the chequer",
    essay: "Hard-edged, flat, unapologetic — the cleanest geometry in the collection, set deliberately against all the rubbed and scrubbed surfaces around it. It is drawn to the wall rather than repeated across it, which is why the lozenges are a different size in every room you will see it in, and why it is here among the murals rather than back among the sheets. It is also the only design in the collection built on a lozenge, which is why the deck’s card back had to come from here.",
    line: "Hard-edged, flat, unapologetic — the cleanest geometry in the collection.",
    group: "mural",
    roomLine: "Clean, flat geometry drawn to your wall. The sharpest thing in the collection, and the steadiest.",
    story: "*Chaukhana* means chequered — literally, four houses. *Sindoor* is the vermilion red worn in the parting of the hair. A clean, confident grid in the strongest red in the collection.",
    plate: "MURAL 07",
    scale: null,
    ground: null,
    source: "Chaukhana — Sindoor.png",
  },
  {
    handle: "taash-chuna",
    name: "Chuna",
    devanagari: "चूना",
    pronunciation: "CHOO-NA",
    meaning: "plain limestone",
    essay: "A plain limestone wash, drawn and aged for this collection and used under Booti. A ground is never repeated across two designs.",
    line: "A plain limestone wash. A ground is never repeated across two designs.",
    group: "ground",
    roomLine: "A plain limestone wash for walls that want depth without pattern.",
    story: "*Chuna* means lime — the whitewash on every old Indian wall. Soft, chalky and plain. The quietest surface in the collection, and the ground Booti is printed on.",
    plate: "GROUND 01",
    scale: null,
    ground: null,
    source: "Chuna.png",
  },
  {
    handle: "taash-chheent",
    name: "Chheent",
    devanagari: "छींट",
    pronunciation: "CHHEENT",
    meaning: "speckled pinstripe",
    essay: "A speckled pinstripe limestone, drawn and aged for this collection and used under Parakh. A ground is never repeated across two designs.",
    line: "A speckled pinstripe limestone. A ground is never repeated across two designs.",
    group: "ground",
    roomLine: "A speckled limestone with a fine pinstripe running through it. Texture you feel before you notice.",
    story: "*Chheent* means a splash of tiny flecks — it is the word 'chintz' came from. Small scattered marks on soft limestone — the ground beneath Parakh.",
    plate: "GROUND 02",
    scale: null,
    ground: null,
    source: "Chheent.png",
  },
  {
    handle: "taash-resha",
    name: "Resha",
    devanagari: "रेशा",
    pronunciation: "RAY-SHA",
    meaning: "grained plaster",
    essay: "A grained plaster limestone, drawn and aged for this collection and used under Kona. A ground is never repeated across two designs.",
    line: "A grained plaster limestone. A ground is never repeated across two designs.",
    group: "ground",
    roomLine: "A grained plaster surface that gives a flat wall grain and shadow.",
    story: "*Resha* means fibre — the fine strands in handmade paper and cloth. A grained plaster with visible thread and texture. The ground beneath Kona.",
    plate: "GROUND 03",
    scale: null,
    ground: null,
    source: "Resha.png",
  },
];

export const TAASH_REPEATS = TAASH_DESIGNS.filter((d) => d.group === "repeat");
export const TAASH_MURALS = TAASH_DESIGNS.filter((d) => d.group === "mural");
export const TAASH_GROUNDS = TAASH_DESIGNS.filter((d) => d.group === "ground");

export function taashByHandle(handle: string): TaashDesign | undefined {
  return TAASH_DESIGNS.find((d) => d.handle === handle);
}
