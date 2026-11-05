export type Material = {
  slug: string;
  name: string;
  description: string | null;
  default_price_per_sqft: number;
  coming_soon: boolean;
  swatch_url?: string | null;
  texture_url?: string | null;
  roll_width_mm?: number | null;
};

export type ProductMaterial = {
  price_per_sqft: number;
  available: boolean;
  materials: Material | null;
};

export type ProductImage = {
  url: string;
  alt: string | null;
  position: number;
  is_featured: boolean;
  is_flat: boolean;
  scene_key?: string | null;
  /** True measured pixels of the stored master (migration 0060). Null where the
   *  image predates capture — treat as "unknown", never as zero. */
  width?: number | null;
  height?: number | null;
};

export type Product = {
  flat_verified?: boolean;
  is_service?: boolean;
  id: string;
  handle: string;
  code: string | null;
  title: string;
  description: string | null;
  status: string;
  /** The brand that sells the design: "Zyvorah", or a sister brand such as
   *  "L'Orange Kids" (src/lib/lorange-kids.ts). */
  vendor?: string | null;
  created_at?: string | null;
  is_signature?: boolean;
  is_new?: boolean;
  is_showroom_favourite?: boolean;
  is_limited?: boolean;
  is_founders_favourite?: boolean;
  founders_note?: string | null;
  /** Price category (migration 0084). "standard" | "autograph". Autograph is
   *  ₹300/sq ft on linen-textured non-woven, exclusive to zyvorah.com. */
  price_tier?: string | null;
  /** Limited-edition wall art: the total edition size (e.g. 5). Null = open edition. */
  edition_limit?: number | null;
  /** Fixed [widthIn, heightIn] options for ready-size (peel & stick) designs; null = made-to-measure. */
  ready_sizes?: [number, number][] | null;
  orientation?: "vertical" | "horizontal" | null;
  /** Product category slug (product_categories) — decides pricing unit and which
   *  configuration tools apply. Defaults to "wallpaper" for every design. */
  category?: string | null;
  /** Per-metre price, for products in a category priced by the metre (Borders). */
  price_per_metre?: number | null;
  /** Border height in cm — its fixed dimension. Null off the length family. */
  border_height_cm?: number | null;
  /** How a length order arrives: one unbroken strip, or pieces of segment_length_m. */
  supply_format?: "continuous" | "segmented" | null;
  /** Length of one supplied piece in metres (1 m — five make a set). */
  segment_length_m?: number | null;
  /** Seamless tile: the artwork REPEATS across the wall at repeat_width_cm
   *  instead of one copy being scaled to fit it. Set in Studio; the pair is
   *  enforced together by a DB constraint, so a true here always has a width. */
  is_seamless?: boolean | null;
  repeat_width_cm?: number | null;
  product_images: ProductImage[];
  product_materials: ProductMaterial[];
  product_tags?: { tag: string }[];
  /** Embedded category row — present on card queries, so a card can branch on
   *  the family without a second round trip. */
  product_categories?: {
    pricing_unit: "sqft" | "metre" | "piece";
    measurement_type: "area" | "length" | "fixed" | null;
    card_label: string | null;
    /** The only medium the website may price from; null = all available. */
    web_material_slug?: string | null;
  } | null;
};

export type Collection = {
  handle: string;
  title: string;
  /** Editorial one-liner (collections.description); the page's meta
   *  description when set. Absent from older cached reads. */
  description?: string | null;
  kind: "category" | "mood" | "room" | "color" | "curated" | "other";
  rule_tag: string | null;
  /** Any-of tags for a sub-collection spanning two ("Floral & Botanical"). */
  rule_tags?: string[] | null;
  /** Restricts this listing to one product family (Borders, Canvas Art). */
  category_scope?: string | null;
  /** The family listing this one sits under. */
  parent_handle?: string | null;
  is_signature?: boolean;
  /** The collection's STATED picture language (migration 0141). Null means
   *  infer it, which is the default and the right answer for every collection
   *  but TAASH. */
  card_mode?: "scene" | "flat" | "scene-preferred" | null;
};

export type ShowcaseEntry = {
  handle: string;
  title: string;
  kind: "category" | "room" | "curated";
  rule_tag: string;
  n: number;
};

