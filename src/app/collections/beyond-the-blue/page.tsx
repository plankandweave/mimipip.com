
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from 'next';
import { BlueExperience } from './BlueExperience';
import { BLUE_DESIGNS, blueHandle, blueAsset } from '@/lib/beyond-the-blue';
import { getProductsByTag } from '@/lib/queries';
import { JsonLd } from '@/components/JsonLd';
import './blue.css';

export const revalidate = 300;
export const metadata: Metadata = editorialMetadata("/collections/beyond-the-blue");
  async function Page() {
  const products = await getProductsByTag('Beyond the Blue', 30);
  const liveHandles = products.map(p => p.handle);
  return <>
    <JsonLd data={{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Beyond the Blue', url: 'https://zyvorah.com/collections/beyond-the-blue', mainEntity: { '@type': 'ItemList', numberOfItems: liveHandles.length, itemListElement: BLUE_DESIGNS.flatMap(d => [false,true].filter(r => liveHandles.includes(blueHandle(d.slug,r))).map(r => ({ '@type':'ListItem', name: d.name + (r ? ' — Repeat' : ' — Mural'), url: `https://zyvorah.com/products/${blueHandle(d.slug,r)}` }))).map((d,i)=>({...d,position:i+1})) } }} />
    <BlueExperience liveHandles={liveHandles} />
  </>;
}

export default withBrandEditorial("/collections/beyond-the-blue", Page);
