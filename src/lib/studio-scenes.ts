// The room/space scenarios Zyvorah Studio can render a flat artwork into.
//
// One entry per place a customer can actually shop on the site — i.e. per `room`
// collection behind /rooms ("Shop by Room") — plus a handful of extra framings
// (stairway, passage, laundry, detail shot) that earn their keep in a product
// gallery without having a collection of their own.
//
// `collection` ties a scenario to `collections.handle`. That's what lets the
// Studio room picker be built from the live site taxonomy instead of a
// hand-kept list: /api/studio/scenes joins these against the collections table,
// so a new room collection shows up in the picker as soon as a scenario for it
// exists here.
//
// `roomTags` are the real product tags (== `collections.rule_tag`) applied when
// the scene is generated, so the design auto-joins that collection and shows
// its matching render there (see ROOM_SCENE_KEY in src/lib/rooms.ts).

/**
 * The broad space category a room belongs to — purely a Studio-UI grouping
 * (which section of the room picker a chip sits in) so an uploader can jump
 * straight to "Retail" or "Hospitality" instead of scanning one long flat
 * list. Order here IS the display order.
 */
export const SPACE_CATEGORIES = [
  "Residential",
  "Kids & Family",
  "Retail",
  "Office & Corporate",
  "Hospitality",
  // A developer's COMMON areas — the lobby, the lift lobby, the clubhouse.
  // Deliberately not "Residential": that category is somebody's own flat, and
  // the brief for a wall four hundred families walk past every day is a
  // different one. See src/content/real-estate.ts.
  "Residential Amenities",
  "Healthcare",
  "Education & Institutional",
] as const;
export type SpaceCategory = (typeof SPACE_CATEGORIES)[number];

/**
 * The frame a scenario is photographed in.
 *
 * Almost every room is seen across its width, so landscape is the default and
 * always was. A phone booth is the exception that forced this to become a
 * property: it is a tall box you look straight into, roughly 1 m wide and 2 m
 * high, and a landscape frame spends most of its pixels on the office outside
 * the pod while cropping the panel that is actually for sale.
 */
export type SceneFrame = "landscape" | "portrait";

export type Scenario = {
  key: string;
  label: string;
  /** Defaults to landscape when unset — see SceneFrame. */
  frame?: SceneFrame;
  /** The interior described to gpt-image-2. Server-side only. */
  room: string;
  /** "By Room" collection tags this scene populates. */
  roomTags?: string[];
  /** `collections.handle` this scenario renders for, when there is one. */
  collection?: string;
  /** Which room-picker section this sits in. Only set on scenarios that have
   *  a `collection` — extras (stairway, detail shot, …) aren't categorised. */
  spaceCategory?: SpaceCategory;
};

