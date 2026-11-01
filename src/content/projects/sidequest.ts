import type { Project } from "./types";

/** Original Zyvorah hotel concept. Every room image is a generated concept visual. */
export const sidequest: Project = {
  slug: "sidequest",
  kind: "concept",
  theme: "bright",
  segments: ["hospitality"],
  client: "An imagined hotel for young travellers",
  title: "Sidequest",
  standfirst: "Stay for the detour. An original Zyvorah hotel concept for curious Gen Z travellers — where the walls turn a city break into unexpected encounters, small discoveries and stories worth taking home.",
  facts: [
    { label: "Setting", value: "An imagined urban Mumbai hotel" },
    { label: "Audience", value: "Young travellers, friends and solo explorers" },
    { label: "Programme", value: "33 wall opportunities · 6 rendered spaces" },
    { label: "By", value: "Zyvorah · original visual concept" },
  ],
  cover: "sidequest/arrival.jpg",
  brief: {
    intro: "Imagine a compact, sociable city hotel with an all-day ground floor, comfortable guestrooms and a rooftop that catches the last light. Guests might arrive alone, with friends, for a gig, a weekend or a few days of work. The walls give them an easy way into the place: somewhere to recognise themselves, discover the neighbourhood and start a conversation.",
    requirements: [
      "Make arrival feel welcoming and easy, including for a solo traveller arriving late.",
      "Give the hotel a recognisable Zyvorah visual identity across every guest touchpoint.",
      "Create memorable, photographable spaces that remain comfortable when the hotel is busy.",
      "Connect the stay to local food, music, street life and independent creative culture.",
      "Offer both social energy and the freedom to spend time at your own pace.",
      "Resolve wall placement around luggage, furniture, lighting, cleaning and actual guest routes.",
    ],
  },
  interpretation: [
    "The central idea is the detour: the unplanned café, the extra song, the stranger who becomes a friend. A wandering line runs through the hotel like a route with permission to change. Oversized ticket shapes, postcard margins, stamped circles and torn-paper fields make the walls feel like a travel diary still being written.",
    "The ground floor is the Common Ground: check-in beside the social lounge, coffee and breakfast by day, games and music into the evening. Long tables welcome groups; paired seats and small alcoves make joining optional. Mocktails and coffee belong as comfortably as cocktails.",
    "Upstairs becomes Off Duty. The same route line slows into a horizon; colours soften into lilac, peach and ink. Rooms include useful luggage space, charging within reach and lighting for reading. A young hotel still needs to be a good place to sleep.",
    "Mumbai is the imagined first setting. The travel collage borrows the city's coastal horizons, gateways, train journeys and street life. A commissioned local layer would be developed with artists and neighbourhood contributors. Nearby recommendations live on an updateable board; expressive mural routes remain clearly separate from practical maps and signs.",
    "The identity extends to room-key sleeves, lift labels, postcards, café menus and a small neighbourhood field guide. The signature is a looping route and an open ticket-shaped frame. Short human phrases invite action; the artwork carries most of the story.",
    "Three proposed rituals make the walls part of the stay: a morning ‘Today's detour’ card on the neighbourhood board, an evening open-table game hosted in Common Ground, and a departure postcard guests can take home or leave on the story rail. A weekly artist or music session gives the event alcove a changing life. Participation is always optional.",
  ],
  palette: {
    intro: "A warm paper base gives bright communal rooms and quieter private rooms one shared language.",
    entries: [
      { name: "Travel Paper", hex: "#F4EFE4", purpose: "The generous base across walls, ceilings and quiet rooms.", share: "50%" },
      { name: "Detour Cobalt", hex: "#2748CF", purpose: "The signature route, arrival mural and clear points of recognition.", share: "18%" },
      { name: "Sunset Coral", hex: "#E56A54", purpose: "Warm gathering places, café upholstery and the rooftop.", share: "12%" },
      { name: "Dusk Lilac", hex: "#BCACDA", purpose: "Softening the transition to reading, rest and guestrooms.", share: "10%" },
      { name: "Citrus Stop", hex: "#EFCE36", purpose: "Small sparks in the social spaces and moments of orientation.", share: "6%" },
      { name: "Ticket Ink", hex: "#252631", purpose: "Legible information and the fine marks that hold the collage together.", share: "4%" },
    ],
    note: "These are proposed proportions for the visual scheme. Cream stays dominant; guestrooms use much less cobalt and citrus than the lobby. Pale plywood, brushed steel, tactile upholstery and warm light keep the graphics grounded in a place you can inhabit.",
  },
  motifs: {
    intro: "Five devices make a whole hotel feel related while allowing each room its own mood.",
    entries: [
      { name: "The wandering line", description: "A loose continuous route that meets, loops and changes direction. Big and sociable downstairs; fine and slow upstairs." },
      { name: "Tickets to elsewhere", description: "Oversized original ticket frames and notched paper forms suggest possibility without imitating transport branding." },
      { name: "A city in fragments", description: "Abstract street corners, rain, trees and music rhythms form a locally authored collage that can change with each destination." },
      { name: "Open circles", description: "Sunset discs, table-tennis arcs and imperfect stamps signal gathering and play without becoming a repeated mascot." },
      { name: "Small invitations", description: "Take the detour. Pull up a chair. Your own pace. One more sunset. Copy belongs at meaningful thresholds; the bed wall stays free of large slogans." },
    ],
  },
  buildingLabel: "Every place the walls could speak",
  buildings: {
    intro: "33 opportunities across six zones. The six visual plates below establish the direction; the remaining spaces are mapped here for a complete hotel programme. Each opportunity describes the wall's job, rather than promising another full mural.",
    entries: [
      {
        name: "01 · Arrive and belong",
        subtitle: "Welcome before spectacle",
        body: "The entrance gives the first flash of cobalt. A generous lobby mural opens the story, while a changeable neighbourhood board makes discovery practical. Arrival copy: ‘Take the detour.’",
        draws: ["Entrance / façade — a recognisable threshold", "Vestibule — a first route fragment", "Check-in backdrop — welcome and identity", "Luggage drop — an easy pause", "Arrival lounge — the signature mural", "Neighbourhood board — current local discoveries"],
      },
      {
        name: "02 · Eat, meet and play",
        subtitle: "Common Ground",
        body: "Collage expands around shared tables; playful arcs energise games. The programme board lets staff refresh events and local recommendations. Café copy: ‘Pull up a chair.’ A guest postcard rail invites voluntary contributions, reviewed by the hotel team.",
        draws: ["Café / breakfast wall — a morning ritual", "Bar backdrop — an evening shift", "Communal table — an invitation to join", "Games lounge — rhythm and friendly play", "Music / event alcove — a flexible backdrop", "Guest postcard rail — a story left behind"],
      },
      {
        name: "03 · Move and find your way",
        subtitle: "The route becomes readable",
        body: "The line connects floors, but room numbers and essential signs use their own consistent, high-contrast system. Every landing receives a distinct colour cue. Decorative arrows never compete with directions or exit information.",
        draws: ["Ground-floor lift lobby — the next chapter", "Lift interiors — a small discovery", "Guest-floor landings — a floor identity", "Guest corridors — a slower route", "Room-door recesses — easy recognition", "Stair landings — gentle continuity beside clear exit signs"],
      },
      {
        name: "04 · Focus and recharge",
        subtitle: "Your own pace",
        body: "Coworking and reading reduce graphic density. Fitness uses a measured sense of motion; yoga and recovery use open ground and softer horizons. People can step away from the social centre without losing the hotel's identity.",
        draws: ["Cowork nook — a quiet focus horizon", "Meeting / creator room — room for ideas", "Reading alcove — a sheltered pause", "Gym — movement and momentum", "Yoga / stretch room — slow breathing space", "Guest laundry — a light everyday interlude"],
      },
      {
        name: "05 · Close the door and rest",
        subtitle: "Off Duty",
        body: "Headboard walls become soft, expansive horizons. Entry walls hold a small welcome and useful information. Bathroom interventions belong above splash zones or on a separately specified wet-area surface; mirrors receive only a brief, considerate line.",
        draws: ["Guestroom headboard — the dusk mural", "Room entry / luggage wall — a gentle welcome", "Guest bathroom vanity wall — a small morning moment", "Public washroom approach / vanity wall — playful pause and clear identification"],
      },
      {
        name: "06 · Stay for one more moment",
        subtitle: "The day opens, then closes",
        body: "The rooftop mural catches sunset; a sheltered terrace wall gives an evening gathering its own frame. Departure leaves a postcard-sized goodbye. Staff spaces deserve the same warmth, with room for team stories and current information.",
        draws: ["Rooftop bar-back — one more sunset", "Sheltered terrace / courtyard wall — gathering outdoors", "Departure / checkout wall — a last invitation", "Postcard / merchandise nook — a fragment to take home", "Staff break room / briefing wall — the people behind the stay"],
      },
    ],
  },
  wallHierarchy: {
    intro: "A proposed wall-area balance across the hotel. The strongest moments work because other walls give them room.",
    levels: [
      { level: "Signature", purpose: "Arrival, one social wall and the rooftop: the large memorable scenes.", share: 20 },
      { level: "Connective", purpose: "Landings, selected corridor segments and small touchpoints carry the route.", share: 25 },
      { level: "Quiet", purpose: "Bedrooms, reading, focus and most supporting surfaces allow rest and clarity.", share: 55 },
    ],
    note: "This is a concept allocation, to be recalculated from measured elevations. We choose one principal wall per room before adding secondary interventions.",
  },
  journeys: {
    intro: "One hotel, with room for three different ways to travel.",
    entries: [
      { who: "The solo explorer", route: ["Welcome", "Neighbourhood board", "Coffee", "Shared table", "Off Duty"], body: "A useful local recommendation opens the stay. Seating offers an easy invitation to meet people, with a quiet retreat always available." },
      { who: "The friends on a weekend", route: ["Arrival mural", "Games", "City detour", "Rooftop", "Rest"], body: "Photographs, play and a sunset become shared memories. The room changes pace when the group returns for sleep." },
      { who: "The work-and-wander guest", route: ["Breakfast", "Cowork", "Reading pause", "Neighbourhood", "Sunset"], body: "A productive morning and an open evening belong in the same trip. Calm pockets support the day without requiring a separate business-hotel identity." },
    ],
  },
  journeyHeading: "Six spaces. One stay full of possibility.",
  chapters: [
    { space: "Arrival and check-in lounge", title: "Take the Detour", rationale: "A cobalt route meets ticket fragments and citrus fields behind a curved communal sofa. The first major wall makes the hotel unmistakable while keeping the check-in counter easy to find.", curated: "sidequest/arrival.jpg", alt: "Sidequest hotel arrival lounge with a cobalt, citrus and coral travel-collage feature wall", aspect: "3/2" },
    { space: "All-day café and games lounge", title: "Pull Up a Chair", rationale: "A long table, small seating groups and a games corner make meeting people feel natural. The wall mixes loose play arcs and paper fragments into a sociable backdrop that works from breakfast to evening.", curated: "sidequest/social.jpg", alt: "Sidequest communal café and games lounge with original playful graphic wall art", aspect: "3/2" },
    { space: "Cowork and reading nook", title: "Your Own Pace", rationale: "The visual line becomes fine and the paper ground opens up. Lilac, plywood and soft daylight support focus and a quiet coffee within the same expressive hotel.", curated: "sidequest/reset.jpg", alt: "Sidequest quiet cowork and reading nook with a restrained lilac and cobalt wall composition", aspect: "3/2" },
    { space: "Guest-floor lift lobby and corridor", title: "Find Your Chapter", rationale: "A slower route composition gives the landing identity. Functional room signs stay distinct from expressive marks, and the wall leaves clear space around lift doors and circulation.", curated: "sidequest/corridor.jpg", alt: "Sidequest guest-floor landing with a cobalt route mural and separate room direction signage", aspect: "3/2" },
    { space: "The Off Duty guestroom", title: "A Softer Horizon", rationale: "Ticket silhouettes dissolve into a dusk horizon behind the bed. Lilac, peach, linen and warm wood keep the room related to downstairs while making rest the main event.", curated: "sidequest/guestroom.jpg", alt: "Sidequest boutique guestroom with a quiet layered lilac and peach horizon headboard mural", aspect: "3/2" },
    { space: "Rooftop bar and sheltered terrace", title: "One More Sunset", rationale: "The route loops through a large sunset disc on the sheltered bar-back. Coral seating, cobalt chairs and planting turn the final wall into a warm place to gather above the city.", curated: "sidequest/rooftop.jpg", alt: "Sidequest rooftop terrace at sunset with an original coral, cobalt and lilac graphic bar-back mural", aspect: "3/2" },
  ],
  process: {
    intro: "A complete visual concept becomes a hotel through its architecture, local collaborators and everyday operations.",
    steps: [
      { title: "Map the whole stay", body: "Use the entrance, luggage path, check-in queue, breakfast rush, workday, evening and late return to select each wall and set its emotional role." },
      { title: "Build the local layer", body: "Commission neighbourhood artists and contributors to develop original city fragments, with clear usage rights and a way for staff to update recommendations." },
      { title: "Compose each elevation", body: "Adapt the visual family to measured walls, door swings, furniture, sockets and light. Test the mural from standing, sitting and luggage-height viewpoints." },
      { title: "Prove the room at both hours", body: "Review daytime and evening lighting, readability and sensory load. Quiet rooms stay quiet; the social programme is planned around guest comfort." },
      { title: "Prepare and install", body: "Create final master artwork, material specification, panel plan and physical colour proof. Resolve wear, cleaning and sheltered outdoor exposure wall by wall." },
    ],
  },
  shop: {
    heading: "Bring Sidequest to your walls.",
    body: "Start with one of the six visual directions, choose your spaces and enter your measurements. These are room references: artwork preparation and your final artwork proof are included before printing. For a complete hotel, commission a programme around your architecture and neighbourhood.",
    href: "https://zyvorah.com/concepts/sidequest/shop",
    label: "Choose your spaces",
  },
  productionNote: {
    title: "An imagined hotel, clearly presented",
    body: "Sidequest is an original Zyvorah concept study, not an operating hotel or a commissioned installation. The six images are AI-generated architectural concept visuals. The 33-space programme is a proposed design scope; other zones have not been rendered. Room visuals are references, and final print artwork is prepared separately for the chosen walls.",
    points: [
      "Measured elevations, furniture, lighting and signage coordination",
      "Original commissioned local content and agreed artwork usage rights",
      "Large-format master artwork, composition approval and physical colour proofs",
      "Material fire performance, cleaning and abrasion requirements for each hotel zone",
      "Separate wet-area and exterior specifications; standard interior wallpaper is not a shower or exposed façade finish",
      "Panel divisions, seam placement, corners and installation access",
    ],
  },
  ask: { heading: "Where could your guests take a detour?", body: "Share your hotel plan, city, guest profile and photographs of your arrival, social and bedroom walls. Zyvorah can develop the visual story, the complete wall programme and the artwork for your spaces." },
};
