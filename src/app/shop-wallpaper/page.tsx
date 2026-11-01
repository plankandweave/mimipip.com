
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { getProductsByHandles } from "@/lib/queries";
import { WallpaperShortlist } from "@/components/WallpaperShortlist";

export const revalidate = 3600;
export const metadata: Metadata = brandMetadata({
  title: "Shop Mural Wallpaper Designs — A Shortlist for Your Home",
  description: "Choose from a small edit of Zyvorah wallpapers. See wall-size prices, order a design sample or ask for help with sizing and installation.",
  alternates: { canonical: "/shop-wallpaper" },
});

export default async function ShopWallpaperPage() {
  const products = await getProductsByHandles([
    "wildflower-reverie", "la-00026", "orchard-procession",
    "dual-momentum", "la-00047", "la-00029",
  ]);
  // An unavailable or image-less design must never become a paid landing card.
  return <WallpaperShortlist products={products.filter(p => p.image && !p.imageIsFlat && (p.measurementType ?? "area") === "area")} />;
}