export const SCENARIOS: Scenario[] = [
  // ---- rooms & spaces that map to a shoppable collection ----
  { key: "living", label: "Living room", collection: "living-room-wallpaper", roomTags: ["Living Room"], spaceCategory: "Residential",
    room: "an elegant modern living room, the mural on the wall behind a low linen sofa, coffee table, warm lamp light" },
  { key: "pianoroom", label: "Piano room", collection: "piano-rooms", roomTags: ["Piano Rooms"], spaceCategory: "Residential",
    room: "a tall, refined residential piano room with the mural printed across the full feature wall, a polished grand piano in front and kept low enough for the artwork to remain legible, pale stone floor, warm architectural light, no lettering or signage" },
  { key: "bedroom", label: "Master bedroom", collection: "bedroom-wallpaper", roomTags: ["Bedroom"], spaceCategory: "Residential",
    room: "a calm master bedroom, the mural as the headboard feature wall behind an upholstered bed with neutral linen bedding" },
  { key: "kidsroom", label: "Child's bedroom", collection: "kids-wallpapers", roomTags: ["Kids"], spaceCategory: "Kids & Family",
    room: "a cheerful child's bedroom, the mural as the feature wall behind a low kids' bed with playful bedding, a small bookshelf and a soft rug" },
  { key: "playroom", label: "Kids' playroom", collection: "kids-wallpapers", roomTags: ["Kids"], spaceCategory: "Kids & Family",
    room: "a bright kids' playroom, the mural on the wall with a small teepee, floor cushions and wooden toys" },
  { key: "nursery", label: "Nursery", collection: "baby-nursery-wallpapers", roomTags: ["Nursery"], spaceCategory: "Kids & Family",
    room: "a serene nursery, the mural on the wall behind a white wooden crib, a boucle armchair, a soft rug, gentle daylight" },
  { key: "pooja", label: "Pooja room", collection: "pooja-room-wallpaper", roomTags: ["Pooja Room"], spaceCategory: "Residential",
    room: "a serene home pooja/prayer room, the mural as a wall backdrop behind a small marble temple shelf (mandir) with brass diyas, incense and fresh marigold flowers, warm golden ambient light" },
  // ONE-OFF, FOR THE DIWALI POST (founder, 26 Sep 2026). The standard "pooja"
  // scene dresses a shrine generically; this one dresses it for Lakshmi Puja
  // itself, with the four murtis she asked for. It reuses the Pooja Room tag
  // and collection deliberately, so nothing new appears on the site — the
  // render simply joins that design's other room scenes and can be used on
  // the product page as well as in the post.
  { key: "pooja-diwali", label: "Pooja room · Diwali", collection: "pooja-room-wallpaper", roomTags: ["Pooja Room"], spaceCategory: "Residential",
    // NO PLANTS. The first render put a potted plant in front of the mural and
    // the occlusion guard refused it at 0.265 — correctly; the wall is the
    // product. Everything festive sits ON or BESIDE the low mandir, and the
    // wall above it stays clear.
    room: "a home pooja room dressed for Lakshmi Puja on the night of Diwali, the mural as the full wall backdrop behind a LOW white marble mandir; seated together on the mandir are four garlanded deity murtis — Lakshmi, Ganesha, Saraswati and Vishnu — each draped in fresh orange and yellow marigold garlands; rows of lit brass diyas run along the mandir steps and across the floor, with a brass puja thali of kumkum and sweets, an incense holder trailing smoke, loose marigold and rose petals and a small coloured rangoli on the marble floor; warm festive lamplight in a palette of deep reds, marigold orange and fresh leaf green. NOTHING stands against the wall except the low mandir — absolutely no potted plants, no foliage, no tall vases, no lamps, no furniture and no hanging fixture anywhere in front of the mural, which must be visible whole from floor to ceiling. No people anywhere in the frame" },
  // A home-office render has always doubled as the Office collection's card
  // image (135 of them in the catalogue against 4 corpoffice), so it keeps both
  // tags — dropping "Office" here would empty most of that collection.
  { key: "office", label: "Home office", collection: "home-office-wallpaper", roomTags: ["Home Office", "Office"], spaceCategory: "Residential",
    room: "a stylish home office, the mural behind a wooden desk with a chair and shelves" },
  { key: "dining", label: "Dining room", collection: "dining-room-wallpaper", roomTags: ["Dining Room"], spaceCategory: "Residential",
    room: "a refined dining room, the mural as a feature wall behind a wooden dining table with designer chairs" },
  { key: "entryway", label: "Entrance foyer", collection: "foyer", roomTags: ["Foyer"], spaceCategory: "Residential",
    room: "a boutique entrance foyer/hallway, the mural on the wall beside a slim console table with a vase and mirror" },
  { key: "kitchen", label: "Kitchen", collection: "kitchen-wallpaper", roomTags: ["Kitchen"], spaceCategory: "Residential",
    room: "a bright contemporary kitchen, the mural on the wall of the adjoining breakfast nook beside clean cabinetry, a stone worktop, a small vase of herbs and morning daylight" },
  { key: "teen", label: "Teen room", collection: "teen-wallpaper", roomTags: ["Teen"], spaceCategory: "Kids & Family",
    room: "a stylish teenager's bedroom, the mural as the feature wall behind a neatly made bed with a throw, a study desk with headphones, a floor lamp and a few framed prints leaning on a shelf" },
  { key: "toddler", label: "Toddler room", collection: "toddler-wallpaper", roomTags: ["Toddler"], spaceCategory: "Kids & Family",
    room: "a sweet toddler's bedroom, the mural as the feature wall behind a low toddler bed with soft bedding, a woven basket of toys, a rocking horse and a small round rug" },
  { key: "playschool", label: "Play school", collection: "play-school-wallpaper", roomTags: ["Play School"], spaceCategory: "Education & Institutional",
    room: "a cheerful play school classroom, the mural along the wall above low wooden tables and tiny chairs, a soft foam mat, alphabet blocks and open toy shelves, bright even daylight" },
  { key: "corpoffice", label: "Office interior", collection: "office-wallpaper", roomTags: ["Office"], spaceCategory: "Office & Corporate",
    room: "a refined modern corporate office interior, the mural as the full feature wall behind a clean workspace with wooden desks, ergonomic chairs and soft daylight from large windows" },
  // Reception has always populated the hotel collection too, and it's the scene
  // key that collection's cards render from (ROOM_SCENE_KEY.hotels).
  { key: "reception", label: "Reception & lobby", collection: "office-wallpaper", roomTags: ["Office", "Office: Reception", "Hotel Lobby & Reception"], spaceCategory: "Office & Corporate",
    room: "the reception of a beautiful chic contemporary office, the mural as the statement wall behind a sleek minimal reception desk, designer pendant lights, polished stone floor, no signage or lettering on the wall" },
  { key: "boardroom", label: "Boardroom & cabins", collection: "office-wallpaper", roomTags: ["Office", "Office: Boardroom"], spaceCategory: "Office & Corporate",
    room: "an elegant discussion room in a corporate space, the mural on the wall behind a long wooden meeting table with modern upholstered chairs, glass partition to one side, bright natural light" },
  // ---- the /office section's workspace types -------------------------------
  // These exist so the office pages can show a render of the ACTUAL space
  // rather than a home office, which is the whole reason a workplace buyer
  // bounces off a residential-looking catalogue. Each carries the matching
  // "Office: …" curated tag (src/content/workspaces.ts), so generating a scene
  // ALSO files the design into that workspace's edit — the edit sharpens as
  // the imagery is made, with no separate tagging pass.
  { key: "meetingroom", label: "Meeting & conference rooms", collection: "office-wallpaper", roomTags: ["Office", "Office: Meeting Room"], spaceCategory: "Office & Corporate",
    room: "a contemporary corporate meeting room photographed square-on from the doorway, the mural covering the far end wall, a light oak meeting table with six modern chairs in the foreground, a wall-mounted video conferencing screen and camera bar to one side of the mural, glass partition wall, even soft daylight with no harsh highlights on the mural, no signage or lettering on the wall" },
  { key: "phonebooth", label: "Phone booths & focus pods", frame: "portrait", collection: "office-wallpaper", roomTags: ["Office", "Office: Phone Booth"], spaceCategory: "Office & Corporate",
    room: "a single-person acoustic phone booth pod inside a modern office, photographed straight into the open glass door, the mural covering the tall narrow back panel of the booth interior, a small ledge desk and a high stool, a slim pendant downlight inside the pod, the surrounding office softly out of focus, the mural read as one continuous tall portrait panel" },
  { key: "openplan", label: "Open plan & workstations", collection: "office-wallpaper", roomTags: ["Office", "Office: Workstations"], spaceCategory: "Office & Corporate",
    room: "a bright open plan office floor, the mural running along a long side wall behind a row of bench desks with monitors and ergonomic chairs, a few potted plants, suspended linear lighting, the wall seen at a slight angle so its length is legible" },
  { key: "corridor", label: "Corridors & breakout", collection: "office-wallpaper", roomTags: ["Office", "Office: Corridor"], spaceCategory: "Office & Corporate",
    room: "a corporate office circulation corridor leading to a lift lobby, the mural running the full length of one wall, polished concrete floor, recessed ceiling lights, a bench and a plant at the far end, the corridor seen in one-point perspective so the mural recedes" },
  { key: "cafeteria", label: "Cafeteria & pantry", collection: "office-wallpaper", roomTags: ["Office", "Office: Cafeteria"], spaceCategory: "Office & Corporate",
    room: "a warm modern office cafeteria, the mural as the feature wall behind long communal tables with bentwood chairs and banquette seating, a coffee counter to one side, pendant lights, plants, relaxed daylight" },
  // A lift car is the one wall in a building that is looked at by everybody,
  // at arm's length, several times a day, with nothing else to do — and it is
  // almost always a blank steel panel. It gets TWO framings because the panel
  // and the bank are two different sales.
  //
  // The car interior is the design's own hero shot: portrait, because the back
  // wall of a lift is a tall narrow panel and a landscape frame would spend
  // most of itself on the lobby stone either side of it.
  { key: "lift", label: "Lift interiors", frame: "portrait", collection: "office-wallpaper", roomTags: ["Office", "Office: Lift"], spaceCategory: "Office & Corporate",
    room: "the interior back wall of a lift car in a luxury building, photographed square-on from the lobby straight through the fully open doors, the mural covering the tall panel on the back wall of the car from the handrail up, dark bronze door frame and reveal around the opening, a slim brushed bronze handrail across the panel, warm concealed cove light in the car ceiling, honed stone lobby floor in the foreground, calm warm evening light, no signage, no floor numbers and no lettering anywhere" },
  // The lift LOBBY: the shot that sells a set. The centre car is open with the
  // design in it; the cars either side stay closed, because inventing what is
  // on their panels would be inventing designs the customer has not seen.
  { key: "liftlobby", label: "Lift lobby (bank of three)", roomTags: ["Office", "Office: Lift"],
    room: "the lift lobby of a luxury building seen straight-on, three tall bronze-framed lift portals in a row across a honed stone wall, the CENTRE lift standing fully open with the mural covering the tall back panel of its car, the outer two lifts closed with plain dark bronze doors, a slim bronze handrail inside the open car, warm cove lighting above the portals, polished stone floor, calm warm evening light, no signage, no floor numbers and no lettering anywhere" },
  // DOUBLE HEIGHT IS THE WHOLE PITCH, so the prompt has to say so. The first
  // renders off this scenario came back as ordinary single-storey rooms, which
  // quietly contradicted the page selling them: /hospitality/hotel-lobby leads
  // on "it has to read at double height — lobby walls often run twelve,
  // fourteen, eighteen feet floor to ceiling… a wall a guest looks up at."
  // A render at domestic ceiling height sells the opposite of that.
  //
  // Height does not survive as an adjective. "Grand" and "luxurious" were
  // already there and produced a normal ceiling, because nothing in the frame
  // could be measured. So it is pinned three ways at once: the storey height in
  // metres, a camera far enough back and low enough to keep the top of the wall
  // in shot, and a piece of architecture at the upper level — a mezzanine edge,
  // a tall window — that a viewer reads as a second floor. Scale needs
  // something to be measured AGAINST.
  //
  // The counter is deliberately pushed down the frame too. In the first pair it
  // ate the bottom third of the artwork, taking the horses' legs with it, which
  // is a poor way to show a mural you are selling by the square foot.
  { key: "hotellobby", label: "Hotel lobby & reception", collection: "hotels", roomTags: ["Hotel Lobby & Reception"], spaceCategory: "Hospitality",
    room: "the double-height lobby of a luxurious hotel, photographed straight-on from far enough back and from a low vantage so the FULL height of the wall is in frame from floor to ceiling, the ceiling a clear two storeys up — roughly five metres — and the mural running unbroken all the way up that wall as one continuous piece at true architectural scale, a mezzanine walkway edge or slender full-height window visible to one side at the upper level so the storey height is unmistakable, a low stone reception counter standing forward of the wall and occupying only the bottom fifth of the frame so the artwork reads almost its whole height, low designer lounge seating kept small and to the sides, a slender pendant hanging high in the volume and well clear of the centre of the mural, polished marble floor, warm evening lighting, no signage or lettering on the wall" },
  // THE THREE DINING SCENES. `cafe` used to be one chip called "Cafés &
  // restaurants" and was asked to stand for all three rooms below. It cannot:
  // a café is a daylight room read at a forearm's length over a flat white,
  // a restaurant is an evening room read across a dressed table, and a fine
  // dining room is a dark room where the wall is the only thing lit. One
  // prompt averaging the three produced a café for every brief — which is why
  // the hospitality hub had no restaurant edit to show at all.
  //
  // `cafe` is therefore NARROWED to cafés only. It keeps its `cafes-restaurants`
  // collection handle deliberately — the URL is indexed and the 24 designs
  // already rendered into it are cafés, not restaurants — while the tag and
  // title it carries are renamed to plain "Cafés" (see the migration in
  // supabase/migrations). Do not "fix" the handle to match the tag.
  { key: "cafe", label: "Cafés", collection: "cafes-restaurants", roomTags: ["Cafés"], spaceCategory: "Hospitality",
    room: "a chic contemporary café interior, the mural as the feature wall along a row of banquette seating with small marble tables, bentwood chairs, warm pendant lights and a plant or two, bright daylight from a shopfront window" },
  { key: "restaurant", label: "Restaurants", collection: "restaurants", roomTags: ["Restaurants"], spaceCategory: "Hospitality",
    room: "the dining room of a busy mid-market restaurant, the mural as the feature wall behind a long run of upholstered banquette seating, tables laid for service with linen, water glasses and a small vase each, timber chairs on the far side, warm pendant lighting hung low over the tables, early evening light" },
  { key: "finedining", label: "Fine dining", collection: "fine-dining", roomTags: ["Fine Dining"], spaceCategory: "Hospitality",
    room: "the dining room of a luxury fine dining restaurant, the mural as the lit statement wall behind widely spaced tables dressed in white linen, high-backed upholstered dining chairs, cut glassware and a single low candle on each table, a sculptural chandelier above, dark polished floor, low warm evening light with the wall the brightest thing in the room, no signage or lettering on the wall" },
  // ---- the /real-estate section: a developer's common areas ---------------
  // These are the walls a builder hands over, not the ones a family chooses:
  // the entrance lobby, the lift lobby on every floor, and the clubhouse.
  // They are all read by the SAME people, several times a day, for years —
  // which is why every prompt below is written for restraint rather than
  // impact. A lobby mural that impresses on move-in day and irritates by
  // month three is a warranty call, not a sale.
  //
  // TWO LESSONS FROM THE EXISTING SCENES ARE BAKED IN HERE.
  //
  // Height, from `hotellobby`: a residential lobby is usually double-height
  // too, and "grand" as an adjective produced ordinary ceilings until the
  // storey height was pinned in metres with a piece of upper-level
  // architecture to measure it against. Same three-way pin is used below.
  //
  // Foreground, from the occlusion guard: a gym is full of equipment and a
  // games room is mostly pool table. Those objects will happily stand in
  // front of the artwork and get the render rejected, so each prompt states
  // where the furniture sits — low, to the sides, or forward of a wall that
  // still reads its full height.
  { key: "resilobby", label: "Residential entrance lobby", collection: "residential-entrance-lobby", roomTags: ["Residential Entrance Lobby"], spaceCategory: "Residential Amenities",
    room: "the entrance lobby of a premium residential tower, photographed straight-on from far enough back and from a low vantage that the FULL height of the wall is in frame floor to ceiling, the ceiling a clear two storeys up — roughly five metres — and the mural running unbroken up that wall as one continuous piece at true architectural scale, a mezzanine edge or slender full-height window to one side at the upper level so the storey height is unmistakable, a low stone concierge desk standing forward of the wall and occupying only the bottom fifth of the frame, a pair of quiet lounge chairs and a planter kept small and to the sides, honed stone floor, calm warm daylight, restrained and residential rather than corporate, no signage or lettering on the wall" },
  { key: "resiliftlobby", label: "Lift lobbies", collection: "residential-lift-lobby", roomTags: ["Residential Lift Lobby"], spaceCategory: "Residential Amenities",
    room: "the lift lobby on a residential floor of an apartment building seen straight-on, a pair of closed lift doors in a dark bronze portal to one side, the mural covering the facing wall opposite the lifts as one continuous piece from skirting to ceiling, a slim console with a vase beneath it occupying only the bottom fifth of the frame, a apartment entrance door visible at the edge, warm recessed downlights, polished stone floor, a calm domestic scale rather than a hotel one, no signage, no floor numbers and no lettering anywhere" },
  { key: "banquet", label: "Banquet & party hall", collection: "banquet-party-hall", roomTags: ["Banquet & Party Hall"], spaceCategory: "Residential Amenities",
    room: "the banquet and party hall of a residential clubhouse, photographed as a large OPEN room with a clear empty floor and no dining tables set, the mural covering the full end wall of the hall as one continuous piece from floor to ceiling with nothing standing in front of it, the ceiling high — roughly four metres — with a row of slim pendants hung well above head height, a stacked run of chairs and a slim buffet console kept far to one side and low in the frame, a polished floor reflecting the wall, warm even evening light, restrained and elegant rather than decorative, no signage or lettering on the wall" },
  { key: "kidsplay", label: "Kids' play space", collection: "kids-play-space", roomTags: ["Kids' Play Space"], spaceCategory: "Residential Amenities",
    room: "the indoor children's play room of a residential clubhouse, the mural covering the long wall behind a soft play area, foam mats and a low padded step in the foreground kept below the bottom third of the frame so the wall reads its full height, a shelf of wooden toys and a beanbag to one side, a low bench for parents against the side wall, bright even daylight from a window out of frame, cheerful but calm rather than primary-coloured, no signage or lettering on the wall" },
  { key: "gym", label: "Gym", collection: "gym-fitness", roomTags: ["Gym & Fitness"], spaceCategory: "Residential Amenities",
    room: "the gym of a residential clubhouse, the mural covering the full end wall of the room as one continuous piece with the floor clear in front of it, treadmills and a weights rack kept along the SIDE walls and out of the centre of the frame so nothing stands in front of the artwork, a full-height mirror on the opposite side wall, rubber flooring, bright even daylight, calm and adult rather than neon or industrial, no signage, no branding and no lettering on the wall" },
  { key: "discussion", label: "Discussion & co-working", collection: "discussion-co-working", roomTags: ["Discussion & Co-working"], spaceCategory: "Residential Amenities",
    room: "the residents' work and discussion lounge of a residential clubhouse, the mural covering the wall behind a long shared table with a few comfortable chairs, the table set low and forward so the wall reads almost its full height, a soft armchair and a floor lamp to one side, a low shelf of books, warm daylight from a window out of frame, quiet and domestic rather than corporate, no signage or lettering on the wall" },
  { key: "gamesroom", label: "Games room", collection: "games-room", roomTags: ["Games Room"], spaceCategory: "Residential Amenities",
    room: "the indoor games room of a residential clubhouse, the mural covering the full wall along one side of the room, a pool table standing PARALLEL to that wall and set forward and low in the frame so it occupies only the bottom third and the artwork reads its full height behind it, a pair of low pendant lights hung over the table and well clear of the centre of the mural, a carrom board on a side table and two chairs at the far end, warm focused light over the table with the wall evenly lit, no signage or lettering on the wall" },
  // ---- promoted from the Shorelight commissioned project ------------------
  // These six began as project-scoped scenes (see studio-projects.ts) and
  // graduated when the real-estate store grew spaces for them. The prompts
  // were written building-agnostic from the start; promotion is what gives
  // them collections, tags and a place in the ordinary picker. The Shorelight
  // renders already in the catalogue carry these keys — the scene_key values
  // on those product_images were renamed in the same pass that added these.
  { key: "grandstair", label: "Grand staircase", frame: "portrait", collection: "grand-staircase", roomTags: ["Grand Staircase"], spaceCategory: "Residential Amenities",
    room: "the grand staircase of a luxury residential lobby, a sweeping curved stair with a dark bronze handrail rising through a double-height volume — the ceiling a clear two storeys up, roughly six metres — the mural covering the tall curved wall that follows the stair from the ground floor up past the landing as ONE continuous artwork climbing with the steps, photographed from the lobby floor with the full height of the wall in frame, the stair's underside and a quiet under-stair niche visible below, nothing standing against the mural wall, honed stone floor, soft high daylight, no signage or lettering anywhere" },
  { key: "clubentrance", label: "Clubhouse entrance", collection: "clubhouse-entrance", roomTags: ["Clubhouse Entrance"], spaceCategory: "Residential Amenities",
    room: "the entrance of a residential clubhouse seen straight-on through a wide arched threshold, the mural covering the facing wall inside as one continuous piece from floor to ceiling, a low console with a sculptural vase occupying only the bottom fifth of the frame, the arch framing the composition, warm daylight falling from one side, polished stone floor, no signage or lettering anywhere" },
  { key: "clublounge", label: "Residents' lounge", collection: "residents-lounge", roomTags: ["Residents' Lounge"], spaceCategory: "Residential Amenities",
    room: "the residents' lounge of a luxury residential clubhouse, the mural covering the full feature wall behind a composed arrangement of low lounge seating — a curved sofa and two armchairs kept low and forward so the wall reads almost its full height — a round coffee table and a floor lamp to one side, soft daylight from tall windows out of frame, calm and residential rather than hotel-like, no signage or lettering on the wall" },
  { key: "clublibrary", label: "Clubhouse library", collection: "clubhouse-library", roomTags: ["Clubhouse Library"], spaceCategory: "Residential Amenities",
    room: "the library of a residential clubhouse, the mural covering the wall above and beside built-in shelves of neatly kept books that stay below the bottom third of the frame, a deep reading chair and a small table with a reading lamp set to one side, the room dim and calm with the mural the most evenly lit thing in it, no signage or lettering anywhere" },
  { key: "poolside", label: "Indoor pool", collection: "poolside", roomTags: ["Poolside"], spaceCategory: "Residential Amenities",
    room: "the indoor pool of a luxury residential building, the still water running toward the full end wall which the mural covers as one continuous piece from floor to ceiling, its reflection carried in the pool, a pair of loungers kept low at one side, soft high daylight from clerestory glazing, nothing standing in front of the wall, no signage or lettering anywhere" },
  { key: "rooftoplounge", label: "Rooftop lounge", collection: "rooftop-sky-lounge", roomTags: ["Rooftop & Sky Lounge"], spaceCategory: "Residential Amenities",
    room: "the covered rooftop lounge of a luxury residential tower, the mural covering the solid rear wall of an open-sided pavilion, low outdoor seating kept to the sides, open sky and a distant sea horizon visible beyond the pavilion edge, soft late-afternoon coastal light, nothing standing in front of the wall, no signage or lettering anywhere" },
  // The final three graduates from Shorelight — with these, every scene the
  // programme wrote now has a store shelf, and the project's own list is
  // empty by design (see studio-projects.ts).
  { key: "wellnessroom", label: "Residential wellness", collection: "residential-wellness", roomTags: ["Residential Wellness"], spaceCategory: "Residential Amenities",
    room: "the spa lounge of a residential clubhouse, the mural covering the wall behind a low daybed dressed with folded pale towels and a small stone bowl, mist-soft diffused light, near-monochrome calm styling with everything kept low so the wall reads its full height, no signage or lettering anywhere" },
  { key: "resicorridor", label: "Apartment corridor", collection: "residential-corridor", roomTags: ["Residential Corridor"], spaceCategory: "Residential Amenities",
    room: "the lift-to-apartment corridor on a residential floor seen in one-point perspective, the mural running the full length of one wall from skirting to ceiling, an apartment entrance door in dark bronze at the far end, warm recessed downlights, a calm domestic scale, no signage, no floor numbers and no lettering anywhere" },
  { key: "salesgallery", label: "Sales gallery", collection: "sales-gallery", roomTags: ["Sales Gallery"], spaceCategory: "Residential Amenities",
    room: "the sales gallery of a luxury residential development, the mural running as one very long continuous band along the main wall, a clean empty presentation plinth standing low at the centre of the room and well forward of the wall, a few designer chairs kept far to the sides, polished floor, gallery-calm even light with the wall clearly the subject, no signage, no branding and no lettering anywhere" },

  // ---- the /retail section ------------------------------------------------
  // A retail wall's job is to make the MERCHANDISE look better, so every
  // prompt below puts stock in the frame and keeps the wall behind it. The
  // fitting room is the deliberate exception: it is the one wall in a shop
  // read directly, alone, at arm's length, at the moment somebody decides to
  // buy — so it is framed as a small box, not a floor.
  { key: "fittingroom", label: "Fitting & trial rooms", frame: "portrait", collection: "fitting-trial-rooms", roomTags: ["Fitting & Trial Rooms"], spaceCategory: "Retail",
    room: "the interior of a fitting room cubicle in a fashion store, photographed straight into the open curtain, the mural covering the tall back wall of the cubicle from floor to ceiling, a full-length mirror on the side wall reflecting a sliver of the artwork, a small bench and two brass hooks with a garment hanging, warm flattering downlight, the cubicle read as one continuous tall panel about a metre and a half wide, no signage or lettering on the wall" },
  { key: "billing", label: "Checkout & billing counter", collection: "checkout-billing", roomTags: ["Checkout & Billing"], spaceCategory: "Retail",
    room: "the checkout counter of a contemporary shop seen straight-on from the customer side, the mural covering the full wall BEHIND the counter from the counter top up to the ceiling, a clean low counter with a till and a card machine occupying only the bottom third of the frame, a shelf of folded bags behind, warm even retail lighting, no signage, no logo and no lettering anywhere on the wall" },
  { key: "showroom", label: "Showrooms", collection: "showrooms", roomTags: ["Showrooms"], spaceCategory: "Retail",
    room: "a large furniture and appliance showroom interior, the mural covering a long uninterrupted back wall at true architectural scale with the floor clear in front of it, a single sofa and a low table displayed well forward and small in the frame so the wall reads its full width and height, track lighting angled at the product, polished floor, the room a clear four metres tall, no signage or lettering on the wall" },
  { key: "boutique", label: "Boutique & jewellery", collection: "boutique-jewellery", roomTags: ["Boutique & Jewellery"], spaceCategory: "Retail",
    room: "the interior of a small luxury jewellery boutique, the mural covering the wall behind a low glass display case, two upholstered chairs at a small consultation table set forward and low in the frame, warm directional spotlights, brass and walnut joinery to one side, the wall read at close range as a quiet textured field, no signage or lettering on the wall" },

  // ---- the /hospitals section ---------------------------------------------
  // Written plainer than any other block here on purpose. These rooms are read
  // by people at the worst week of their life and by staff on long shifts, so
  // the prompts describe real clinical rooms rather than reaching for warmth:
  // real services on the headwall, real equipment, real lighting. A render
  // that quietly turns a ward into a boutique hotel would misrepresent what we
  // are selling to a buyer who will notice immediately.
  { key: "hospitalwaiting", label: "Reception & waiting", collection: "hospital-reception-waiting", roomTags: ["Hospital Reception & Waiting"], spaceCategory: "Healthcare",
    room: "the waiting area of a modern private hospital, the mural covering the long wall behind a run of low upholstered waiting chairs, the chairs set forward and occupying only the bottom third of the frame so the wall reads its full height, a reception desk visible to one side, vinyl flooring, bright even clinical daylight, calm and well-kept rather than luxurious, no signage or lettering on the wall" },
  { key: "patientroom", label: "Patient rooms & wards", collection: "patient-rooms-wards", roomTags: ["Patient Rooms & Wards"], spaceCategory: "Healthcare",
    room: "a single patient room in a modern hospital photographed from the foot of the bed, the mural covering the wall the patient faces with the bed set low in the frame, a hospital bed with clean white linen, a bedside cabinet and a visitor chair, a medical services rail on the opposite headwall, vinyl flooring, soft even daylight from a window out of frame, clinical and calm, no signage or lettering on the wall" },
  { key: "consultation", label: "Consultation rooms", collection: "consultation-rooms", roomTags: ["Consultation Rooms"], spaceCategory: "Healthcare",
    room: "a small hospital consulting room, the mural covering the wall behind a plain desk with a monitor and two chairs facing it, an examination couch with a paper roll against the side wall, a hand sanitiser dispenser by the door, bright even clinical lighting, the room modest in scale, no signage or lettering on the wall" },
  { key: "paediatric", label: "Paediatrics & children's wards", collection: "paediatrics-childrens-wards", roomTags: ["Paediatrics & Children's Wards"], spaceCategory: "Healthcare",
    room: "a children's ward bay in a modern hospital, the mural covering the long wall behind two low children's beds with soft bedding, a parent's armchair beside one bed, a small toy box and a low shelf, bright even daylight, cheerful and warm but still recognisably a clinical room, no cartoon characters, no signage and no lettering on the wall" },
  { key: "hospitalcorridor", label: "Corridors & circulation", collection: "hospital-corridors", roomTags: ["Hospital Corridors"], spaceCategory: "Healthcare",
    room: "a hospital circulation corridor seen in one-point perspective so the wall recedes along its length, the mural running the full length of one wall above a protective crash rail, vinyl flooring, a handrail on the opposite wall, doors to rooms at intervals, bright even clinical lighting, no signage, no room numbers and no lettering anywhere" },
  { key: "diagnostics", label: "Diagnostics & imaging", collection: "diagnostics-imaging", roomTags: ["Diagnostics & Imaging"], spaceCategory: "Healthcare",
    room: "a hospital imaging suite, the mural covering the wall the patient faces from the scanner table, a CT or MRI scanner set to one side and low in the frame so the wall reads its full height, a padded patient table, recessed cove lighting, clean clinical flooring, calm and low-glare, no signage or lettering on the wall" },

  { key: "retail", label: "Shop floor & feature wall", collection: "retail-showroom-spaces", roomTags: ["Retail & Showroom Spaces"], spaceCategory: "Retail",
    room: "an upmarket retail showroom interior, the mural as the backdrop wall behind a minimal display plinth and a slim rail of merchandise, track lighting, polished floor, no signage or lettering on the wall" },
  { key: "spa", label: "Wellness & spa", collection: "wellness-spa-interiors", roomTags: ["Wellness & Spa Interiors"], spaceCategory: "Hospitality",
    room: "a tranquil spa treatment room, the mural on the wall behind a neatly dressed massage bed with folded white towels, a stone bowl of pebbles, a candle and soft diffused light" },
  { key: "library", label: "Library / reading corner", collection: "library-reading-corners", roomTags: ["Library & Reading Corners"], spaceCategory: "Residential",
    room: "a calm reading corner, the mural on the wall beside a low bookshelf of neatly stacked books, a deep armchair with a cushion, a side table and a reading lamp, soft afternoon light" },
  { key: "hostel", label: "College hostel room", collection: "college-hostel-room", roomTags: ["College Hostel Room"], spaceCategory: "Education & Institutional",
    room: "a compact college hostel room, the mural as the feature wall behind a single bed with a casual throw, a small study desk with books and a laptop, a string of warm fairy lights and a folding chair" },
  { key: "mediaroom", label: "Entertainment / media room", collection: "entertainment-media-room", roomTags: ["Entertainment & Media Room"], spaceCategory: "Residential",
    room: "a moody home entertainment room, the mural as the side feature wall beside a deep sectional sofa with cushions, a low console, subtle cove lighting and dimmed warm light" },

  // The ceiling range's own scene. Every OTHER scenario names a room and lets
  // the ceiling tag flip where the mural lands (see scenarioPrompt's `ceiling`
  // branch), which is right for a room shot but leaves the design read at an
  // angle, half-hidden behind a sofa. A ceiling design's honest hero shot is
  // the one you get by standing under it and looking straight up, so it gets a
  // framing of its own rather than borrowing a living room's.
  //
  // It carries the "Ceiling Wallpaper" tag, so generating this scene also files
  // the design into the ceiling collection — same bargain as the room scenes.
  { key: "ceiling", label: "Ceiling", collection: "ceiling-wallpaper", roomTags: ["Ceiling Wallpaper"], spaceCategory: "Residential",
    room: "a calm, well-proportioned room photographed straight upward from directly beneath the centre of its ceiling, the ceiling filling the frame square-on and symmetrically with only a shallow band of the plain upper walls and cornice visible at the edges for scale" },

  // ---- extra framings with no collection of their own ----
  { key: "bedroomduo", label: "Bedroom (two walls)", roomTags: ["Bedroom"],
    room: "a lovely serene bedroom where the mural covers two adjoining walls, wrapping the corner seamlessly — the headboard wall and the side wall — behind an upholstered bed with crisp neutral bedding and warm bedside lamps" },
  { key: "hallway", label: "Stairway", roomTags: ["Foyer"],
    room: "a modern stairway wall, the mural running full height beside the staircase" },
  { key: "passage", label: "Passage", roomTags: ["Foyer"],
    room: "a long elegant passage/corridor in a home, the mural running the full length of one wall, a narrow runner rug on the floor, a slim wall light and a doorway at the far end in correct perspective" },
  { key: "laundry", label: "Laundry room",
    room: "a lovely bright laundry room, the mural on the wall above a counter with a neatly built-in washer and dryer, open shelves with folded linens, woven baskets and a small plant, fresh daylight" },
  { key: "powder", label: "Powder room",
    room: "a chic powder room, the mural on the wall behind a floating vanity with a round mirror" },
  { key: "bathroom", label: "Bathroom",
    room: "a bathroom, the mural running full height on the wall beside a freestanding tub or a walk-in shower with a slim glass screen, a wall-hung basin and a tall mirror" },
  { key: "closeup", label: "Detail shot",
    room: "a close, slightly angled interior detail shot of the mural on the wall meeting a styled corner with a plant and a stool" },

  // Two framings for CANVAS WALL ART, which is hung as a piece rather than
  // pasted as a wall. Both deliberately carry no `collection`, and `gallerywall`
  // carries no roomTags at all: a museum wall is not a room anybody lives in,
  // and filing a devotional canvas into "Living Room" on the strength of its
  // hero shot would merchandise it into the wrong shelf. `foyerconsole` does
  // claim Foyer, because an entrance hall genuinely is where these hang.
  //
  // `foyerconsole` exists alongside `entryway` rather than replacing it: the
  // entryway prompt puts the artwork BESIDE the console, which is right for a
  // full-wall mural and wrong for a framed piece. This one hangs it above.
  { key: "gallerywall", label: "Gallery wall",
    room: "a museum gallery wall — a broad plain off-white wall lit by track lighting from above, a low pale bench set back on a polished concrete floor, the piece hung alone and centred at eye level with generous empty wall around it, no other artwork, no signage and no lettering anywhere" },
  { key: "foyerconsole", label: "Entrance foyer (above console)", roomTags: ["Foyer"], spaceCategory: "Residential",
    room: "a boutique entrance foyer, the piece centred on the wall directly ABOVE a slim console table so the console sits beneath it — a vase of stems, a small lamp and a shallow tray on the console, a runner underfoot, warm daylight from one side" },
];

