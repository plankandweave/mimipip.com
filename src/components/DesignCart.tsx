"use client";
import {useEffect,useState} from "react";
import {toCm, type Unit} from "@/lib/pricing";
import {useMarket} from "./MarketProvider";
import {DesignVisualizer} from "./DesignVisualizer";
import {RoomVisualizer} from "./RoomVisualizer";
const ignoreMeta=()=>{};
import games from "../../floor-games/products.json";
import {readLines,saveLines,addLine,wallpaperPrice,type Line} from "./design-cart-store";
import type {Sale} from "@/brand/commerce/sale";
export function ChooseDesign({slug,name,width,height,custom,wallpaper,art,sale,floorArtwork,sku}:{slug:string;name:string;width:number|null;height:number|null;custom:boolean;wallpaper:boolean;art?:string|null;sale:Sale;floorArtwork?:string;sku?:string}){
 const {market}=useMarket();
 const [w,W]=useState(""),[h,H]=useState(""),[qty,Q]=useState(1),[status,S]=useState("");
 const hopscotch = slug.startsWith("hopscotch-");
 const [mode,show]=useState<"size"|"room"|null>(null),[crop,setCrop]=useState({offsetX:.5,offsetY:.5,zoom:1,flipH:false,flipV:false});
 const [unit,setUnit]=useState<Unit | "mm">("cm");
 function changeUnit(next: Unit | "mm") {
   const convert = (value:string) => value ? String(Number((toCm(Number(value),unit)/toCm(1,next)).toPrecision(12))) : "";
   W(convert(w)); H(convert(h)); setUnit(next);
 }
 const wallWidth=toCm(Number(w),unit),wallHeight=toCm(Number(h),unit),ready=wallWidth>0&&wallHeight>0&&wallWidth>=10&&wallHeight>=10&&wallWidth<=3000&&wallHeight<=3000;
 const [selection,select]=useState<"size"|"room"|null>(null);
 const payload=art&&ready?{...crop,imageUrl:art,wallWidthCm:wallWidth,wallHeightCm:wallHeight}:undefined;
 const game=games.find(g=>g.slug===slug);
 const colors=games.filter(g=>g.slug.startsWith("hopscotch-"));
 const size=custom?wallWidth+" × "+wallHeight+" cm":width&&height?width+" × "+height+" cm":game?game.width_mm/10+" × "+game.height_mm/10+" cm":"";
 const india=market.countryCode==="IN";
 const offer=india?sale.india:sale.abroad;
 const currency=india?"INR":"USD";
 const amount=!offer?null:offer.fixed??(offer.rate&&ready?wallpaperPrice({width:wallWidth,height:wallHeight},offer.rate):null);
 const fmt=(n:number)=>new Intl.NumberFormat("en",{style:"currency",currency,maximumFractionDigits:n%1?2:0}).format(n);
 if(!offer)return <p className="my-5">This design is not sold in {market.countryName}. <a className="underline" href="/contact">Ask us about it</a>.</p>;
 return <><form className="my-5 grid gap-3" onSubmit={e=>{e.preventDefault();try{if(amount===null){S("Enter your wall size first.");return;}saveLines(addLine(readLines(),{slug,name,size,qty,amount,sku,artworkUrl:floorArtwork,currency,stickersOnly:!wallpaper,wallpaper,rate:offer.rate,crop:payload,dimensions:custom?{width:wallWidth,height:wallHeight}:undefined}));S("Added to your cart.");}catch{S("Could not save this selection on this device.");}}}>
 {hopscotch&&<label>Colourway <select value={slug} onChange={e=>window.location.assign("/products/"+e.target.value)}>{colors.map(g=><option key={g.slug} value={g.slug}>{g.colourway}</option>)}</select></label>}
 {custom&&<fieldset className="grid grid-cols-2 gap-3"><legend>Your wall measurements</legend><label className="col-span-2">Measurement unit <select value={unit} onChange={e=>changeUnit(e.target.value as Unit | "mm")}>
   <option value="cm">Centimetres</option><option value="mm">Millimetres</option><option value="in">Inches</option><option value="ft">Feet</option>
 </select></label>{([[w,W,"Width"],[h,H,"Height"]] as const).map(([val,set,label])=><label className="grid gap-1" key={label}>{label} ({unit}) <input className="w-full rounded-lg border p-2" id={label==="Width"?"mimi-wall-width":"mimi-wall-height"} required type="number" min={0.01/toCm(1,unit)} max={100000/toCm(1,unit)} step="any" value={val} onChange={e=>set(e.target.value)}/></label>)}</fieldset>}
 {custom&&art&&<div><div className="flex flex-wrap gap-3">{(["size","room"] as const).map(m=><button type="button" className="btn rounded-lg border px-4 py-2" key={m} onClick={()=>{select(m);if(ready)show(m);else document.getElementById("mimi-wall-width")?.focus()}}>{m==="size"?"Visualize my wall":"See it in my room"}</button>)}</div>{selection&&!ready&&<p role="status">Enter your wall width and height above, then choose a preview.</p>}</div>}
 <p className="text-lg font-semibold">{amount!==null?fmt(amount):fmt(offer.rate!)+" per sq ft"}{india?" including GST":""} · delivery included</p>
 {offer.rate&&<p className="text-sm">{amount===null?"Enter your wall size to see your price. ":""}Wallpaper is billed at 20 sq ft at least.</p>}
 <label>Quantity <input type="number" required min="1" max="99" value={qty||""} onChange={e=>Q(Number(e.target.value))}/></label>
 <button className="btn btn-primary">Add to cart</button><span role="status">{status}</span><a href="/cart/">View cart</a></form>
 {art&&ready&&mode==="size"&&<section><DesignVisualizer imageUrl={art} imageAlt={name} wallWidthCm={wallWidth} wallHeightCm={wallHeight} {...crop} heading="Visualize my wall" onChange={setCrop} onImageMeta={ignoreMeta}/><button type="button" onClick={()=>show(null)}>Close wall preview</button></section>}
 {art&&ready&&mode==="room"&&<RoomVisualizer open imageUrl={art} imageAlt={name} wallWidthCm={wallWidth} wallHeightCm={wallHeight} wallLabel="Your wall" initial={payload??null} onClose={()=>show(null)} onApply={c=>{setCrop({offsetX:c.offsetX,offsetY:c.offsetY,zoom:c.zoom,flipH:!!c.flipH,flipV:!!c.flipV});show("size")}}/>}</>;
}
function money(currency:string,amount:number){return new Intl.NumberFormat("en",{style:"currency",currency}).format(amount)}
export function DesignCart(){
 const [lines,set]=useState<Line[]>([]),[error,E]=useState("");
 useEffect(()=>{const refresh=()=>{try{set(readLines());E("")}catch{E("Your saved selection could not be read.")}};refresh();window.addEventListener("storage",refresh);window.addEventListener("pageshow",refresh);window.addEventListener("mimipip-cart",refresh);return()=>{window.removeEventListener("storage",refresh);window.removeEventListener("pageshow",refresh);window.removeEventListener("mimipip-cart",refresh)}},[]);
 function change(next:Line[]){try{saveLines(next);set(next)}catch{E("Your change could not be saved.")}}
 return <main className="container-x space-y-5 py-10"><h1>Your cart</h1>{!lines.length&&<p>Your cart is empty.</p>}{lines.map((l,i)=><article className="space-y-2 border-b py-4" key={JSON.stringify([l.slug,l.size,l.currency,l.crop])}><h2>{l.name}</h2>{l.sku && <p>SKU {l.sku}</p>}{l.artworkUrl === "/floor-play-images/"+l.slug+"/art.png" && <img src={l.artworkUrl} alt={l.name+" flat artwork"} width={96} height={96} className="object-contain"/>}{l.slug.startsWith("hopscotch-")&&<label>Colourway <select value={l.slug} onChange={e=>{const game=games.find(g=>g.slug===e.target.value);if(game)try{change(addLine(lines.filter((_,j)=>j!==i),{...l,slug:game.slug,name:game.title,amount:game.price_inr}))}catch{E("Check your quantity before combining colourways.")}}}>{games.filter(g=>g.slug.startsWith("hopscotch-")).map(g=><option key={g.slug} value={g.slug}>{g.colourway}</option>)}</select></label>}<p>{l.size}</p>{l.stickersOnly&&<p>Stickers only. Furniture in room images is for illustration.</p>}
 {l.dimensions&&<form onSubmit={e=>{e.preventDefault();const fields=new FormData(e.currentTarget);const d={width:Number(fields.get("width")),height:Number(fields.get("height"))};try{change(addLine(lines.filter((_,j)=>j!==i),{...l,dimensions:d,crop:l.crop?{...l.crop,wallWidthCm:d.width,wallHeightCm:d.height}:undefined,size:d.width+" × "+d.height+" cm",amount:l.rate?wallpaperPrice(d,l.rate):l.amount}))}catch{E("Check the dimensions and quantity.")}}}>
 {(["width","height"] as const).map(field=><label key={field}>{field} (cm) <input name={field} type="number" step=".01" min="10" max="3000" required defaultValue={l.dimensions![field]}/></label>)}<button>Update size</button></form>}{l.amount!==null&&<p>Unit price {money(l.currency,l.amount)} · Line total {money(l.currency,l.amount*l.qty)}</p>}<label>Quantity <select value={l.qty} onChange={e=>change(lines.map((x,j)=>j===i?{...x,qty:Number(e.target.value)}:x))}>{Array.from({length:99},(_,n)=><option key={n}>{n+1}</option>)}</select></label> <button onClick={()=>change(lines.filter((_,j)=>i!==j))}>Remove {l.name}</button></article>)}{lines.length>0&&<section aria-label="Cart subtotal"><h2>Your total</h2>{(["INR","USD"] as const).map(currency=>{
 const priced=lines.filter(line=>line.currency===currency&&line.amount!==null);
 return priced.length?<p key={currency}>Subtotal {money(currency,priced.reduce((sum,line)=>sum+Math.round(line.amount!*100)*line.qty,0)/100)}</p>:null;
 })}</section>}<p role="status">{error}</p>{lines.length>0&&<a className="btn btn-primary inline-block" href="/checkout/">Checkout</a>} <a href="/browse/collection">Continue shopping</a></main>
}
