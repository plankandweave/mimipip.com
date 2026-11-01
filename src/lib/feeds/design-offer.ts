type MaterialOffer = {
  price_per_sqft: number;
  available: boolean;
  materials: { slug: string; coming_soon: boolean } | null;
};

/** Each wallpaper has one assigned surface; its own catalogue row sets the rate. */
export function designOffer(rows: MaterialOffer[]) {
  const offer = rows.find((row) =>
    row.available && !row.materials?.coming_soon &&
    (row.materials?.slug === "smooth-matt" || row.materials?.slug === "linen-touch") &&
    Number(row.price_per_sqft) > 0,
  );
  if (!offer) return null;
  return {
    rate: Number(offer.price_per_sqft),
    surface: offer.materials!.slug === "linen-touch" ? "linen feel" : "smooth matte surface",
    slug: offer.materials!.slug,
  };
}