export const SCENARIO_BY_KEY = new Map(SCENARIOS.map((s) => [s.key, s]));

/** Which room-collection tags each scene applies. Kept for direct key lookup. */
export const SCENE_ROOM_TAGS: Record<string, string[]> = Object.fromEntries(
  SCENARIOS.filter((s) => s.roomTags?.length).map((s) => [s.key, s.roomTags!]),
);

/** A safe minimum so a stingy/odd Claude response never leaves a design bare. */
export const DEFAULT_SCENES = ["living", "bedroom", "closeup"];

/**
 * Caps on how many rooms one design gets rendered into. The AI's own pick stays
 * tight to bound image spend; a deliberate hand-picked set is allowed to go
 * wider, because someone chose to spend it.
 */
export const MAX_AI_SCENES = 5;
export const MAX_PICKED_SCENES = 8;

/** Keep only real scene keys, de-duplicated, order preserved, capped.
 *  `extraKeys` is how a commissioned project's namespaced scenes get through
 *  (see studio-projects.ts) — absent, the global vocabulary is the whole of
 *  what's valid, exactly as before. */
export function normaliseSceneKeys(input: unknown, max = MAX_PICKED_SCENES, extraKeys?: ReadonlySet<string>): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.map(String).filter((k) => SCENARIO_BY_KEY.has(k) || extraKeys?.has(k)))).slice(0, max);
}

