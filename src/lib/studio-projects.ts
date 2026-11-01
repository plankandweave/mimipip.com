// Commissioned projects — the Studio's answer to "one curated building".
//
// Every scenario in studio-scenes.ts invents its own room: ask for a gym and
// a lift lobby and you get a beautiful gym in one building and a beautiful
// lobby in another. That is right for the catalogue, where each design's
// gallery is its own world — and exactly wrong for a case study, where a
// hundred renders must read as ONE property a visitor could walk through.
//
// A commissioned project pins the building. It carries three things:
//
//   · a SHELL DIRECTIVE — the project's architecture, written once and
//     appended to every scene prompt, so no render can drift into a different
//     building. Same mechanism as the styling registers: the directive
//     explicitly outranks any material a scenario names, because the
//     scenarios were written before projects existed.
//   · a STYLE ANCHOR — one approved render of the shell, sent as the style
//     reference on every scene (generateScene has taken a second reference
//     image since the inspiration-upload feature; a project makes it
//     automatic instead of a per-upload chore). Words hold the architecture;
//     the anchor holds mood, temperature and finish.
//   · PROJECT SCENES — spaces the global picker doesn't have (a grand
//     staircase, a pool lounge, a sales gallery), written in the house
//     prompt discipline and namespaced under the project key so they can
//     never collide with, or leak into, the ordinary picker.
//
// A project render can still use the GLOBAL scenarios (gym, banquet, lift
// lobby…) — resolveScenario falls through to them — and when it does, the
// scene's roomTags apply as usual, so a project design files into the same
// shop-by-space collections as any other. Project-only scenes carry no tags
// until their spaces earn a collection of their own.
//
// Deliberately NOT wired into the overnight batch queue: a commissioned
// render is reviewed against the anchor before it enters a case study, and a
// queue that publishes while nobody is looking is the opposite of that.

import { SCENARIO_BY_KEY, type Scenario } from "@/lib/studio-scenes";

export type CommissionedProject = {
  /** Stable id, sent as `project` on studio API calls. */
  key: string;
  /** Picker label. */
  label: string;
  /** One line under the picker — what choosing this does to the renders. */
  note: string;
  /**
   * The project's building, appended to every scene prompt. Written like the
   * styling directives: it names the materials, states that it wins over
   * anything the scenario says, and describes a register rather than a room.
   */
  shellDirective: string;
  /**
   * Public URL of the approved style-anchor render. Unset until the anchor
   * exists — the first renders of a project ARE the anchor candidates, so
   * this starts undefined by design, and is filled in (one-line change) once
   * one of them is approved. From then on every render matches it.
   */
  styleAnchorUrl?: string;
  /**
   * Spaces this project needs that the global picker doesn't offer. Keys MUST
   * be prefixed with `<key>-` — the namespacing is what lets these live
   * alongside the global scenarios without ever appearing in an ordinary
   * upload's picker or colliding with a future global key.
   */
  scenes: Scenario[];
};

/**
 * Shorelight — the real-estate flagship case study. A fictional luxury
 * residential development in Mumbai (concept-marked in the projects book,
 * always): two towers, Dawn and Dusk, telling one vertical story from sea to
 * sky. The shell below is the moodboard's founding image — luminous
 * classical-modern ivory plaster — per the programme brief's rule that the
 * first image sets the standard.
 */
