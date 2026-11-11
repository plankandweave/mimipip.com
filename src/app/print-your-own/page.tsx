
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductByHandle } from "@/lib/queries";
import { fetchPrintRules } from "@/lib/print-rules";
import { PrintYourOwn } from "@/components/PrintYourOwn";

export const metadata: Metadata = brandMetadata({
  title: "Your Own Image, On Your Wall",
  description: "Bring your own artwork and explore wallpaper sized to your wall.",
  alternates: { canonical: "/print-your-own" },
});

// The custom bespoke SKU (image-less, exempt from the flat-image rule) is the
// order vehicle — the customer's uploaded design becomes the printed artwork.
const CUSTOM_HANDLE = "custom-wallpaper";

export default async function PrintYourOwnPage({searchParams}:{searchParams:Promise<{edit?:string}>}) {
  const editItemId=(await searchParams).edit;
  const [product, printRules] = await Promise.all([getProductByHandle(CUSTOM_HANDLE), fetchPrintRules()]);
  if (!product) notFound();

  const materials = (product.product_materials ?? [])
    .filter((m) => m.available && m.materials)
    .map((m) => ({
      slug: m.materials!.slug,
      name: m.materials!.name,
      description: m.materials!.description,
      pricePerSqFt: Number(m.price_per_sqft),
      comingSoon: m.materials!.coming_soon,
      swatchUrl: m.materials!.swatch_url ?? null,
      textureUrl: m.materials!.texture_url ?? null,
      rollWidthMm: m.materials!.roll_width_mm ?? null,
    }))
    .sort((a, b) => Number(a.comingSoon) - Number(b.comingSoon) || a.pricePerSqFt - b.pricePerSqFt);

  return (
    <div className="container-x py-10">
      <PrintYourOwn editItemId={editItemId} productHandle={product.handle} productId={product.id} materials={materials} printRules={{ maxPanelCm: printRules.maxPanelCm, overlapCm: printRules.overlapCm }} />
    </div>
  );
}