/**
 * Motifs that name a design after an Indo-Islamic dynasty, court or monument.
 *
 * The design itself is usually fine and sells perfectly well — this is not about
 * the ornament, which is shared heritage. It is about the NAME sitting under a
 * photograph of somebody's mandir. A customer shopping for a puja room reads the
 * name before they read the picture, and "Mughal Medallion" over a shrine is a
 * jarring thing to be sold. Taj is worse than it looks: the Taj Mahal is a tomb.
 *
 * The scene picker cannot be trusted to know this on its own. It is asked to
 * treat "sacred geometry" as devotional, and a symmetrical jewel-toned medallion
 * is sacred geometry to any classifier — which is exactly how a Mughal ceiling
 * rose ended up rendered as the wall behind a mandir.
 */
const NON_POOJA_MOTIFS = [
  "mughal", "taj", "tajmahal", "mumtaz", "nizam", "sultan", "sultana", "badshah",
  "minar", "minaret", "mosque", "masjid", "islamic", "persian", "arabesque",
  "moorish", "ottoman", "safavid", "harem", "jali", "jaali",
  // A mehrab (mihrab) is the niche in a mosque wall that faces Mecca. "Mehrab
  // Kamal" — a lotus border, lovely in itself — was sold as the wall behind a
  // mandir under that name until 26 September 2026.
  "mehrab", "mihrab",
];

