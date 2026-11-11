"use client";
import {useEffect,useState} from "react";
import {toCm, type Unit} from "@/lib/pricing";
import {useMarket} from "./MarketProvider";
import {DesignVisualizer} from "./DesignVisualizer";
import {RoomVisualizer} from "./RoomVisualizer";
import { fixedPrice, WALLPAPER_FIXED_SIZES } from '@/brand/commerce/prices';
const ignoreMeta=()=>{};
import games from "../../floor-games/products.json";
import {readLines,saveLines,addLine,wallpaperPrice,linePayload,type Line} from "./design-cart-store";
import type {Sale} from "@/brand/commerce/sale";
export function ChooseDesign({slug,name,width,height,custom,wallpaper,art,sale,floorArtwork,sku,onCustom}:{slug:string;name:string;width:number|null;height:number|null;custom:boolean;wallpaper:boolean;art?:string|null;sale:Sale;floorArtwork?:string;sku?:string;onCustom?:()=>void}){
 const {market}=useMarket();
 const [w,W]=useState(""),[h,H]=useState(""),[qty,Q]=useState(1),[status,S]=useState("");
 const [sizeChoice,setSizeChoice]=useState<"fixed-0"|"fixed-1"|"fixed-2"|"custom">("fixed-0");
 const hopscotch = slug.startsWith("hopscotch-");
 const [mode,show]=useState<"size"|"room"|null>(null),[crop,setCrop]=useState({offsetX:.5,offsetY:.5,zoom:1,flipH:false,flipV:false});
 const [unit,setUnit]=useState<Unit | "mm">("cm");
 function changeUnit(next: Unit | "mm") {
   const convert = (value:string) => value ? String(Number((toCm(Number(value),unit)/toCm(1,next)).toPrecision(12))) : "";
   W(convert(w)); H(convert(h)); setUnit(next);
 }
 const india=market.countryCode==="IN";
 const fixedSelection=custom&&wallpaper&&india&&sizeChoice!=="custom";
 const fixedIndex=fixedSelection?Number(sizeChoice.slice(-1)):0;
 const selectedFixed=WALLPAPER_FIXED_SIZES[fixedIndex];
 const wallWidth=fixedSelection?selectedFixed[0]*30.48:toCm(Number(w),unit),wallHeight=fixedSelection?selectedFixed[1]*30.48:toCm(Number(h),unit),ready=wallWidth>0&&wallHeight>0&&wallWidth>=10&&wallHeight>=10&&wallWidth<=3000&&wallHeight<=3000;
 const [selection,select]=useState<"size"|"room"|null>(null);
 useEffect(()=>{const open=()=>{select("room");if(ready)show("room");else document.getElementById("mimi-wall-width")?.focus();};window.addEventListener("zyv:open-visualizer",open);return()=>window.removeEventListener("zyv:open-visualizer",open);},[ready]);
 const payload=art&&ready?{...crop,imageUrl:art,wallWidthCm:wallWidth,wallHeightCm:wallHeight}:undefined;
 const game=games.find(g=>g.slug===slug);
 const colors=games.filter(g=>g.slug.startsWith("hopscotch-"));
 const size=fixedSelection?`${selectedFixed[0]} × ${selectedFixed[1]} ft`:custom?wallWidth+" × "+wallHeight+" cm":width&&height?width+" × "+height+" cm":game?game.width_mm/10+" × "+game.height_mm/10+" cm":"";
 const offer=india?sale.india:sale.abroad;
 const currency=india?"INR":"USD";
 // Match the server quote using the GST-inclusive selling rate.
 const amount=!offer?null:offer.fixed??(offer.rate&&ready?Math.round((fixedSelection?wallWidth*wallHeight/929.0304:Math.max(wallWidth*wallHeight/929.0304,20))*offer.rate*100)/100:null);
 const fmt=(n:number)=>new Intl.NumberFormat("en",{style:"currency",currency,maximumFractionDigits:n%1?2:0}).format(n);
 if(!offer){const listed=fixedPrice(slug,india?'IN':'ABROAD');return <div className="my-5">{listed!==null&&<p className="text-xl font-semibold">{fmt(listed)}{india?' including GST':''}</p>}<p>Currently unavailable to order. <a className="underline" href="/contact">Ask us about this design</a>.</p></div>;}
 return <><form className="my-5 grid gap-3" onSubmit={e=>{e.preventDefault();try{if(amount===null){S("Enter your wall size first.");return;}saveLines(addLine(readLines(),{slug,name,size,qty,amount,sku,artworkUrl:floorArtwork,currency,stickersOnly:!wallpaper,wallpaper,rate:offer.rate,crop:payload,dimensions:custom?{width:wallWidth,height:wallHeight}:undefined,fixedSize:fixedSelection}));S("Added to your cart.");(window as unknown as {mimipipFunnel?:(e:string,s:string)=>void}).mimipipFunnel?.("add_to_cart",slug);}catch{S("Could not save this selection on this device.");}}}>

 {hopscotch&&<label>Colourway <select value={slug} onChange={e=>window.location.assign("/products/"+e.target.value)}>{colors.map(g=><option key={g.slug} value={g.slug}>{g.colourway}</option>)}</select></label>}
 {custom&&wallpaper&&india&&<fieldset className="grid grid-cols-2 gap-2"><legend className="mb-2 font-semibold">Size</legend>{WALLPAPER_FIXED_SIZES.map(([fw,fh],i)=><button type="button" key={i} aria-pressed={sizeChoice===`fixed-${i}`} onClick={()=>setSizeChoice(`fixed-${i}` as typeof sizeChoice)} className={`rounded-lg border p-2 ${sizeChoice===`fixed-${i}`?'border-charcoal bg-charcoal text-white':''}`}>{fw} × {fh} ft · {fmt(fw*fh*(offer.rate??0))}</button>)}<button type="button" aria-pressed={sizeChoice==='custom'} onClick={()=>{if(onCustom)onCustom();else setSizeChoice('custom');}} className={`rounded-lg border p-2 ${sizeChoice==='custom'?'border-charcoal bg-charcoal text-white':''}`}>Custom size</button></fieldset>}
 {custom&&!fixedSelection&&<fieldset className="grid grid-cols-2 gap-3"><legend>Your wall measurements</legend><label className="col-span-2">Measurement unit <select value={unit} onChange={e=>changeUnit(e.target.value as Unit | "mm")}>
   <option value="cm">Centimetres</option><option value="mm">Millimetres</option><option value="in">Inches</option><option value="ft">Feet</option>
 </select></label>{([[w,W,"Width"],[h,H,"Height"]] as const).map(([val,set,label])=><label className="grid gap-1" key={label}>{label} ({unit}) <input className="w-full rounded-lg border p-2" id={label==="Width"?"mimi-wall-width":"mimi-wall-height"} required type="number" min={0.01/toCm(1,unit)} max={100000/toCm(1,unit)} step="any" value={val} onChange={e=>set(e.target.value)}/></label>)}</fieldset>}
 {custom&&art&&<div><div className="flex flex-wrap gap-3">{(["size","room"] as const).map(m=><button type="button" className="btn rounded-lg border px-4 py-2" key={m} onClick={()=>{select(m);if(ready)show(m);else document.getElementById("mimi-wall-width")?.focus()}}>{m==="size"?"Visualize my wall":"See it in my room"}</button>)}</div>{selection&&!ready&&<p role="status">Enter your wall width and height above, then choose a preview.</p>}</div>}
 <p className="text-lg font-semibold">{amount!==null?fmt(amount):fmt(offer.rate!)+" per sq ft"}{india?(amount===null?" including GST":" including GST"):""} · delivery included</p>
 {offer.rate&&!fixedSelection&&<p className="text-sm">{amount===null?"Enter your wall size to see your price. ":""}Custom wallpaper is billed at 20 sq ft at least.</p>}
 <label>Quantity <input type="number" required min="1" max="99" value={qty||""} onChange={e=>Q(Number(e.target.value))}/></label>
 <button className="btn btn-primary">Add to cart</button><span role="status">{status}</span><a href="/cart/">View cart</a></form>
 {art&&ready&&mode==="size"&&<section><DesignVisualizer imageUrl={art} imageAlt={name} wallWidthCm={wallWidth} wallHeightCm={wallHeight} {...crop} heading="Visualize my wall" onChange={setCrop} onImageMeta={ignoreMeta}/><button type="button" onClick={()=>show(null)}>Close wall preview</button></section>}
 {art&&ready&&mode==="room"&&<RoomVisualizer open imageUrl={art} imageAlt={name} wallWidthCm={wallWidth} wallHeightCm={wallHeight} wallLabel="Your wall" initial={payload??null} onClose={()=>show(null)} onApply={c=>{setCrop({offsetX:c.offsetX,offsetY:c.offsetY,zoom:c.zoom,flipH:!!c.flipH,flipV:!!c.flipV});show("size")}}/>}</>;
}
type Priced={lineMinor:number;currency:"INR"|"USD"};
type Quote=Priced|{refused:string};
async function quoteLine(line:Line,countryCode:string):Promise<Quote>{
 try{
  const r=await fetch("/api/checkout/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lines:[linePayload(line)],countryCode})});
  const d=await r.json();
  return r.ok?{lineMinor:d.totalMinor,currency:d.currency}:{refused:d.error||"This design cannot be bought right now."};
 }catch{return {refused:"We could not check this price. Please refresh the page."}}
}
function LinePrice({quote}:{quote?:Quote}){
 if(!quote)return <p>Checking the price…</p>;
 return "refused" in quote?<p>{quote.refused}</p>:<p>{money(quote.currency,quote.lineMinor/100)}</p>;
}
function money(currency:string,amount:number){return new Intl.NumberFormat("en",{style:"currency",currency}).format(amount)}
export function DesignCart({embedded=false}:{embedded?:boolean}){
 const {market}=useMarket();
 const [lines,set]=useState<Line[]>([]),[error,E]=useState("");
 /* Every line is priced by the server for the shopper's country: a figure saved on this device may be old. */
 const [quotes,setQuotes]=useState<Quote[]|null>(null);
 useEffect(()=>{
  if(!lines.length){setQuotes([]);return;}
  let live=true;
  setQuotes(null);
  Promise.all(lines.map(line=>quoteLine(line,market.countryCode))).then(q=>{if(live)setQuotes(q)});
  return()=>{live=false};
 },[lines,market.countryCode]);
 const refusals=(quotes??[]).filter(q=>"refused" in q).length;
 const priced=(quotes??[]).filter((q):q is Priced=>"lineMinor" in q);
 useEffect(()=>{const refresh=()=>{try{set(readLines());E("")}catch{E("Your saved selection could not be read.")}};refresh();window.addEventListener("storage",refresh);window.addEventListener("pageshow",refresh);window.addEventListener("mimipip-cart",refresh);return()=>{window.removeEventListener("storage",refresh);window.removeEventListener("pageshow",refresh);window.removeEventListener("mimipip-cart",refresh)}},[]);
 function change(next:Line[]){try{saveLines(next);set(next)}catch{E("Your change could not be saved.")}}
 const Container=embedded?"section":"main";
 return <Container className="container-x space-y-5 py-10">{embedded?<h2 className="text-2xl">Additional items</h2>:<h1>Your cart</h1>}{!lines.length&&<p>Your cart is empty.</p>}{lines.map((l,i)=><article className="space-y-2 border-b py-4" key={JSON.stringify([l.slug,l.size,l.currency,l.crop])}><h2>{l.name}</h2>{l.sku && <p>SKU {l.sku}</p>}{l.artworkUrl === "/floor-play-images/"+l.slug+"/art.png" && <img src={l.artworkUrl} alt={l.name+" flat artwork"} width={96} height={96} className="object-contain"/>}{l.slug.startsWith("hopscotch-")&&<label>Colourway <select value={l.slug} onChange={e=>{const game=games.find(g=>g.slug===e.target.value);if(game)try{change(addLine(lines.filter((_,j)=>j!==i),{...l,slug:game.slug,name:game.title,amount:fixedPrice(game.slug,l.currency==="INR"?"IN":"ABROAD")??l.amount}))}catch{E("Check your quantity before combining colourways.")}}}>{games.filter(g=>g.slug.startsWith("hopscotch-")).map(g=><option key={g.slug} value={g.slug}>{g.colourway}</option>)}</select></label>}<p>{l.size}</p>{l.stickersOnly&&<p>Stickers only. Furniture in room images is for illustration.</p>}
 {l.dimensions&&!l.fixedSize&&<form onSubmit={e=>{e.preventDefault();const fields=new FormData(e.currentTarget);const d={width:Number(fields.get("width")),height:Number(fields.get("height"))};try{change(addLine(lines.filter((_,j)=>j!==i),{...l,dimensions:d,crop:l.crop?{...l.crop,wallWidthCm:d.width,wallHeightCm:d.height}:undefined,size:d.width+" × "+d.height+" cm",amount:l.rate?wallpaperPrice(d,l.rate):l.amount}))}catch{E("Check the dimensions and quantity.")}}}>
 {(["width","height"] as const).map(field=><label key={field}>{field} (cm) <input name={field} type="number" step=".01" min="10" max="3000" required defaultValue={l.dimensions![field]}/></label>)}<button>Update size</button></form>}<LinePrice quote={quotes?.[i]}/><label>Quantity <select value={l.qty} onChange={e=>change(lines.map((x,j)=>j===i?{...x,qty:Number(e.target.value)}:x))}>{Array.from({length:99},(_,n)=><option key={n}>{n+1}</option>)}</select></label> <button onClick={()=>change(lines.filter((_,j)=>i!==j))}>Remove {l.name}</button></article>)}{!embedded&&priced.length>0&&<section aria-label="Cart subtotal"><h2>Your total</h2><p>{money(priced[0].currency,priced.reduce((sum,q)=>sum+q.lineMinor,0)/100)} · delivery included</p></section>}<p role="status">{error}</p>{refusals>0&&<p>Remove the {refusals===1?"design":"designs"} marked above to check out.</p>}{!embedded&&quotes!==null&&lines.length>0&&!refusals&&<a className="btn btn-primary inline-block" href="/checkout/">Checkout</a>} <a href="/browse/collection">Continue shopping</a></Container>
}
