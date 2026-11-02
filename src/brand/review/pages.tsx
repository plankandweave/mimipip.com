import petals from "./happy-petals.json";
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
export function ReviewDetail({p, colourway}:{p:RecordData; colourway?:string}) {
 const choices = p.slug === "happy-petals" ? petals : [];
 const id = (label:string) => label.toLowerCase().replaceAll(" ", "-");
 const selected = choices.find(choice => id(choice.label) === colourway) ?? choices.find(choice => choice.label === "Signature Blue");
 if (selected) {
   const asset = (file:string) => "/review/happy-petals/" + file;
   const gallery = [
     {url:asset(selected.room), alt:"Happy Petals in " + selected.label + " shown in a room"},
     {url:asset(selected.flat), alt:"Happy Petals in " + selected.label + " flat artwork"}
   ];
   p = {...p, image:gallery[0].url, flatImage:gallery[1].url, gallery};
 }

 const panel=(p as RecordData & {roomPanel?:RoomPanelBounds}).roomPanel;
 const hopscotch = p.slug.startsWith("hopscotch-");
 const roomImage = {url:p.image, alt:p.imageRole};
 const flat = hopscotch ? card(p).flatHoverImage : null;
 const gallery = flat ? [roomImage, {url:flat, alt:p.name+" · flat sticker artwork"}] : p.gallery ?? [roomImage];
 const beep=p.slug==="beep-beep-stair-sticker-set";
 const wallpaper=p.type.some(type=>type.includes("wallpaper"));
 return <WallBuilderProvider><section className="container-x grid gap-10 py-8 lg:grid-cols-2">
  <WallBuilderStage gallery={<div>{panel?<RoomPanel src={p.image} alt={p.name+" shown in a room illustration"} panel={panel}/>:<ProductGallery images={gallery} title={p.name} fit="contain" showActions={false} showSample={false}/>}
   {selected && <p className="mt-3 text-sm">The styled room is a visualization. Your order includes wallpaper only. Furniture and accessories are for illustration. The pattern repeat needs a final print proof before production.</p>}
   {beep&&<><p>Illustrative application mockup · Stickers only · Furniture not included</p><figure className="mt-6"><img src="/listing-details/beep-beep/design-panels.svg" alt="Car, bus, train and airplane designs shown individually" className="mx-auto max-h-96"/><figcaption>Design illustration · Sizes to confirm</figcaption></figure></>}</div>}/>
  <div><Link href={'/browse/collection?value='+encodeURIComponent(p.collection[0])}>{label(p.collection[0])}</Link><h1>{p.name}</h1>
   {!wallpaper&&<p>Stickers only. Furniture and room accessories are not included.</p>}
   {hopscotch && <div><h2>Hopscotch floor game</h2><p>One connected contour-cut floor sticker, 75 × 260 cm.</p></div>}
   <p>{p.description}</p><WishlistButton handle={p.slug} variant="inline"/>
   {selected && <nav aria-label="Choose a colourway" className="my-5"><h2>Colourway · {selected.label}</h2><div className="flex flex-wrap gap-2">{choices.map(choice =>
    <Link key={choice.index} scroll={false} href={"?colourway=" + id(choice.label)} aria-current={choice.index === selected.index ? "true" : undefined} className="rounded border px-3 py-2 aria-current:font-bold">{choice.label}</Link>
   )}</div></nav>}
   <h2>Size and selection</h2><p>{p.widthCm&&p.heightCm?p.widthCm+" × "+p.heightCm+" cm · nominal design dimensions":p.measurementType==="made-to-measure"?"Made to wall measurements":"Size to confirm"}</p>
   <ChooseDesign slug={p.slug} name={selected ? p.name + " — " + selected.label : p.name} width={p.widthCm} height={p.heightCm} custom={p.measurementType==="made-to-measure"} wallpaper={wallpaper} indiaRate={p.sourceIndiaPricePerSqft} art={wallpaper?card(p).flatHoverImage:null}/>
   {hopscotch && <section className="my-6 space-y-2"><h2>How to play</h2>
    <p>Start below 1 on a clear, level indoor floor. Step onto 1, then place one foot on each square of the next pair. Follow the numbers to 10 and walk back beside the sticker. Try small hops when comfortable.</p>
    <p>For Secret Stop, choose a number before starting. Freeze on that number, then continue to 10. Take turns choosing the next stop.</p>
    <Link className="underline" href="/play/hopscotch-peach-pop/">Explore four ways to play Hopscotch</Link></section>}
   {beep&&<section><h2>Inside the design</h2><p>A car, bus, train and airplane fill four sky-blue scenes for vertical, closed stair risers.</p>
    <h3>What comes in the pack?</h3><p>Supplied piece count, sheet layout, accessories and packaging are awaiting confirmation. The four pictured designs show the artwork.</p>
    <h3>Will it fit my stairs?</h3><p>Measure each vertical riser separately. Record its clear width and height and note handles, trim or curves. Panel dimensions and trim allowance need confirmation.</p>
    <h3>How do I apply and clean it?</h3><p>Material, adhesive, compatible surfaces, installation, removal and cleaning instructions are awaiting confirmation for this design.</p></section>}
   <section aria-label="Planning help">{[
    ["Check your surface","Identify the surface and finish before ordering. For textured, freshly painted or damp surfaces, confirm suitability for this design first.","/materials"],
    ["How to measure",wallpaper?"Measure the full wall in several places. Enter its widest width and tallest height in your selected unit. Note doors and windows separately.":"Measure the clear area where the design will sit. Compare both dimensions with the product size, allowing for handles, trim and edges.","/how-to-measure"],
    ["Installation and removal","Check the instructions for your product and surface before fitting. Test an inconspicuous spot first; removal depends on the adhesive and the underlying finish.","/installation"]
   ].map(([title,body,url])=><details key={title} className="border-b py-3"><summary className="cursor-pointer font-semibold">{title}</summary><p className="mt-2">{body}</p><Link className="underline" href={url}>Read the full guide</Link></details>)}</section></div>
 </section></WallBuilderProvider>;
}