/**
 * Word-boundary matched, and that matters more than it looks: the trap here is
 * substrings. "Pushpanjali" contains "jali" and is a Sanskrit offering of
 * flowers — about the most puja-room name in the whole catalogue. Matching it
 * would ban the very design the room exists for.
 */
const NON_POOJA_RE = new RegExp(`\\b(${NON_POOJA_MOTIFS.join("|")})\\b`, "i");

/**
 * Motifs that name a design after gambling or a deck of playing cards.
 *
 * Same failure as the Mughal one, from the other direction. TAASH is aged
 * card-table paper — aces, suits, a worn playing surface — and to a vision
 * model an ace of spades on cream limestone is an ornate symmetrical emblem on
 * a devotional-looking ground. Three of them were classified straight into the
 * Pooja Room collection. But a puja room is a shrine and cards are a vice in
 * exactly the households that shop for one; the ace of spades over somebody's
 * mandir is not a near miss, it is an insult.
 *
 * Hindi is the important half here: a classifier reasoning in English sees
 * nothing at all in "Ikka", "Hukum" or "Bisaat".
 */
const NON_POOJA_PLAY = [
  "taash", "ikka", "hukum", "chidi", "eent", "bisaat", "patta", "pattey",
  "joker", "casino", "poker", "rummy", "blackjack", "roulette", "jackpot",
  "gamble", "gambling", "wager", "betting", "ace of spades", "playing card",
  "playing cards", "card table",
];
const NON_POOJA_PLAY_RE = new RegExp(`\\b(${NON_POOJA_PLAY.join("|")})\\b`, "i");