export const SHORELIGHT: CommissionedProject = {
  key: "shorelight",
  label: "Shorelight",
  note: "Every render is shot inside the Shorelight building — ivory plaster, bronze, pale marble, sea daylight.",
  // The approved anchor: Tide (Dusk) in the double-height entrance lobby, the
  // first render the project layer produced (6 Sep 2026). This is a byte-for-
  // byte STABLE COPY of that render, versioned in its name — the original
  // lives under the tide-dusk draft's scene path, where a re-shoot of that
  // design/room would silently overwrite it (scene uploads upsert). Never
  // point this at a scene path; re-anchoring means uploading a new copy as
  // -v2 and changing this line.
  styleAnchorUrl:
    "https://zyvorah.com/media/product-images/studio-uploads/shorelight-style-anchor-v1.png",
  shellDirective:
    `SETTING — this space is inside "Shorelight", ONE specific luxury residential building in Mumbai, and every ` +
    `render of this project must show the SAME building. Where this conflicts with any material or colour named ` +
    `in the description of the space, THIS WINS: keep the kind of space, build it from Shorelight's materials. ` +
    `The architecture: luminous sculpted ivory-white plaster walls with refined classical-modern mouldings and ` +
    `panelwork, softly arched openings and thresholds, dark bronze door frames, railings and hardware, pale ` +
    `honed marble floors, generous ceiling heights. Light is soft, high, directional coastal daylight with a ` +
    `calm warm cast; evening rooms use warm concealed cove light instead; one colour temperature per frame, ` +
    `never flat, never neon. The frame reads as one quietly grand, freshly handed-over residential building — ` +
    `restrained and timeless, never a hotel, never corporate, never themed. `,
  scenes: [
    // Each of these inherits the two lessons every recent scenario carries
    // (see the real-estate block in studio-scenes.ts): double heights are
    // pinned in metres against a piece of upper-level architecture, and the
    // prompt states where the furniture sits so the occlusion guard has
    // nothing to reject.
    //
    // Six scenes that began here — grand staircase, clubhouse entrance,
    // residents' lounge, library, indoor pool, rooftop — were PROMOTED to
    // global scenarios (grandstair, clubentrance, clublounge, clublibrary,
    // poolside, rooftoplounge) when the real-estate store grew spaces for
    // them; a project render can keep using them through resolveScenario's
    // global fallthrough.
    //
    // The list refilled in Sep 2026 when the programme went from covering the
    // 106 spaces BY FAMILY to giving each shared amenity its own wall. These
    // seventy stay project-scoped on purpose: seventy new `room` collections
    // would wreck the site's shop-by-space taxonomy, so each design is filed
    // under one of the sixteen existing store spaces by its product tag and
    // the scene exists only to photograph it correctly. Promotion remains
    // available to any of them that later earns a shelf of its own.
    {
      key: "shorelight-discussionlounge", label: "Discussion lounge",
      room:
        "the discussion lounge of a residential clubhouse, the mural covering the wall behind a ring of low armchairs around a small table, the seating kept low and forward so the wall reads its full height, warm daylight from one side, no signage or lettering anywhere",
    },
    {
      key: "shorelight-readingroom", label: "Reading room",
      room:
        "the quiet reading room of a residential clubhouse, the mural covering the wall behind two deep armchairs with a shared side table and a reading lamp, the chairs low and to one side, dim calm light with the wall the most evenly lit thing in the room, no signage or lettering anywhere",
    },
    {
      key: "shorelight-coworking", label: "Co-working lounge",
      room:
        "the residents' co-working lounge of a clubhouse, the mural covering the wall behind a long shared table with task chairs and low task lamps, the table set forward so the wall reads almost its full height, even daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-meetingroom", label: "Private meeting room",
      room:
        "a small private meeting room in a residential clubhouse, the mural covering the end wall behind a round table with four chairs, the table low and forward, soft even daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-cafe", label: "Café",
      room:
        "the café of a residential clubhouse, the mural covering the wall behind a run of small marble tables and bentwood chairs, a coffee counter to one side, bright morning daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-restaurant", label: "Restaurant",
      room:
        "the dining room of a residential clubhouse restaurant, the mural covering the wall behind a run of upholstered banquette seating with tables laid for service, warm pendant lighting hung low over the tables and clear of the wall, early evening light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-barlounge", label: "Bar lounge",
      room:
        "the bar lounge of a residential clubhouse, the mural covering the wall behind a low bar counter with stools, the counter kept forward and low in the frame, warm focused light with the wall evenly washed, no signage or lettering anywhere",
    },
    {
      key: "shorelight-privatedining", label: "Private dining room",
      room:
        "the private dining room of a residential clubhouse, the mural covering the end wall behind a single long table dressed in linen with high-backed chairs, one low pendant well clear of the wall, warm evening light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-prefunction", label: "Pre-function area",
      room:
        "the pre-function foyer outside a clubhouse banquet hall, the mural covering the long wall as one continuous piece, a slim console and two chairs kept far to one side and low in the frame, warm even light, polished floor, no signage or lettering anywhere",
    },
    {
      key: "shorelight-partyroom", label: "Party room",
      room:
        "the party room of a residential clubhouse, the mural covering the full end wall of an open room with a clear floor, a stacked run of chairs and a slim buffet kept far to one side, warm even evening light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-outdoordining", label: "Outdoor dining pavilion",
      room:
        "the outdoor dining pavilion of a residential clubhouse, the mural covering the solid rear wall of an open-sided pavilion, a long table with chairs kept low and forward, greenery and warm late-afternoon light beyond the pavilion edge, no signage or lettering anywhere",
    },
    {
      key: "shorelight-viewinglounge", label: "Viewing lounge",
      room:
        "the viewing lounge of a residential clubhouse, the mural covering the wall opposite a run of tall windows, low lounge seating kept forward and to the sides, bright daylight raking across the wall, no signage or lettering anywhere",
    },
    {
      key: "shorelight-cardiozone", label: "Cardio zone",
      room:
        "the cardio zone of a residential clubhouse gym, the mural covering the full wall faced by a row of treadmills, the machines kept low in the foreground and out of the centre of the frame, a mirror on the side wall, bright even daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-strengthzone", label: "Strength-training zone",
      room:
        "the strength-training zone of a residential clubhouse gym, the mural covering the wall behind a weights rack and bench kept low and to one side, rubber flooring, bright even light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-yogastudio", label: "Yoga studio",
      room:
        "the yoga studio of a residential clubhouse, the mural covering the full end wall of an empty room with a clear floor and a few rolled mats stacked low to one side, soft even daylight, a mirror on the side wall, no signage or lettering anywhere",
    },
    {
      key: "shorelight-pilatesstudio", label: "Pilates studio",
      room:
        "the pilates studio of a residential clubhouse, the mural covering the wall behind two reformer machines kept low and parallel to the wall, bright even daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-dancestudio", label: "Dance studio",
      room:
        "the dance and movement studio of a residential clubhouse, the mural covering the full end wall of an empty mirrored room with a clear sprung floor and a barre along the side wall, bright even light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-spareception", label: "Spa reception",
      room:
        "the spa reception of a residential clubhouse, the mural covering the wall behind a low stone counter with a small orchid and folded towels, the counter forward and low in the frame, soft diffused light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-meditationroom", label: "Meditation room",
      room:
        "the meditation room of a residential clubhouse, the mural covering the full wall of a near-empty room with a few floor cushions kept low, very soft dim light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-saunatransition", label: "Sauna & steam transition",
      room:
        "the transition lobby between sauna and steam rooms in a residential clubhouse, the mural covering the wall opposite two timber-framed glass doors, a low stone bench kept forward and low, warm humid diffused light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-changingroom", label: "Changing room",
      room:
        "the changing room of a residential clubhouse spa, the mural covering the wall above a run of timber lockers that occupy only the bottom third of the frame, a bench kept low, soft even light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-wellnesslounge", label: "Wellness lounge",
      room:
        "the wellness relaxation lounge of a residential clubhouse, the mural covering the wall behind a row of low loungers dressed with pale throws, the loungers kept low and forward, mist-soft diffused light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-reflexology", label: "Reflexology area",
      room:
        "the reflexology area of a residential clubhouse spa, the mural covering the wall behind two reclining chairs with footrests, the chairs low and forward, warm dim diffused light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-poolentrance", label: "Pool entrance",
      room:
        "the entrance lobby to the indoor pool of a residential clubhouse, the mural covering the facing wall as one continuous piece, a low bench and a stack of folded towels kept to one side and low in the frame, bright humid daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-poollounge", label: "Pool lounge",
      room:
        "the pool lounge of a residential clubhouse, the mural covering the wall behind a row of loungers with pale cushions, the loungers kept low and forward, bright daylight from clerestory glazing, no signage or lettering anywhere",
    },
    {
      key: "shorelight-pooldeck", label: "Pool deck wall",
      room:
        "the long deck wall running alongside the pool of a residential clubhouse, the mural covering it as one continuous piece from the water's edge upward, the pool in the foreground reflecting the wall, bright daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-poolpavilion", label: "Pool pavilion",
      room:
        "the covered pool pavilion of a residential clubhouse, the mural covering the solid rear wall of an open-sided pavilion beside the water, low outdoor seating kept to the sides, dappled warm daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-poolcafe", label: "Pool café",
      room:
        "the poolside juice bar of a residential clubhouse, the mural covering the wall behind a small counter with two stools, the counter low and forward, bright fresh daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-childrenspool", label: "Children's pool area",
      room:
        "the children's pool area of a residential clubhouse, the mural covering the wall behind a shallow pool with a low rolled edge, soft mats and a small bench kept low in the frame, bright even daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-poolchanging", label: "Pool changing area",
      room:
        "the pool changing area of a residential clubhouse, the mural covering the wall above a run of low lockers and a bench that occupy the bottom third of the frame, bright even humid light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-jacuzzilounge", label: "Jacuzzi lounge",
      room:
        "the jacuzzi lounge of a residential clubhouse, the mural covering the wall behind a sunken circular jacuzzi with a low stone surround, warm dim light with the wall softly washed, no signage or lettering anywhere",
    },
    {
      key: "shorelight-childrensplayroom", label: "Children's playroom",
      room:
        "the children's playroom of a residential clubhouse, the mural covering the long wall behind a soft play area, foam mats and a low padded step kept below the bottom third of the frame, bright even daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-toddlerroom", label: "Toddler room",
      room:
        "the toddler room of a residential clubhouse, the mural covering the wall behind a low soft-play shape and a woven basket of toys kept very low in the frame, bright gentle daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-childrenslibrary", label: "Children's library",
      room:
        "the children's library of a residential clubhouse, the mural covering the wall above low bookshelves that occupy the bottom third of the frame, a small reading nook cushion kept low, warm even daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-activityroom", label: "Activity room",
      room:
        "the children's activity room of a residential clubhouse, the mural covering the wall behind low tables and small chairs kept below the bottom third of the frame, bright even daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-artcraftroom", label: "Art & craft room",
      room:
        "the children's art and craft room of a residential clubhouse, the mural covering the wall behind a low worktable with small stools and open shelves of materials kept low, bright even daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-homeworkroom", label: "Homework room",
      room:
        "the children's homework room of a residential clubhouse, the mural covering the wall behind a run of small study desks with lamps, the desks low and forward, bright even daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-teenlounge", label: "Teen lounge",
      room:
        "the teen lounge of a residential clubhouse, the mural covering the wall behind a low modular sofa and a floor cushion kept low and forward, warm relaxed light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-childrenspartyroom", label: "Children's party room",
      room:
        "the children's party room of a residential clubhouse, the mural covering the full end wall of an open room with a clear floor and a low table kept to one side, bright cheerful even light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-familylounge", label: "Family lounge",
      room:
        "the family lounge of a residential clubhouse, the mural covering the wall behind a deep sofa with cushions and a low coffee table, the seating low and forward, warm afternoon daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-snookerroom", label: "Snooker room",
      room:
        "the snooker room of a residential clubhouse, the mural covering the full wall alongside a snooker table set parallel to it and low in the frame, a pair of low pendants over the table well clear of the wall, warm focused light with the wall evenly washed, no signage or lettering anywhere",
    },
    {
      key: "shorelight-tabletennis", label: "Table-tennis room",
      room:
        "the table-tennis room of a residential clubhouse, the mural covering the full end wall with a table-tennis table set forward and low in the frame, bright even light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-foosballarea", label: "Foosball area",
      room:
        "the foosball area of a residential clubhouse games room, the mural covering the wall behind a foosball table kept low and forward in the frame, warm focused light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-cardroom", label: "Card room",
      room:
        "the card room of a residential clubhouse, the mural covering the wall behind a round card table with four chairs, the table low and forward, warm focused light over the table with the wall evenly washed, no signage or lettering anywhere",
    },
    {
      key: "shorelight-boardgamesroom", label: "Board-games room",
      room:
        "the board-games room of a residential clubhouse, the mural covering the wall behind low tables with chairs and a shelf of boxed games kept low to one side, warm even light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-minitheatre", label: "Mini-theatre",
      room:
        "the mini-theatre of a residential clubhouse, the mural covering the side wall alongside a row of reclining seats kept low and in shadow, very low warm light with the wall the softest lit surface, no signage or lettering anywhere",
    },
    {
      key: "shorelight-musicroom", label: "Music room",
      room:
        "the music room of a residential clubhouse, the mural covering the wall behind an upright piano and a stool kept low and to one side, warm even light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-karaokeroom", label: "Karaoke room",
      room:
        "the karaoke room of a residential clubhouse, the mural covering the wall behind a low banquette and a small table, warm dim light with the wall softly washed, no signage or lettering anywhere",
    },
    {
      key: "shorelight-entertainmentroom", label: "Private entertainment room",
      room:
        "the private entertainment room of a residential clubhouse, the mural covering the side wall beside a deep sectional sofa kept low and forward, subtle cove lighting and dimmed warm light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-hobbyroom", label: "Hobby room",
      room:
        "the hobby room of a residential clubhouse, the mural covering the wall behind a long worktable with a task lamp and open shelves kept low, bright even daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-artstudio", label: "Art studio",
      room:
        "the art studio of a residential clubhouse, the mural covering the wall behind two easels and a low materials trolley kept to one side, bright even north light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-grandlawn", label: "Grand lawn backdrop",
      room:
        "the wall forming the backdrop to the grand lawn of a residential development, the mural covering it as one long continuous piece, mown lawn in the foreground and a low hedge kept below the bottom fifth of the frame, bright open daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-gardenpavilion", label: "Landscaped garden pavilion",
      room:
        "the landscaped garden pavilion of a residential development, the mural covering the solid rear wall of an open-sided pavilion, low seating kept to the sides, planting and warm afternoon light beyond the pavilion edge, no signage or lettering anywhere",
    },
    {
      key: "shorelight-skylounge", label: "Sky lounge",
      room:
        "the sky lounge on an upper floor of a residential tower, the mural covering the solid inner wall opposite full-height glazing, low lounge seating kept forward and to the sides, bright high daylight with a distant horizon beyond the glass, no signage or lettering anywhere",
    },
    {
      key: "shorelight-viewingdeck", label: "Viewing deck",
      room:
        "the covered viewing deck of a residential tower, the mural covering the solid rear wall, a low rail and two chairs kept to the sides, open sky and a distant horizon beyond the deck edge, bright late-afternoon light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-partyterrace", label: "Party terrace",
      room:
        "the party terrace of a residential tower, the mural covering the solid wall at one end of an open terrace, low outdoor seating kept far to the sides, warm evening light with a darkening sky beyond, no signage or lettering anywhere",
    },
    {
      key: "shorelight-meditationgarden", label: "Meditation garden",
      room:
        "the meditation garden of a residential development, the mural covering a low garden wall as one continuous piece, raked gravel and a stone bench kept low in the frame, soft early daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-amphitheatre", label: "Amphitheatre wall",
      room:
        "the backdrop wall of a small outdoor amphitheatre in a residential development, the mural covering it as one long continuous piece, curved stone seating steps kept low in the foreground, bright open daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-pergolaseating", label: "Pergola seating",
      room:
        "the pergola seating area of a residential garden, the mural covering the solid wall behind a bench beneath a timber pergola, dappled light falling across the wall through the pergola slats, planting to the sides, no signage or lettering anywhere",
    },
    {
      key: "shorelight-gardencorridor", label: "Garden corridor",
      room:
        "a covered garden walkway in a residential development seen in one-point perspective, the mural running the full length of one wall, planting along the opposite side, dappled daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-kidsoutdoor", label: "Children's outdoor play zone",
      room:
        "the children's outdoor play zone of a residential development, the mural covering the boundary wall behind soft play equipment kept low in the frame, safety surfacing underfoot, bright daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-seniorsarea", label: "Senior citizens' area",
      room:
        "the senior citizens' sitting area of a residential development, the mural covering the wall behind a run of comfortable benches with armrests, the seating low and forward, soft warm daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-petpark", label: "Pet park entrance",
      room:
        "the entrance wall to the pet park of a residential development, the mural covering it as one continuous piece, a low gate and planting kept to one side, bright open daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-projectentrance", label: "Project entrance experience wall",
      room:
        "the entrance experience wall of a residential development's sales gallery, the mural covering the facing wall as one continuous piece seen straight-on through a wide opening, a clean empty floor with no furniture in front of the wall, gallery-calm even light, no signage, no branding and no lettering anywhere",
    },
    {
      key: "shorelight-sampleflatentrance", label: "Sample-flat entrance",
      room:
        "the entrance vestibule to a show apartment in a sales gallery, the mural covering the facing wall as one continuous piece, a slim console kept low to one side, warm domestic daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-materialwall", label: "Material & finish presentation wall",
      room:
        "the material and finish presentation wall of a sales gallery, the mural covering the wall behind a low display shelf holding material samples, the shelf occupying only the bottom fifth of the frame, gallery-calm even light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-developerstorywall", label: "Developer story wall",
      room:
        "the developer story wall of a sales gallery, the mural running as one very long continuous band along the main wall, a clean empty floor in front of it and a few chairs kept far to the sides, gallery-calm even light with the wall clearly the subject, no signage, no branding and no lettering anywhere",
    },
    {
      key: "shorelight-modelroom", label: "Project model room",
      room:
        "the project model room of a sales gallery, the mural covering the wall behind a large architectural model on a low plinth, the plinth forward and low so the wall reads its full height, gallery-calm even light, no signage or lettering anywhere",
    },
    {
      key: "shorelight-customerlounge", label: "Customer lounge",
      room:
        "the customer lounge of a sales gallery, the mural covering the wall behind comfortable lounge seating and a low table, the seating low and forward, warm even daylight, no signage or lettering anywhere",
    },
    {
      key: "shorelight-bookingroom", label: "Booking & consultation room",
      room:
        "the booking and consultation room of a sales gallery, the mural covering the wall behind a small table with two chairs, the table low and forward, soft even daylight, no signage or lettering anywhere",
    },
  ],
};

