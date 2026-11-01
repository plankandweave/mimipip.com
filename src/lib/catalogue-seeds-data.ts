export type SeedImage = {
  file: string;
  alt: string;
  position: number;
  isFlat: boolean;
  isFeatured: boolean;
  sceneKey: string | null;
  width: number;
  height: number;
};

export type SeedProduct = {
  handle: string;
  title: string;
  description: string;
  tags: string[];
  images: SeedImage[];
  category?: "wallpaper" | "border";
  border?: { heightCm: number; pricePerMetre: number; segmentLengthM: number };
};

export type CatalogueSeed = {
  /** Add reviewed scenes to existing active designs, without creating or
   *  changing products, pricing, names, or existing images. */
  imagesOnly?: boolean;
  /** public/ folder holding `<product handle>/<file>`. */
  assetDir: string;
  /** Media-bucket key prefix the files are copied to. */
  mediaPrefix: string;
  materialSlug: string;
  /** ₹ per sq ft, GST-inclusive. */
  ratePerSqFt: number;
  products: SeedProduct[];
  /** Who is paid a royalty on these products, if anyone. An existing partner
   *  whose slug, name or legal name contains `match` is reused; otherwise this
   *  row is created. */
  royalty?: { slug: string; name: string; legalName: string; rate: number; match: string };
  /** Inserted last; its existence marks the seed as published. */
  collection: {
    handle: string;
    title: string;
    description: string;
    kind: "curated" | "other";
    rule_tag: string;
    image_url: string;
    position: number;
    hero_product_handle: string;
    category_scope?: string;
    parent_handle?: string;
  };
};


/** No brand products are registered until individually configured. */
export const brandCatalogueSeeds: CatalogueSeed[] = [];