/**
 * Collection tags that bar a design from puja rooms whatever it is called.
 *
 * A name list can only ever catch the designs whose name gives them away, and
 * the one that got furthest was "Dhoop" — incense, the most puja-room word in
 * the collection, sitting on a sheet of club symbols. No rule that reads names
 * will ever stop that one. What it belongs to is the fact that decides it: the
 * whole of TAASH is a deck of cards, so nothing in TAASH goes into a shrine.
 *
 * This is why the guard takes the design's tags and not just its title.
 */
const NON_POOJA_COLLECTION_TAGS = ["TAASH"];

/**
 * Style tags that are as wrong as the room itself on a barred design. "Pooja
 * Room" is what merchandises it into the collection; "Spiritual" is what makes
 * it answer a devotional search, which is the same sale by another door.
 */
export const POOJA_TAGS = ["Pooja Room", "Spiritual"];

/** Whether a design may be offered as puja-room imagery.
 *
 *  Judged by name, and — when the caller knows them — by the design's tags, so
 *  a collection that is categorically wrong for a shrine is barred as a whole
 *  rather than one give-away name at a time. */
export function allowsPoojaScene(name: string, tags?: readonly string[]): boolean {
  if (tags?.some((t) => NON_POOJA_COLLECTION_TAGS.includes(t))) return false;
  return !NON_POOJA_RE.test(name ?? "") && !NON_POOJA_PLAY_RE.test(name ?? "");
}

