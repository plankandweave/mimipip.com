"use client";

import { useMarket } from "./MarketProvider";
import { ChooseDesign } from "./DesignCart";
import { ProductConfigurator } from "./ProductConfigurator";
import type { Sale } from "@/brand/commerce/sale";
import type { ComponentProps } from "react";

type Props = ComponentProps<typeof ProductConfigurator> & {
  native: { slug: string; name: string; art: string | null; sale: Sale };
};

/** The fixed-size wallpaper order is priced by Mimi Pip's native checkout. */
export function MimiWallpaperPurchase({ native, ...legacy }: Props) {
  const { market } = useMarket();
  if (!("unavailable" in legacy) && market.countryCode === "IN" && native.sale.india?.rate && native.art &&
      legacy.materials.some((material) => material.slug === "self-adhesive-vinyl" && !material.comingSoon) &&
      !legacy.isFixedSize && !legacy.readySizes?.length) {
    return <section id="create-your-wall" className="scroll-mt-28"><ChooseDesign slug={native.slug} name={native.name} width={null} height={null}
      custom wallpaper art={native.art} sale={native.sale} /></section>;
  }
  return <ProductConfigurator {...legacy} />;
}
