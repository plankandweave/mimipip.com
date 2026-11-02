import { RoomPanel, type RoomPanelBounds } from "@/components/RoomPanel";
import { ChooseDesign } from "@/components/DesignCart";
import { WishlistButton } from "@/components/WishlistButton";
import Link from 'next/link';
import HeroSlider from '@/components/HeroSlider';
import { ProductCard } from '@/components/ProductCard';
import { ProductGallery } from '@/components/ProductGallery';
import { WallBuilderProvider, WallBuilderStage } from '@/components/WallBuilderStage';
import { axes, catalogue, card, filter, label, options, type Axis, type RecordData } from './data';
const grid=(products:RecordData[])=><div className="grid grid-cols-2 gap-5 md:grid-cols-4">{products.map(p=><ProductCard key={p.id} product={card(p)}/>)}</div>;
export function Browse({axis,value}:{axis:Axis;value:string}){const hits=filter(axis,value);return <section className="container-x py-12"><h1>{axis==='collection'&&value==='dotty-days'?'Dotty Days':<>Shop by {label(axis)}</>}</h1>{axis==='collection'&&value==='dotty-days'&&<p className="mt-3 max-w-2xl text-lg">Perfect little polka dots and wonderfully scattered spots. Playful patterns for bright beginnings and growing imaginations.</p>}<nav aria-label="Filter designs" className="flex flex-wrap gap-4 py-4"><Link href={'/browse/'+axis}>All</Link>{options(axis).map(v=><Link key={v} href={'/browse/'+axis+'?value='+encodeURIComponent(v)}>{label(v)}</Link>)}</nav><p>{hits.length} designs</p>{grid(hits)}</section>}
export function ReviewDetail({p}:{p:RecordData}) {
 const panel=(p as RecordData & {roomPanel?:RoomPanelBounds}).roomPanel;
 const beep=p.slug==="beep-beep-stair-sticker-set";
 const wallpaper=p.type.some(type=>type.includes("wallpaper"));
 return <WallBuilderProvider><section className="container-x grid gap-10 py-8 lg:grid-cols-2">
  <WallBuilderStage gallery={<div>{panel?<RoomPanel src={p.image} alt={p.name+" shown in a room illustration"} panel={panel}/>:<ProductGallery images={p.gallery??[{url:p.image,alt:p.imageRole}]} title={p.name} fit="contain" showActions={false} showSample={false}/>}
   {beep&&<><p>Illustrative application mockup · Stickers only · Furniture not included</p><figure className="mt-6"><img src="/listing-details/beep-beep/design-panels.svg" alt="Car, bus, train and airplane designs shown individually" className="mx-auto max-h-96"/><figcaption>Design illustration · Sizes to confirm</figcaption></figure></>}</div>}/>
  <div><Link href={'/browse/collection?value='+encodeURIComponent(p.collection[0])}>{label(p.collection[0])}</Link><h1>{p.name}</h1>
   {!wallpaper&&<p>Stickers only. Furniture and room accessories are not included.</p>}
   <p>{p.description}</p><WishlistButton handle={p.slug} variant="inline"/>
   <h2>Size and selection</h2><p>{p.widthCm&&p.heightCm?p.widthCm+" × "+p.heightCm+" cm · nominal design dimensions":p.measurementType==="made-to-measure"?"Made to wall measurements":"Size to confirm"}</p>
   <ChooseDesign slug={p.slug} name={p.name} width={p.widthCm} height={p.heightCm} custom={p.measurementType==="made-to-measure"} wallpaper={wallpaper}/>
   {beep&&<section><h2>Inside the design</h2><p>A car, bus, train and airplane fill four sky-blue scenes for vertical, closed stair risers.</p>
    <h3>What comes in the pack?</h3><p>Supplied piece count, sheet layout, accessories and packaging are awaiting confirmation. The four pictured designs show the artwork.</p>
    <h3>Will it fit my stairs?</h3><p>Measure each vertical riser separately. Record its clear width and height and note handles, trim or curves. Panel dimensions and trim allowance need confirmation.</p>
    <h3>How do I apply and clean it?</h3><p>Material, adhesive, compatible surfaces, installation, removal and cleaning instructions are awaiting confirmation for this design.</p></section>}
   <nav aria-label="Planning help" className="mt-4 flex flex-wrap gap-4"><Link href="/materials">Check your surface</Link><Link href="/how-to-measure">How to measure</Link><Link href="/installation">Installation and removal</Link></nav></div>
 </section></WallBuilderProvider>;
}