/**
 * Drop the puja room and the devotional style tag from a set of tags a
 * classifier just proposed for a barred design.
 *
 * The scene choke point below is not enough on its own, and that is the whole
 * lesson of the TAASH designs: they were never rendered by the Studio at all.
 * They were seeded with their renders already made, so the only thing that ever
 * classified them was the retag repair pass — which writes room tags directly
 * and never went near the scene picker. Rendering is one way into the Pooja
 * Room collection; tagging is the other, and it needed the same lock.
 *
 * `ownTags` is the design's EXISTING tags — the collection tag lives there, not
 * in the handful of browse words a classifier just came back with.
 */
export function stripPoojaTags(tags: string[], name: string, ownTags: readonly string[] = tags): string[] {
  if (allowsPoojaScene(name, ownTags)) return tags;
  return tags.filter((t) => !POOJA_TAGS.includes(t));
}

/**
 * Drop `pooja` from a scene list when the name forbids it.
 *
 * This is the single choke point for the rule, because generating a scene is
 * also what applies that room's tag — so a design that never gets the render
 * never gets merchandised into the Pooja Room collection either. Deleting the
 * image afterwards would leave the tag, and the design would go on selling
 * into puja rooms with a different picture on it.
 */
export function stripPoojaForMotif(scenes: string[], name: string, tags?: readonly string[]): string[] {
  if (allowsPoojaScene(name, tags)) return scenes;
  return scenes.filter((k) => k !== "pooja");
}

/**
 * The STYLING REGISTER — how the room is dressed, kept deliberately separate
 * from WHICH room it is. Every `room` string above describes a space; none of
 * them describes a taste. That split is what lets one design be shown in a
 * bold bathroom and another in a calm one without writing two scenarios for
 * every space.
 *
 * "calm" is the house style and everything rendered before this existed was in
 * it. It is the right register for most of the catalogue and stays the default.
 * "bold" exists because some artwork is a statement and a soft residential
 * render actively undersells it: a big graphic motif photographed against
 * linen and warm lamplight reads as timid, not premium.
 * "gallery" exists because a Limited Edition piece isn't sold as decor for a
 * room — it's sold as a work of art, of which five exist. Showing it above a
 * sofa says "wallpaper"; showing it on a gallery wall under a spotlight says
 * "collectible." It is the default register for anything tagged Limited
 * Edition, and available by hand pick for anything else that earns it.
 */
export type StylingKey = "calm" | "bold" | "gallery";

export const STYLINGS: { key: StylingKey; label: string; note: string }[] = [
  { key: "calm", label: "Calm", note: "Soft, natural, residential — the house style, right for most designs." },
  { key: "bold", label: "Bold", note: "Editorial: one saturated statement piece, hard light, no beige. For artwork that shouts." },
  { key: "gallery", label: "Gallery", note: "Museum walls, track light, a bench — the piece as art, not decor. Default for Limited Edition." },
];

export const STYLING_KEYS = STYLINGS.map((s) => s.key);

