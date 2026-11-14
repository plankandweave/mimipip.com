"use client";
import { useState } from 'react';
import Link from 'next/link';
import { ChooseDesign } from './DesignCart';
import { useMarket } from './MarketProvider';
import type { Sale } from '@/brand/commerce/sale';
import { MIMIPIP_PRICING } from '@/brand/pricing-policy';
import styles from './HushWanderCollection.module.css';

const colorSwatches: Record<string, string> = {
  peach: '#e9bda1', green: '#a4b79a', blue: '#9ebdcb', yellow: '#e8c975',
  pink: '#dfb3b1', cream: '#f1e5cc', brown: '#ad8b70', orange: '#d69c6d',
  grey: '#b8bab5', gray: '#b8bab5', white: '#f8f5ec', purple: '#baa9c3',
};


type Design = { slug:string; name:string; image:string; colors:string[]; description:string; sale:Sale; art:string|null };
export function HushWanderShop({designs}:{designs:Design[]}) {
  const {market}=useMarket();
  const [selected,setSelected]=useState<string|null>(null);
  const india=market.countryCode==="IN";
  const money=(value:number)=>new Intl.NumberFormat(india?"en-IN":"en-US",{style:"currency",currency:india?"INR":"USD",maximumFractionDigits:2}).format(value);
  return <div className={styles.grid}>{designs.map((design,index)=>{
    const offer=india?design.sale.india:design.sale.abroad;
    const open=selected===design.slug;
    const buyId="buy-"+design.slug;
    return <article key={design.slug} className={styles.card}>
      <Link href={`/products/${design.slug}`} className={styles.roomLink} aria-label={`View ${design.name} wallpaper details`}>
        <img src={design.image} alt={`${design.name} wallpaper in a nursery room setting`} width={1536} height={1024} loading={index<2?"eager":"lazy"}/>
      </Link>
      <div className={styles.cardBody}>
        <h3 className={styles.productTitle}>{design.name}</h3>
        <p className={styles.moment}>{design.description}</p>
        <div className={styles.colors} aria-label="Design colours">{design.colors.map(color=><span key={color} title={color} role="img" aria-label={color} style={{backgroundColor:colorSwatches[color.toLowerCase()]??"#d6c8b5"}}/>)}</div>
        {offer?.rate && <p className={styles.price}>{money(india?offer.rate/(1+(MIMIPIP_PRICING.gstRate??0)):offer.rate)} / sq ft{india?" + GST":""}<span>Peel-and-stick wall covering · Delivery included</span></p>}
        {offer && design.art ? <>
          <button type="button" className={styles.buyButton} aria-expanded={open} aria-controls={buyId} onClick={()=>setSelected(open?null:design.slug)}>{open?"Close size options":"Choose size & add to cart"}</button>
          {open && <section id={buyId} className={styles.purchase} aria-label={`Buy ${design.name}`}>
            <ChooseDesign slug={design.slug} name={design.name} width={null} height={null} custom wallpaper art={design.art} sale={design.sale}/>
          </section>}
        </> : <p className={styles.moment}>This design is not currently available in your country.</p>}
        <Link href={`/products/${design.slug}`} className={styles.detailsLink}>View design details</Link>
      </div>
    </article>;
  })}</div>;
}