/**
 * Bhitti MMXXVII — the printed book. Thirty-four murals, each shown installed
 * in a residential, a hospitality and a corporate room, printed by Thomson
 * Press as a luxury monograph. Unlike Shorelight this is NOT one building:
 * the book's rooms are deliberately many buildings, and what has to hold
 * across all 100-odd plates is the PHOTOGRAPHY — one register, one kind of
 * light, one kind of material. So the shell below pins the register instead
 * of the architecture. Everything else about a project applies unchanged.
 */
export const BHITTI: CommissionedProject = {
  key: "bhitti",
  label: "Bhitti MMXXVII",
  note: "Every render is shot in the register of the printed Bhitti book — worn oak, matte stone, linen, brass, one soft daylight per frame.",
  // No anchor yet, deliberately: the first renders of this project ARE the
  // anchor candidates, and the founder approves one before it becomes the
  // reference every later frame is matched to. When that happens, upload a
  // STABLE COPY of the approved render under its own versioned name and point
  // this at that — never at the scene path it was rendered to, because a
  // re-shoot of the same design/room upserts over it.
  // styleAnchorUrl: undefined,
  shellDirective:
    `SETTING — this render is a plate for "Bhitti MMXXVII", a printed book, and what it must match is not one ` +
    `building but ONE PHOTOGRAPHIC REGISTER carried across many of them. Where this conflicts with any material, ` +
    `colour or finish named in the description of the space, THIS WINS: keep the kind of space, photograph it in ` +
    `this register. The register: muted, warm, quiet interiors in the manner of a luxury printed monograph, built ` +
    `from real lived-in materials — worn oak, matte stone, natural linen, aged brass — nothing that looks new out ` +
    `of a box. Light is soft directional daylight, or warm lamplight in an evening room, with ONE colour ` +
    `temperature per frame; no gloss, no lens flare, no showroom or studio lighting, no rendering-software sheen. ` +
    `The room is restrained and unstyled — sparse furniture, placed rather than arranged, kept low and forward of ` +
    `the wall; never a furniture catalogue, never plants doing the work. The mural wall is always seen SQUARE-ON ` +
    `at its full height with both its floor line and its ceiling line in frame and nothing tall standing against ` +
    `it. No people anywhere in the frame, and no signage, branding or lettering of any kind. `,
  scenes: [
    // The three rooms the book's register mapping needs that the global
    // picker has no scenario for. Written to the same two rules as every
    // recent scenario: state where the furniture sits so the occlusion guard
    // has nothing to reject, and say what the wall does rather than trusting
    // the model to leave it alone. No roomTags — these spaces have not earned
    // a collection, and a project scene carries none until they do.
    {
      key: "bhitti-bar", label: "Hotel bar",
      room:
        "a quiet hotel bar in the evening, the mural covering the facing wall square-on as one continuous piece from floor to ceiling with both the skirting and the ceiling line in frame, a low dark-timber counter with a slim aged-brass foot rail set in the RIGHT third of the frame, standing well forward of that wall and rising no higher than a quarter of the wall, the left two-thirds of the mural wall completely clear from skirting to ceiling, one small round table with two worn leather club chairs low in the left foreground, warm pooled lamplight over the tables with the wall itself evenly lit, the back-bar shelves and bottles out of frame entirely, no people, no signage, no branding and no lettering anywhere",
    },
    {
      key: "bhitti-suite", label: "Hotel suite sitting room",
      room:
        "the sitting room of a hotel suite in the evening, the mural covering the facing wall square-on at its full height with both the skirting and the ceiling line in frame, a low linen sofa and two armchairs kept forward of that wall and low in the frame so the artwork reads its full height behind them, a slim writing desk and chair set to one side, heavy curtains half drawn at a window off to the side of the frame, warm evening lamplight from a table lamp and a floor lamp at one colour temperature, nothing tall standing against the mural wall, no people, no signage or lettering anywhere",
    },
    {
      // The global hotellobby scene invites the model to dress the periphery — and its
      // invented seating groups and mirror-polish reflections are where a render reads
      // as fake (founder's first-render feedback, 2026-09-08). This one states a calm,
      // nearly empty composition positively: one counter, a clear matte floor, plain
      // side walls. Fewer things for the model to invent means fewer things to get wrong.
      key: "bhitti-lobby", label: "Hotel lobby (calm)",
      room:
        "the double-height lobby of a luxurious hotel, photographed straight-on from far enough back and from a low vantage that the FULL height of the far wall is in frame from floor to ceiling, the ceiling a clear two storeys up — roughly five metres — the mural covering that far wall edge to edge as one continuous piece, a single low reception counter of honed stone standing forward of the wall and occupying only the bottom fifth of the frame with one small shaded lamp on it, the stone floor honed matte and otherwise completely clear all the way to the camera, the side walls plain warm plaster, soft high daylight with one colour temperature, every object solidly grounded on the floor, no people, no signage or lettering anywhere",
    },
    {
      // R3's register was converging with R1/R2 into the same centred straight-on
      // composition (founder: "the three plates are triplets — vary the camera").
      // Same wall honesty, different eye: seated height, desk in the right third.
      key: "bhitti-reception", label: "Office reception (offset)",
      room:
        "the reception of a chic contemporary office photographed from seated eye height, the mural covering the facing wall square-on floor to ceiling with both its floor line and ceiling line in frame, a sleek low reception desk set in the RIGHT third of the frame standing forward of the wall, the left half of the mural wall completely clear from skirting to ceiling, one slender pendant light hanging high at the far right edge of the frame, polished stone floor, cool morning daylight at one colour temperature, every object solidly grounded, no people, no signage or lettering anywhere",
    },
    {
      // R1 kept coming back amber: the GLOBAL living scenario literally asks for "warm lamp
      // light", so the roll is lamp-lit before the swap begins and the light map faithfully
      // carries that cast onto the artwork (founder, 2026-09-09: "the whole wall has gone
      // amber against the boardroom version, where the same design sits cool and correct").
      // The colour temperature of a Bhitti room is the book's decision, not the room's.
      key: "bhitti-living", label: "Living room (daylight)",
      room:
        "a quiet living room in a well-made house photographed by DAYLIGHT, the mural covering the facing wall square-on floor to ceiling with both the skirting and the ceiling line in frame, cool even north light from a window off to one side as the only light in the room with every lamp switched off and no warm bulb anywhere, the wall lit flatly and neutrally so the artwork holds its own colour, a low sofa in undyed linen and a plain oak coffee table standing well forward of the wall and low in the frame, a flat-woven wool rug underfoot, nothing tall against the mural wall, no people, no signage or lettering anywhere",
    },
    {
      key: "bhitti-foyer", label: "Residential foyer",
      room:
        "a boutique residential entrance foyer photographed CLOSE, the camera a few steps from the wall at chest height so the mural fills the frame edge to edge with the ceiling line just inside the top, the mural covering the WHOLE facing wall floor to ceiling as one continuous piece — never a framed picture or panel hung above a console — the wall seen square-on, a slim console table with a vase of dry stems set low in the BOTTOM-LEFT corner of the frame and standing forward of the wall, a woven runner underfoot, warm daylight falling from one side, nothing else standing against the wall, no people, no signage or lettering anywhere",
    },
  ],
};

export const COMMISSIONED_PROJECTS: CommissionedProject[] = [SHORELIGHT, BHITTI];

export const PROJECT_BY_KEY = new Map(COMMISSIONED_PROJECTS.map((p) => [p.key, p]));

/** A project's own scene, falling through to the global picker — so one
 *  project render can use `gym` and `shorelight-grandstair` side by side. */
export function resolveScenario(sceneKey: string, project?: CommissionedProject): Scenario | undefined {
  return project?.scenes.find((s) => s.key === sceneKey) ?? SCENARIO_BY_KEY.get(sceneKey);
}

/** The scene keys a project adds — what `normaliseSceneKeys` accepts on top
 *  of the global vocabulary when this project is active. */
export function projectSceneKeys(project?: CommissionedProject): ReadonlySet<string> | undefined {
  return project ? new Set(project.scenes.map((s) => s.key)) : undefined;
}