export function isStylingKey(v: unknown): v is StylingKey {
  return typeof v === "string" && (STYLING_KEYS as string[]).includes(v);
}

/**
 * Product tags that mean "this artwork is a statement piece", so an existing
 * design already carries the answer and doesn't have to be re-judged. `Mood:
 * Dramatic` is what the vision pass writes; `Bold` and `Dark` come from the
 * tag vocabulary and mean the same thing for framing purposes.
 */
const BOLD_TAGS = new Set(["mood: dramatic", "bold", "dark"]);
/** A design tagged Limited Edition defaults to the gallery register — it's
 *  sold as one of five, not as decor, and should be shown that way. */
const GALLERY_TAGS = new Set(["limited edition"]);

/** The register a design defaults to, read off the tags it already carries.
 *  Gallery wins over bold — a dramatic Limited Edition piece is still a
 *  collectible first. */
export function stylingFromTags(tags: string[] | null | undefined): StylingKey {
  const norm = (tags ?? []).map((t) => t.trim().toLowerCase());
  if (norm.some((t) => GALLERY_TAGS.has(t))) return "gallery";
  if (norm.some((t) => BOLD_TAGS.has(t))) return "bold";
  return "calm";
}

// The bold register has to fight the room descriptions themselves — most of
// them name "warm lamp light", "neutral linen", "soft daylight" inline, because
// they were written when calm was the only register there was. Rewriting all
// 27 to be taste-neutral would change every calm render already in the
// catalogue, so the directive explicitly outranks them instead.
const BOLD_DIRECTIVE =
  `STYLING — this is a BOLD EDITORIAL interior, not a soft residential one. Where this conflicts with any ` +
  `calm/neutral/linen/warm-lamp/soft-daylight wording in the description of the space, THIS WINS: keep the kind ` +
  `of space, replace how it is dressed. ` +
  `Palette: take the artwork's most saturated colour and put it into ONE hard-edged statement object — a lacquered ` +
  `console, a single sculptural chair, a painted arch — instead of matching the room to the artwork. Everything ` +
  `else stays severe: black, charcoal, chrome, oxblood, deep green, raw stone, high-gloss white. No beige, no ` +
  `cream, no dusty pastels, no wood-and-linen palette. ` +
  `Furniture: few pieces, graphic, hard edges or one exaggerated curve. Nothing cosy — no throw cushions, no ` +
  `fringed rugs, no clutter of small objects. ` +
  `Light: directional and contrasty — hard shadows, a shaft of light, a spotlit object or a single neon accent. ` +
  `Not soft even daylight. ` +
  `Framing: shot like an architectural or fashion editorial — deliberate negative space, one strong diagonal or a ` +
  `hard symmetry. ` +
  `Bold means fewer objects and stronger ones, never busier. `;

// Gallery doesn't dress the room the scenario named — it REPLACES it. A
// Limited Edition piece isn't styled into somebody's living room, it's hung
// the way a five-of-five collectible actually gets hung: on its own wall,
// under its own light, with nothing else competing for the eye.
const GALLERY_DIRECTIVE =
  `STYLING — ignore the space named above entirely and replace it with a high-end contemporary ART GALLERY interior: ` +
  `a single pristine wall, pale plaster or soft white, no visible seams, no other art in frame. Ceiling-mounted ` +
  `track spotlights throw one deliberate pool of light on the piece; the rest of the room falls into soft shadow. ` +
  `Floor is polished concrete or pale rift-cut timber. The wall is otherwise bare — generous negative space on every ` +
  `side of the piece, gallery convention. ` +
  `At most one quiet gallery element may sit in frame: a low bench, a single travertine plinth, or nothing at all. ` +
  `Never home or office furniture — no sofas, beds, desks, rugs, lamps. ` +
  `A slim brass or white acrylic wall label may sit beneath the piece, text illegible/abstract. ` +
  `Light is gallery-grade — cool, even, controlled; no warm domestic lamp glow, no daylight through a window. ` +
  `Shot like museum photography: the piece is the unmistakable subject, framed at eye level with confident headroom, ` +
  `eclectic high-end taste, not a retail showroom. `;

export function scenarioPrompt(
  room: string,
  opts: { clearFocus?: boolean; canvasWallArt?: boolean; ceiling?: boolean; styling?: StylingKey; directive?: string } = {},
): string {
  const focus = opts.ceiling
    // A ceiling has no furniture crossing it — the real occlusion risk is a
    // pendant light or fan hiding the design's centre instead.
    ? `Keep the artwork's main subject and focal point visible — if a light fixture, fan or chandelier hangs from the ceiling, position it toward an edge, never over the centre of the design. `
    : opts.clearFocus
      ? `IMPORTANT: keep all furniture, mirrors, plants and objects low and to the sides. The artwork's main subject and its focal point (such as a face) MUST remain fully visible and completely unobstructed — never cover it with a mirror, frame, lamp or tall object. `
      : `Keep the artwork's main subject and focal point visible — do not place a mirror, tall furniture or objects across the centre of it. `;
  const placement = opts.ceiling
    ? `The supplied artwork is applied as a full-ceiling wallpaper mural on the CEILING of the room, seamless and edge to edge, at true wallpaper scale, seen naturally looking upward in correct perspective. The walls stay in a plain, unremarkable neutral finish and ordinary furniture sits below — nothing on the walls competes with the ceiling, which is clearly the feature. `
    : opts.canvasWallArt
      ? `The supplied artwork is shown as a single elegant canvas print in a slim premium frame, hung as a striking piece of wall art on the wall — not a wallpaper mural, not covering the whole wall, sized naturally for the room. `
      : `The supplied artwork is applied as a full-wall wallpaper mural covering the entire wall, seamless and edge to edge, at true wallpaper scale, in correct perspective. `;
  const bold = opts.styling === "bold";
  const gallery = opts.styling === "gallery";
  return (
    `A photorealistic interior design photograph of ${room}. ` +
    placement +
    // Non-negotiable in every register: styling restyles the ROOM (or, for
    // gallery, replaces it), never the artwork. The moment gpt-image-2 starts
    // "making the mural bolder" the render stops being a picture of the thing
    // we print.
    `Preserve the artwork's exact colours, motifs and style — do not redraw, recolour or distort it. ` +
    // A commissioned project's shell (see studio-projects.ts) sits where the
    // styling directives do, and before them: the building is settled first,
    // then how the room in it is dressed.
    (opts.directive ?? "") +
    (bold ? BOLD_DIRECTIVE : gallery ? GALLERY_DIRECTIVE : "") +
    focus +
    (bold
      ? `Hard directional lighting, deep shadows, fashion-editorial quality, no text, no watermarks.`
      : gallery
        ? `Cool, controlled gallery lighting, soft deliberate shadow, museum-photograph quality, no text, no watermarks.`
        : `Natural lighting, realistic shadows, interior-magazine quality, no text, no watermarks.`)
  );
}
