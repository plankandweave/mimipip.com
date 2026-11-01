import { ART_STYLE_RULE } from "@/lib/art-style";

/** Browse tags describe visible design features, not the fact that it is artwork. */
export const STYLE_DEFINITIONS: Record<string, string> = {
  Landscape: "A recognisable spatial scene: terrain, countryside, forest vista, sea/coast or cityscape. Not a flat botanical arrangement, isolated flower, abstract colour bands or landscape image orientation.",
  Masterpiece: "A substantial composed fine-art painting or detailed pictorial mural with a clear artistic focal composition. Not a quality score, a synonym for every artwork, a simple repeat or a generic texture. Do not imply a named artist or historical provenance.",
  Floral: "Flowers or blossoms are a noticeable design subject. Leaves alone, abstract petal-like shapes, or tiny incidental flowers do not qualify.",
  Botanical: "Recognisable plants, leaves, branches, trees or flowers form a noticeable design subject. Abstract organic curves alone do not qualify.",
  Vintage: "A visibly historical or period design language: antique illustration, engraving, old-world ornament, archival print or deliberate aged period aesthetic. Beige, muted colours or grain alone do not qualify.",
  Geometric: "Deliberately composed or repeated geometric shapes, grids, stripes, chevrons or precise linear structures are central. The mere presence of architectural buildings does not qualify.",
  Casual: "An informal, relaxed, uncomplicated design. Do not apply to solemn devotional imagery or elaborate formal/ceremonial compositions.",
  "Acrylic on Canvas": "A visible acrylic-painting appearance: opaque layered paint, substantial expressive brushwork or impasto. Never infer the actual physical medium or canvas substrate from pixels, and do not apply to line drawings, photographic scenes, transparent watercolour or vector repeats.",
  Pattern: "A repeated motif, rhythm, tessellation or all-over decorative arrangement. Not a generic synonym for every wallpaper, and not a single pictorial scene or freely composed painting.",
  Textures: "A primarily surface-led design: plaster, stone, fabric, grain, patina or nonfigurative surface variation. Not every painting with visible brushstrokes.",
  Textured: "Clearly visible simulated tactile surface character such as weave, plaster, raised paint or grain is a meaningful part of the design. Do not infer physical relief or tag every image because it has pixels or shading.",
  Chinoiserie: "A recognisable chinoiserie decorative language: stylised East Asian garden motifs, delicate branching florals/birds, pagodas or related ornamental compositions. Generic tropical leaves or any flower/bird alone are insufficient.",
  "Indian Ethnic": "Recognisable Indian traditional/folk/heritage motifs, architecture, ornament or cultural iconography. A product's Indian name or Indian seller does not qualify it.",
  Abstract: "Nonliteral shapes, marks, colour fields or substantially abstracted forms dominate. A naturalistic portrait, landscape, seascape or flower painting does not become Abstract because it is painted.",
  Quirky: "Clearly whimsical, eccentric, surreal or unexpectedly playful motifs/combinations. Bright colours alone do not qualify.",
  Watercolor: "Visible watercolour character: transparent washes, pigment blooms, soft bleeds or fluid translucent marks. Any blue image, water subject or painting is not automatically Watercolor.",
  Birds: "Recognisable birds are a noticeable motif or subject. Leaf shapes or tiny incidental background specks are insufficient.",
  Animal: "Recognisable animals, including birds or aquatic animals, are a noticeable subject. Abstract organic forms do not qualify.",
  Japandi: "Restrained Japanese/Scandinavian visual character: spare composition, quiet organic forms, minimal detail and muted natural palette. Beige alone is insufficient; dense ornate scenes and busy florals do not qualify.",
  "Ceiling Wallpaper": "A composition genuinely suitable overhead: sky, cloud, star field, overhead canopy or ceiling-oriented ornamental field. Do not add to upright portraits or ground-level scenes solely because any print could be mounted overhead.",
  Bold: "Strong visual impact through pronounced contrast, saturated colour, assertive large forms or dense dramatic composition. Not a synonym for beautiful or premium.",
  Modern: "Clearly contemporary abstraction, graphic composition, minimalism or modern design language. Do not apply automatically to every newly uploaded design or conventional antique/historical illustration.",
  Spiritual: "Recognisable sacred, devotional, religious or spiritual iconography/composition. A calm landscape or meditative colour palette alone is insufficient.",
  Tropical: "Recognisable tropical foliage, palms, lush exotic vegetation or tropical fauna forms a noticeable subject. Generic flowers, all greenery and ordinary forests are not automatically tropical.",
};

export const STYLE_RULES_PROMPT = ART_STYLE_RULE + "\n\nStyle and subject definitions:\n" +
  Object.entries(STYLE_DEFINITIONS).map(([tag, rule]) => `${tag}: ${rule}`).join("\n") +
  "\nChoose only tags with clear visible evidence in the printed design. Ignore the room furniture, title and marketing adjectives as evidence. Several tags may fit; do not force a tag count or guess uncertain styles.";
