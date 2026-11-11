import { RoomPanel, type RoomPanelBounds } from "@/components/RoomPanel";
import { ChooseDesign } from "@/components/DesignCart";
import { saleOf } from "@/brand/commerce/sale";
import { WishlistButton } from "@/components/WishlistButton";
import Link from 'next/link';
import HeroSlider from '@/components/HeroSlider';
import { CollectionPhotoHeader } from './CollectionPhotoHeader';
import { ProductCard } from '@/components/ProductCard';
import { ProductGallery } from '@/components/ProductGallery';
import { WallBuilderProvider, WallBuilderStage } from '@/components/WallBuilderStage';
import { axes, browseHref, catalogue, card, collectionDesigns, filter, label, options, type Axis, type RecordData } from './data';
const grid=(products:RecordData[])=><div className="grid grid-cols-2 gap-5 md:grid-cols-4">{products.map(p=><ProductCard key={p.id} product={card(p)}/>)}</div>;
export function Browse({axis,value}:{axis:Axis;value:string}){
 const hits=axis==='collection'&&value?collectionDesigns(value):filter(axis,value);
 const collection=axis==='collection';
 const headerHits=collection&&!value?['happy-petals','hush-and-wander','playroom-stories','hopscotch'].map(handle=>collectionDesigns(handle)[0]).filter((design):design is RecordData=>Boolean(design)):hits;
 const title=!value?'Shop by Collection':value==='happy-petals'?'Happy Petals collection':value==='dotty-days'?'Dotty Days':value==='playroom-stories'?'Playroom Stories':value==='hush-and-wander'?'Hush & Wander':label(value);
 const description=value==='happy-petals'?<>Soft florals for nurseries, bedrooms and playrooms. Explore each artwork and its styled room view. For availability, contact <a href="mailto:hello@mimipip.com" className="underline">hello@mimipip.com</a>.</>:value==='dotty-days'?'Perfect little polka dots and wonderfully scattered spots. Playful patterns for bright beginnings and growing imaginations.':value==='playroom-stories'?'Eleven illustrated wallpaper stories for community playrooms and shared children’s areas. Choose a design and enter your wall measurements to see its price.':value==='hush-and-wander'?'Eleven softly painted nursery murals. Choose a story, enter your wall measurements, and see your price.':undefined;
 return <section className="container-x py-12">
  {collection?<CollectionPhotoHeader handle={value || 'all-collections'} title={title} description={description} designs={headerHits}/>:<h1>Shop by {label(axis)}</h1>}
  <details className="my-4"><summary className="cursor-pointer">Browse by {label(axis)}</summary><nav aria-label="Filter designs" className="flex flex-col items-start gap-2 py-3"><Link href={'/browse/'+axis}>All</Link>{options(axis).map(v=><Link key={v} href={browseHref(axis,v)}>{label(v)}</Link>)}</nav></details>
  <p className="mb-5" id="collection-designs">{hits.length} designs</p>{grid(hits)}
 </section>;
}
export function ReviewDetail({p}:{p:RecordData}) {
 const happyPetals = p.collection.includes("happy-petals");
 const panel=(p as RecordData & {roomPanel?:RoomPanelBounds}).roomPanel;
 const hopscotch = p.slug.startsWith("hopscotch-");
 const roomImage = {url:p.image, alt:p.imageRole};
 const flat = hopscotch ? card(p).flatHoverImage : null;
 const gallery = flat ? [roomImage, {url:flat, alt:p.name+" · flat sticker artwork"}] : p.gallery ?? [roomImage];
 const beep=p.slug==="beep-beep-stair-sticker-set";
 const wallpaper=p.type.some(type=>type.includes("wallpaper"));
 return <WallBuilderProvider><section className="container-x grid gap-10 py-8 lg:grid-cols-2">
  <WallBuilderStage gallery={<div>{panel?<RoomPanel src={p.image} alt={p.name+" shown in a room illustration"} panel={panel}/>:<ProductGallery images={gallery} title={p.name} fit="contain" showActions={false} showSample={false}/>}
   {happyPetals && <p className="mt-3 text-sm">The styled room is a visualization. Your order includes wallpaper only. Furniture and accessories are for illustration.</p>}
   {beep&&<><p>Illustrative application mockup · Stickers only · Furniture not included</p><figure className="mt-6"><img src="/listing-details/beep-beep/design-panels.svg" alt="Car, bus, train and airplane designs shown individually" className="mx-auto max-h-96"/><figcaption>Design illustration</figcaption></figure></>}</div>}/>
  <div><Link href={happyPetals ? "/collections/happy-petals/" : "/browse/collection?value="+encodeURIComponent(p.collection[0])}>{label(p.collection[0])}</Link><h1>{p.name}</h1>
   {!wallpaper&&<p>Stickers only. Furniture and room accessories are not included.</p>}
   {hopscotch && <div><h2>Hopscotch floor game</h2><p>One connected contour-cut floor sticker, 75 × 260 cm.</p></div>}
   <p>{p.description}</p><WishlistButton handle={p.slug} variant="inline"/>
   {happyPetals && <p className="my-4">SKU {p.id} · <Link className="underline" href="/collections/happy-petals/">Explore all Happy Petals designs</Link></p>}
   {!happyPetals && <><h2>Size and price</h2><p>{p.widthCm&&p.heightCm?p.widthCm+" × "+p.heightCm+" cm · nominal design dimensions":p.measurementType==="made-to-measure"?"Made to your wall measurements":""}</p>
   <ChooseDesign slug={p.slug} name={p.name} width={p.widthCm} height={p.heightCm} custom={p.measurementType==="made-to-measure"} wallpaper={wallpaper} sale={saleOf(p.slug)} art={wallpaper?card(p).flatHoverImage:null}/></>}{happyPetals && <p className="my-5">Like this design? <a className="underline" href={'mailto:hello@mimipip.com?subject='+encodeURIComponent('Happy Petals · '+p.name)}>Ask MimiPip about availability</a>.</p>}
   {hopscotch && <section className="my-6 space-y-2"><h2>How to play</h2>
    <p>Start below 1 on a clear, level indoor floor. Step onto 1, then place one foot on each square of the next pair. Follow the numbers to 10 and walk back beside the sticker. Try small hops when comfortable.</p>
    <p>For Secret Stop, choose a number before starting. Freeze on that number, then continue to 10. Take turns choosing the next stop.</p>
    <Link className="underline" href="/play/hopscotch-peach-pop/">Explore four ways to play Hopscotch</Link></section>}
   {beep&&<section><h2>Inside the design</h2><p>A car, bus, train and airplane fill four sky-blue scenes for vertical, closed stair risers.</p>
    <h3>Will it fit my stairs?</h3><p>Measure each vertical riser separately. Record its clear width and height and note handles, trim or curves.</p></section>}
   <section aria-label="Planning help">{[
    ["Check your surface","Identify the surface and finish before ordering. For textured, freshly painted or damp surfaces, confirm suitability for this design first.","/materials"],
    ["How to measure",wallpaper?"Measure the full wall in several places. Enter its widest width and tallest height in your selected unit. Note doors and windows separately.":"Measure the clear area where the design will sit. Compare both dimensions with the product size, allowing for handles, trim and edges.","/how-to-measure"],
    ["Installation and removal","Check the instructions for your product and surface before fitting. Test an inconspicuous spot first; removal depends on the adhesive and the underlying finish.","/installation"]
   ].map(([title,body,url])=><details key={title} className="border-b py-3"><summary className="cursor-pointer font-semibold">{title}</summary><p className="mt-2">{body}</p><Link className="underline" href={url}>Read the full guide</Link></details>)}</section></div>
 </section></WallBuilderProvider>;
}

