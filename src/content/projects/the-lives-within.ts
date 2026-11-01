import type { Project } from "./types";

const room = (name: string) => `the-lives-within/${name}.jpg`;

export const theLivesWithin: Project = {
  slug: "the-lives-within",
  kind: "concept",
  theme: "calm",
  segments: [],
  client: "A 10,000 sq ft family apartment in Gurgaon",
  title: "The Lives Within",
  standfirst: "Two people who have built a life together. Two children finding their own directions. Grandparents whose room is always ready. Walls that make room for all of them.",
  cover: room("shared-horizons-living"),
  facts: [
    { label: "Setting", value: "Gurgaon · 10,000 sq ft apartment" },
    { label: "Household", value: "A couple, a daughter of 18, a son of 12, visiting grandparents" },
    { label: "Home", value: "Four bedrooms · shared living · private cinema · dressing lounge" },
    { label: "Approach", value: "Gentle through the day. Richer in selected evening spaces." },
  ],
  brief: {
    intro: "Meet the Sethi family. Rohan, 51, runs a precision-engineering business. Meera, 47, leads a small brand-strategy practice and loves textiles, photography and contemporary art. Their daughter Tara is eighteen; their son Kabir is twelve. Rohan’s parents visit from Ludhiana. Their routines, interests and time together give every design choice a human starting point.",
    requirements: [
      "Let each room reflect how it is lived in, with a coherent palette connecting the home.",
      "Make neutral artwork rewarding at close range through drawing, layering and scale.",
      "Reserve deeper colour and theatrical contrast for dining and the private cinema.",
      "Give the children individual spaces that can grow with them.",
      "Make the grandparents’ guest bedroom feel like a room that belongs to them.",
      "Consider daylight, furniture, sightlines and measured wall proportions before printing.",
    ],
  },
  interpretation: [
    "Long before paintings hung on canvas, people made images on walls. A wall can still communicate something about the people who live beside it: what catches their eye, how they spend their evenings, where they find a moment to themselves.",
    "This home begins with shared life. The living room is open and composed; the dining room becomes more intimate after sunset. The family lounge accommodates everyday company. The private rooms gradually become quieter, without losing the richness of the artwork.",
    "Quiet is a design decision. Fine lines in the dressing lounge evoke Meera’s interest in cloth. An atmospheric landscape gives the couple’s bedroom a sense of distance from the working day. The children’s rooms leave room for changing interests instead of fixing them inside a theme.",
  ],
  palette: {
    intro: "A shared family of colours, with room for different temperaments.",
    entries: [
      { name: "Pearl", hex: "#E8E1D5", purpose: "Light and breathing space in shared and private rooms." },
      { name: "Warm Stone", hex: "#B4A697", purpose: "A quiet bridge between paper, timber and upholstery." },
      { name: "Mist Sage", hex: "#93998A", purpose: "Atmospheric garden passages and restful bedroom layers." },
      { name: "Slate", hex: "#667581", purpose: "Depth, contours and the children’s more exploratory compositions." },
      { name: "Evening Ink", hex: "#353333", purpose: "Intimacy in the dining and cinema spaces." },
    ],
    note: "Physical samples establish colour and finish beside the materials and lighting in your own room.",
  },
  motifs: {
    intro: "The artwork is chosen for a way of living.",
    entries: [
      { name: "Shared Horizons", description: "An open abstract landscape, layered enough to discover slowly over many evenings." },
      { name: "Folded Light", description: "Fine translucent linework recalling the folds and movement of cloth." },
      { name: "After Sunset", description: "A deep garden composition for the table where conversations linger." },
      { name: "Paths of Curiosity", description: "Contours and passages that leave space for a child’s own discoveries." },
    ],
  },
  journeyHeading: "The rooms, and the lives around them",
  chapters: [
    { space: "Formal living room", title: "Shared Horizons", rationale: "Rohan and Meera both notice the art, but neither wants the living room to demand attention all day. An expansive abstract landscape gives conversation a generous background and rewards a closer look.", curated: room("shared-horizons-living"), alt: "Ivory and slate abstract landscape wallpaper behind a low cream sofa in a Gurgaon apartment." },
    { space: "Dining room", title: "After Sunset", rationale: "Their friends know that dinner rarely ends with dinner. A richer garden wall draws the room inward after sunset, giving this part of the home the drama that belongs to an evening together.", curated: room("after-sunset-dining"), alt: "Deep tonal garden wallpaper surrounding an intimate contemporary dining room." },
    { space: "Family TV lounge", title: "Where Everyone Lands", rationale: "This is where Kabir leaves a game unfinished and Tara returns to sit with the family. Soft movement on the wall creates atmosphere around the everyday objects that make it their room.", curated: room("family-lounge"), alt: "A relaxed family lounge with refined soft abstract wallpaper and comfortable seating." },
    { space: "Private cinema", title: "An Evening Elsewhere", rationale: "A different world begins when the lights lower. Deep, low-contrast artwork belongs on the side wall; the screen wall stays visually quiet. Acoustic treatment is specified separately.", curated: room("private-cinema"), alt: "A private home cinema with dark tonal wall art and comfortable contemporary seating." },
    { space: "Master bedroom", title: "A Quieter Horizon", rationale: "Their working days involve constant decisions. At home, an atmospheric landscape gives Rohan and Meera a room with fewer demands on their attention, and something beautiful to wake beside.", curated: room("primary-bedroom"), alt: "A spacious master bedroom with misty contemporary landscape wallpaper in pearl and sage." },
    { space: "Dressing lounge", title: "Folded Light", rationale: "Meera has always noticed textiles: their folds, fine threads and the way they catch the light. Intricate drawn layers make this neutral wall her most personal part of the morning.", curated: room("folded-light-dressing"), alt: "Intricate folded graphite linework wallpaper beside walnut wardrobes and a sculptural vanity." },
    { space: "Tara’s bedroom · age 18", title: "Room for What Comes Next", rationale: "Tara is beginning to imagine a life beyond home. An open contemporary composition gives her room its own point of view while leaving space for the person she is becoming.", curated: room("tara-bedroom"), alt: "An older teenager’s sophisticated bedroom with expressive contemporary abstract wall art." },
    { space: "Kabir’s bedroom · age 12", title: "Paths of Curiosity", rationale: "Kabir follows questions wherever they take him. Contours, paths and small visual discoveries suggest exploration without turning his room into a single hobby he may soon outgrow.", curated: room("kabir-bedroom"), alt: "A twelve-year-old’s room with artistic layered topographic wallpaper and a study area." },
    { space: "Grandparents’ guest bedroom", title: "Your Room Is Ready", rationale: "Rohan’s parents come from Ludhiana, sometimes for longer than planned. An atmospheric garden brings a welcoming familiarity to a room that feels part of their family life whenever they arrive.", curated: room("grandparents-bedroom"), alt: "A welcoming guest bedroom with sophisticated misty garden wallpaper and a comfortable reading chair." },
  ],
  buildingLabel: "A home beyond its feature walls",
  buildings: { entries: [
    { name: "Arrival and everyday life", subtitle: "Foyer · gallery · breakfast · study", body: "Let the entrance introduce the palette with a restrained artwork passage. The breakfast corner can borrow garden light; the study stays composed. Plain connecting walls allow the larger compositions to breathe.", draws: ["One considered arrival wall", "A gentle breakfast corner", "Clear space around books and collected objects", "Artwork scaled to actual openings and furniture"] },
    { name: "Practical rooms", subtitle: "Kitchen · utility · bathrooms · balconies", body: "The entire apartment deserves consideration, including spaces where wallpaper is not the right specification. Keep cooking, splash and exposed exterior areas in suitable durable finishes. A powder-room artwork can be developed for a verified dry wall.", draws: ["Site-specific material suitability", "No wallpaper assumed in wet or cooking zones", "Separate surface preparation and installation scope"] },
  ] },
  process: { steps: [
    { title: "Begin with your life", body: "Tell us who uses the room, when you spend time there, and what you want it to feel like. One wall is enough to start." },
    { title: "Choose a direction", body: "Explore the designs from this home and select the artwork that feels connected to your room." },
    { title: "Shape it to your wall", body: "Share dimensions, wall photographs, openings and furniture positions. The composition is prepared for the measured space." },
    { title: "See it before it is printed", body: "Review the proposed composition and physical material sample before approving the final print proof." },
  ] },
  shop: { heading: "Begin with the wall that feels like you", body: "Explore the room directions, add your wall measurements and build a selection for your own home. The artwork is prepared and proofed for the measured wall before printing.", href: "/concepts/the-lives-within/shop", label: "Explore the wallpapers" },
  ask: { heading: "What would your walls say about you?", body: "Begin with a wall. You don’t have to start with the whole house. Choose the wall that feels like you." },
  productionNote: { title: "Made for your wall", body: "Your wall dimensions, light and furniture shape the final composition. Review the artwork and material before printing.", points: ["Final artwork is prepared and proofed for your measured wall.", "Furniture, lighting, joinery, acoustic treatment and installation are separate scopes."] },
};
