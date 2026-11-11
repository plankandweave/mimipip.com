"use client";

import { useMarket } from "./MarketProvider";
import { ChooseDesign } from "./DesignCart";
import { ProductConfigurator } from "./ProductConfigurator";
import type { Sale } from "@/brand/commerce/sale";
import { useState, useEffect, type ComponentProps } from "react";

type Props = ComponentProps<typeof ProductConfigurator> & {
  native: { slug: string; name: string; art: string | null; sale: Sale };
};

/** The fixed-size wallpaper order is priced by Mimi Pip's native checkout. */
export function MimiWallpaperPurchase({ native, ...legacy }: Props) {
  const { market } = useMarket();
  const [customTools,setCustomTools] = useState(false);
  const [sampleRequested,setSampleRequested] = useState(false);
  useEffect(()=>{const open=()=>{setSampleRequested(true);setCustomTools(true);};window.addEventListener("zyv:open-sample",open);return()=>window.removeEventListener("zyv:open-sample",open);},[]);
  if (!("unavailable" in legacy) && market.countryCode === "IN" && native.sale.india?.rate && native.art && !legacy.isFixedSize && !legacy.editItemId && !legacy.autoStart && !legacy.autoOpenSample && !customTools) {
    return <section id="create-your-wall" className="scroll-mt-28">
      <p className="mb-4 text-sm text-slate">Smooth peel-and-stick wallpaper with a removable, self-adhesive backing.</p>
      <ChooseDesign slug={native.slug} name={native.name} width={null} height={null}
        onCustom={()=>setCustomTools(true)} custom wallpaper art={native.art} sale={native.sale} />
    </section>;
  }
  return <ProductConfigurator {...legacy} {...(!("unavailable" in legacy)?{autoOpenSample:legacy.autoOpenSample || sampleRequested}:{})} />;
}
