// Editorial guidance shown on room collection pages (P1 #21). Keyed by the room
// collection handle. Honest, non-over-claiming copy — materials + removal match
// the site's finishes and published wording; no fabricated customer photos.

export type RoomFaq = { q: string; a: string };
export type RoomContent = {
  intro: string;
  sections: { heading: string; body: string }[];
  faq: RoomFaq[];
};

const MATERIALS_NOTE =
  "Each design has its own surface — smooth matte or a linen feel — and its current price is shown on the design page. Outside India, the site shows country-adjusted USD pricing. Design samples are available within India to judge colour and surface before committing.";

export const ROOM_CONTENT: Record<string, RoomContent> = {
  "living-room-wallpaper": {
    intro:
      "The living room is where a mural earns its keep — it sets the tone the moment someone walks in. Because every design is sized to your wall, you can commit to a scene you'll actually live with.",
    sections: [
      {
        heading: "How to choose living-room wallpaper",
        body: "Start with the wall, not the design. Pick the one wall that already draws the eye — usually behind the sofa or the TV — and let the rest of the room stay calm. Match the mood to how you use the space: restful scenes for unwinding, bolder pieces for a room made for company.",
      },
      {
        heading: "Recommended design scale",
        body: "Living-room walls are wide, so large, open compositions read best — a single landscape or garden scene carries a big wall far better than a small repeat. Since we print to your measurements, the design is scaled to fit edge to edge with no awkward cut-offs.",
      },
      {
        heading: "Working with a TV wall",
        body: "A TV sits comfortably against a mural if you let the screen fall into a quieter part of the composition — sky, open water, foliage — rather than across the busiest detail. Measure the whole wall (not just around the unit); we print the full wall and the TV simply mounts over it.",
      },
      {
        heading: "Quiet vs. statement",
        body: "Quiet: soft, tonal or textural designs that add depth without demanding attention — good when the room already has a lot going on. Statement: a bold scene or rich colour on the feature wall, with the other walls kept plain to let it breathe.",
      },
      { heading: "Recommended materials", body: MATERIALS_NOTE },
    ],
    faq: [
      { q: "How much wallpaper do I need?", a: "Measure the wall's full width and height in feet and enter them on any design — we price and print to that exact size. See our How to Measure guide if you're unsure." },
      { q: "Can I put a mural behind my TV?", a: "Yes. Measure the whole wall; the mural prints across it and the TV mounts on top. Choosing a design with a calmer area where the screen sits looks best." },
      { q: "Will it suit a rented home?", a: "Our current finishes are intended for long-term installation and are removed by dampening and peeling. A dedicated peel-and-stick option is on the way; until then, check with your landlord and see our removal guidance." },
    ],
  },

  "bedroom-wallpaper": {
    intro:
      "The bedroom rewards restraint — a mural here should help you wind down. Printed to your wall size, a calming scene behind the bed becomes the room's quiet anchor.",
    sections: [
      { heading: "How to choose bedroom wallpaper", body: "The wall behind the headboard is the natural home for a mural. Lean towards restful palettes — soft neutrals, muted greens and blues, gentle florals — and save higher-contrast designs for a dressing area or a single accent wall." },
      { heading: "Recommended design scale", body: "Because much of a bedroom feature wall sits behind the bed, choose a design whose focus reads above the headboard line. Large, unhurried compositions feel more serene than busy small-scale repeats." },
      { heading: "Quiet vs. statement", body: "Quiet: tonal washes and soft botanicals that recede at the edges. Statement: a deeper, moodier scene for a cocooning, boutique-hotel feel — kept to the headboard wall only." },
      { heading: "Recommended materials", body: MATERIALS_NOTE },
    ],
    faq: [
      { q: "What's the most restful choice?", a: "Soft, low-contrast designs in muted tones on a single wall behind the bed. Order a sample to check the colour reads as calm in your evening light." },
      { q: "Should I do one wall or the whole room?", a: "One feature wall behind the bed is the most reliable look; wrapping the whole room works best with a subtle, textural design so it doesn't overwhelm." },
    ],
  },

  "kids-wallpapers": {
    intro:
      "Kids' rooms can be playful without being loud. Printed to your wall, a mural gives a room character that a few posters never will — and it's easy to change the whole feel later.",
    sections: [
      { heading: "How to choose kids' wallpaper", body: "Pick a theme with a little longevity — animals, maps, gentle scenes and illustrated worlds outlast a fleeting favourite character. A feature wall behind the bed or play corner keeps it from becoming too much." },
      { heading: "Recommended design scale", body: "Bigger motifs suit small people — a large friendly scene reads better than tiny detail. We scale the design to your exact wall so nothing important lands behind furniture." },
      { heading: "Quiet vs. statement", body: "Quiet: soft skies, stars and gentle illustration for sleep-friendly calm. Statement: a bright, adventurous scene for a play wall, balanced by plain colour elsewhere." },
      { heading: "Recommended materials", body: MATERIALS_NOTE },
    ],
    faq: [
      { q: "Is it easy to wipe clean?", a: "Wipe gently with a barely-damp cloth and avoid harsh cleaners or scrubbing. For high-traffic spots, keep the mural above little hands where you can." },
      { q: "Will they grow out of it?", a: "Choose a theme rather than a single character and it lasts longer. When it's time for a change, the wall can be re-papered — removal is by dampening and peeling." },
    ],
  },

  "baby-nursery-wallpapers": {
    intro:
      "A nursery should feel soft and settling — for the baby and for you. A mural wallpaper design gives the room a gentle, considered backdrop from day one.",
    sections: [
      { heading: "How to choose nursery wallpaper", body: "Favour soft, low-contrast designs and calming palettes. A single wall — usually behind the cot or the feeding chair — is plenty; keep the rest of the room light and airy." },
      { heading: "Recommended design scale", body: "Gentle, open compositions feel more soothing than dense pattern. We print to your wall's exact size so the design sits well around the cot and shelving." },
      { heading: "Quiet vs. statement", body: "Quiet: pale skies, soft botanicals and muted animals. Statement (gently): a slightly richer scene on one wall, still kept calm in tone." },
      { heading: "Recommended materials", body: MATERIALS_NOTE },
    ],
    faq: [
      { q: "Is it safe for a nursery?", a: "Our murals are prepared for your order and intended for interior walls. Install on a clean, dry, well-prepared wall and allow it to settle before the room is in daily use. For any specific health question, we're happy to share what we can — email hello@zyvorah.com." },
      { q: "Which finish is best?", a: "A soft matte finish suits a nursery. Order a sample to confirm the colour feels as gentle in the room's real light." },
    ],
  },

  "home-office-wallpaper": {
    intro:
      "A considered wall makes a home office feel like a room you chose, not a corner you settled for — and it doubles as a video-call backdrop worth keeping.",
    sections: [
      { heading: "How to choose home-office wallpaper", body: "Think about what sits behind you on calls. A calm, characterful design reads well on camera without distracting; keep very busy or high-contrast patterns for a wall you don't sit against." },
      { heading: "Recommended design scale", body: "Mid-to-large compositions photograph better on webcams than fine detail. We scale to your wall so the framing behind your chair looks intentional." },
      { heading: "Quiet vs. statement", body: "Quiet: tonal, textural designs that keep focus on the work. Statement: a richer scene on the wall behind you for a distinctive backdrop." },
      { heading: "Recommended materials", body: MATERIALS_NOTE },
    ],
    faq: [
      { q: "Will it work as a video-call background?", a: "Yes — pick a design with a calmer area behind your seat so the camera reads it as a tasteful backdrop rather than a busy pattern." },
      { q: "Is it suitable for a commercial office too?", a: "Yes. Choose a design for the space; its page describes its assigned surface. Larger and commercial projects can be quoted via our Commercial page." },
    ],
  },

  "office-wallpaper": {
    intro:
      "The right wall lifts a workspace and carries your brand. Printed to any size, a mural turns a reception or meeting wall into something people remember.",
    sections: [
      { heading: "How to choose office wallpaper", body: "Reception and meeting-room feature walls have the most impact. Choose designs that reflect your brand's tone — calm and refined, or bold and expressive — and keep circulation areas simpler." },
      { heading: "Recommended design scale", body: "Commercial walls are large; open, large-scale compositions hold them best. We colour-match across drops so a big wall reads as one continuous piece." },
      { heading: "Quiet vs. statement", body: "Quiet: textural, tonal designs for focus areas. Statement: a signature scene for reception or a boardroom." },
      { heading: "Surface and feel", body: "Each design has its own surface, either smooth matte or with a linen feel. Its page shows the current price. For larger runs and project timelines, see our Commercial page for a quotation." },
    ],
    faq: [
      { q: "Do you handle larger commercial projects?", a: "Yes — see our Commercial page. Commercial runs are produced after design approval, colour-matched across drops, with delivery included in the quotation." },
      { q: "Can you match our brand colours?", a: "Order a design sample to confirm colour first; for bespoke brand artwork, our Bespoke design service can develop a mural to your brief." },
    ],
  },

  foyer: {
    intro:
      "The entryway is the first thing anyone sees — a small wall that sets expectations for the whole home. A mural wallpaper design makes that first impression count.",
    sections: [
      { heading: "How to choose foyer wallpaper", body: "Entryways are often narrow, so a mural here is seen up close and in passing. Pick a design that rewards a close look, and let it own the space since there's rarely competing furniture." },
      { heading: "Recommended design scale", body: "In tight halls, a design with depth or a vertical emphasis can make the space feel taller. We print to your exact wall so the composition suits the proportions." },
      { heading: "Quiet vs. statement", body: "Quiet: soft, elegant designs for a calm welcome. Statement: a bold scene to make a small space memorable." },
      { heading: "Recommended materials", body: MATERIALS_NOTE },
    ],
    faq: [
      { q: "My hallway is narrow — will a mural overwhelm it?", a: "No — because it's sized to your wall, the scale is controlled. Designs with depth can actually make a narrow space feel larger." },
    ],
  },

  "pooja-room-wallpaper": {
    intro:
      "A prayer or meditation space deserves a backdrop chosen with care. Printed to your exact wall, a mural can bring a sense of calm and reverence to the space — whatever your faith or practice.",
    sections: [
      { heading: "How to choose a design for a prayer space", body: "Choose motifs and colours that feel meaningful and serene to you. Many families prefer gentle, symmetrical or nature-inspired designs; we're glad to help you find something in keeping with your tradition — tell the Curator what feels right." },
      { heading: "Recommended design scale", body: "These are often smaller, focused walls, so a centred, calm composition works well behind the shrine or seating. We print to your exact size so the focal point sits where you want it." },
      { heading: "Quiet vs. statement", body: "Most prayer spaces suit quiet, contemplative designs. If you'd like a richer focal piece, keep the surrounding walls simple so the space stays restful." },
      { heading: "Recommended materials", body: MATERIALS_NOTE },
    ],
    faq: [
      { q: "Can you help me find something appropriate for my faith?", a: "Yes — we design for many traditions and want to get it right. Ask the Zyvorah Curator, or email hello@zyvorah.com, and we'll suggest designs in keeping with your practice." },
    ],
  },
};