// A trimmed shape used by product cards / grids.
export type ProductCardData = {
  sampleable?: boolean;
  /** Optional crop into a single room panel of a composite editorial image. */
  roomPanel?: {sourceWidth:number;sourceHeight:number;x:number;y:number;width:number;height:number};
  cardImageCrop?: { x: number; y: number; columns: number; rows: number };
  handle: string;
  title: string;
  image: string | null;
  imageAlt: string;
  /** True when `image` is the bare flat pattern rather than a room render —
   *  i.e. the design has no render this card could show. The homepage refuses
   *  such a card (see `rendered()` in src/app/page.tsx). */
  imageIsFlat?: boolean;
  /** The Studio scene_key of `image` ("bedroom", "powder" …), null for the
   *  flat or an unscened mockup. What `showsRoom` (src/lib/rooms.ts) checks
   *  before a room tile may use the picture. */
  imageScene?: string | null;
  /** The clean flat artwork shown over the room preview on desktop hover. */
  flatHoverImage?: string | null;
  fromPricePerSqft: number | null;
  /** True for Canvas Wall Art — sold only at fixed sizes; NEVER render a ₹/sq ft rate. */
  isCanvas?: boolean;
  /** Lowest finished fixed-size price (canvas) — powers a "from ₹X" line in place of ₹/sq ft. */
  fromPrice?: number | null;
  tags?: string[];
  /** Short derived descriptor for cards, e.g. "Blue floral". */
  subtitle?: string;
  createdAt?: string | null;
  isSignature?: boolean;
  isNew?: boolean;
  isShowroom?: boolean;
  isLimited?: boolean;
  isFounders?: boolean;
  /** Autograph price tier specifically. Drives the Autograph BADGE only —
   *  for "may this appear off zyvorah.com?" use isExclusive, which is also
   *  true of the collaboration tiers. */
  isAutograph?: boolean;
  /** Sold only on zyvorah.com — Autograph, Saanjha or Atelier. This is what
   *  suppresses a design from reseller catalogues and channel exports; a check
   *  that named 'autograph' alone would leak every later tier. */
  isExclusive?: boolean;
  /** True for ready-size (fixed sizes, peel & stick) designs — changes card copy. */
  isReadySize?: boolean;
  /** Product category slug — cards branch on the category, not on pricing columns. */
  category?: string | null;
  /** The category's pricing unit, resolved server-side so client cards don't
   *  have to know which categories are sold by the metre. */
  pricingUnit?: "sqft" | "metre" | "piece" | null;
  /** Which product family this is — the one fact a card's copy turns on.
   *  area = made to the wall · length = per linear metre · fixed = finished size. */
  measurementType?: "area" | "length" | "fixed" | null;
  /** The category's promise line, owned by the DB
   *  so no card can borrow another family's words. */
  cardLabel?: string | null;
  sale?: import("@/brand/commerce/sale").Sale;
  /** Per-metre price for per-metre categories — replaces the ₹/sq ft card line. */
  pricePerMetre?: number | null;
  /** width ÷ height of the finished piece, for a family sold at a fixed shape
   *  (Canvas Art). The card frames the art at this ratio instead of cropping it
   *  square. Null wherever the shape is the customer's choice (wallpaper). */
  aspectRatio?: number | null;
  /** The clean flat pattern URL — length family only, whose card tiles the
   *  repeat as a running strip. Strictly the is_flat image: a lifestyle shot
   *  tiled edge-to-edge would repeat its furniture. */
  flatImage?: string | null;
  /** The border's fixed height in cm (length family) — stated on the card. */
  borderHeightCm?: number | null;
  /** True pixel size of the image ACTUALLY SHOWN on this card (a room render
   *  and the flat pattern behind it are different shapes, and the one that
   *  matters is the one on screen). Recorded on write — see
   *  src/lib/image-dimensions.ts. Null only where the file was never measured.
   *
   *  Load-bearing, not decoration: `src/lib/image-orientation.ts` decides from
   *  these which artwork a landscape frame is allowed to crop. */
  imageWidth?: number | null;
  imageHeight?: number | null;
  /** The studio's declaration that this artwork is a COMPOSED piece drawn for
   *  a wall of a given shape rather than a repeat — today only `"vertical"` is
   *  ever set. A composed vertical piece is never cropped into a landscape
   *  band; the crop would sell a different object than the one that arrives. */
  orientation?: "vertical" | "horizontal" | null;
};
