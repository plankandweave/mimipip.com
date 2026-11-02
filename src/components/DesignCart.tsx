"use client";
import {useEffect,useState} from "react";
import {useMarket} from "./MarketProvider";
import games from "../../floor-games/products.json";
import {readLines,saveLines,addLine,wallpaperPrice,type Line} from "./design-cart-store";
export function ChooseDesign({slug,name,width,height,custom,wallpaper}:{slug:string;name:string;width:number|null;height:number|null;custom:boolean;wallpaper:boolean}){
 const {market}=useMarket();
 const [w,W]=useState(""),[h,H]=useState(""),[qty,Q]=useState(1),[status,S]=useState("");
 const [design,setDesign]=useState(slug);
 const game=games.find(g=>g.slug===design);
 const colors=games.filter(g=>g.slug.startsWith("hopscotch-"));
 const size=custom?w+" × "+h+" cm":width&&height?width+" × "+height+" cm":game?game.width_mm/10+" × "+game.height_mm/10+" cm":"Size to confirm";
 const india=market.countryCode==="IN";
 const internationalPrice=wallpaper&&custom&&!india&&Number(w)>0&&Number(h)>0?wallpaperPrice({width:Number(w),height:Number(h)}):null;
 const amount=india&&game?game.price_inr:internationalPrice;
 return <form className="my-5 grid gap-3" onSubmit={e=>{e.preventDefault();try{saveLines(addLine(readLines(),{slug:design,name:design===slug?name:game?.title??name,size,qty,amount,currency:india?"INR":"USD",stickersOnly:!wallpaper,wallpaper,dimensions:custom?{width:Number(w),height:Number(h)}:undefined}));S("Added to your cart.");}catch{S("Could not save this selection on this device.");}}}>
 {slug.startsWith("hopscotch-")&&<label>Colourway <select value={design} onChange={e=>{setDesign(e.target.value);S("")}}>{colors.map(g=><option key={g.slug} value={g.slug}>{g.colourway}</option>)}</select></label>}
 {custom&&<fieldset><legend>Your wall measurements</legend>{([[w,W,"Width"],[h,H,"Height"]] as const).map(([val,set,label])=><label key={label}>{label} (cm) <input required type="number" min=".01" max="100000" step=".01" value={val} onChange={e=>set(e.target.value)}/></label>)}</fieldset>}
 <p>{amount===null?"Price to confirm":new Intl.NumberFormat("en",{style:"currency",currency:india?"INR":"USD"}).format(amount)}{internationalPrice!==null?" · delivery included":""}</p>
 <label>Quantity <input type="number" required min="1" max="99" value={qty||""} onChange={e=>Q(Number(e.target.value))}/></label>
 <button className="btn btn-primary">Add to cart</button><span role="status">{status}</span><a href="/cart/">View cart</a></form>;
}
function money(currency:string,amount:number){return new Intl.NumberFormat("en",{style:"currency",currency}).format(amount)}
export function DesignCart(){
 const [lines,set]=useState<Line[]>([]),[error,E]=useState("");
 useEffect(()=>{const refresh=()=>{try{set(readLines());E("")}catch{E("Your saved selection could not be read.")}};refresh();window.addEventListener("storage",refresh);window.addEventListener("pageshow",refresh);window.addEventListener("mimipip-cart",refresh);return()=>{window.removeEventListener("storage",refresh);window.removeEventListener("pageshow",refresh);window.removeEventListener("mimipip-cart",refresh)}},[]);
 function change(next:Line[]){try{saveLines(next);set(next)}catch{E("Your change could not be saved.")}}
 return <main className="container-x space-y-5 py-10"><h1>Your cart</h1>{!lines.length&&<p>Your cart is empty.</p>}{lines.map((l,i)=><article className="space-y-2 border-b py-4" key={JSON.stringify([l.slug,l.size,l.currency])}><h2>{l.name}</h2>{l.slug.startsWith("hopscotch-")&&<label>Colourway <select value={l.slug} onChange={e=>{const game=games.find(g=>g.slug===e.target.value);if(game)try{change(addLine(lines.filter((_,j)=>j!==i),{...l,slug:game.slug,name:game.title,amount:l.currency==="INR"?game.price_inr:null}))}catch{E("Check your quantity before combining colourways.")}}}>{games.filter(g=>g.slug.startsWith("hopscotch-")).map(g=><option key={g.slug} value={g.slug}>{g.colourway}</option>)}</select></label>}<p>{l.size}</p>{l.stickersOnly&&<p>Stickers only. Furniture in room images is for illustration.</p>}
 {l.dimensions&&<form onSubmit={e=>{e.preventDefault();const fields=new FormData(e.currentTarget);const d={width:Number(fields.get("width")),height:Number(fields.get("height"))};try{change(addLine(lines.filter((_,j)=>j!==i),{...l,dimensions:d,size:d.width+" × "+d.height+" cm",amount:l.wallpaper&&l.currency==="USD"?wallpaperPrice(d):null}))}catch{E("Check the dimensions and quantity.")}}}>
 {(["width","height"] as const).map(field=><label key={field}>{field} (cm) <input name={field} type="number" step=".01" min=".01" max="100000" required defaultValue={l.dimensions![field]}/></label>)}<button>Update size</button></form>}<p>{l.amount===null?"Price to confirm":<>Unit price {money(l.currency,l.amount)} · Line total {money(l.currency,l.amount*l.qty)}</>}</p><label>Quantity <select value={l.qty} onChange={e=>change(lines.map((x,j)=>j===i?{...x,qty:Number(e.target.value)}:x))}>{Array.from({length:99},(_,n)=><option key={n}>{n+1}</option>)}</select></label> <button onClick={()=>change(lines.filter((_,j)=>i!==j))}>Remove {l.name}</button></article>)}{lines.length>0&&<section aria-label="Cart subtotal"><h2>Priced selections</h2>{(["INR","USD"] as const).map(currency=>{
 const priced=lines.filter(line=>line.currency===currency&&line.amount!==null);
 return priced.length?<p key={currency}>{currency} subtotal · {money(currency,priced.reduce((sum,line)=>sum+Math.round(line.amount!*100)*line.qty,0)/100)}</p>:null;
 })}{lines.some(line=>line.amount===null)&&<p>Selections awaiting a price are excluded from these subtotals. Your final total needs confirmation.</p>}</section>}<p role="status">{error}</p><p>Your cart saves selections on this device. Items marked for confirmation need a confirmed price or size before purchase. Saving your cart does not place an order. Payment for the full cart is not open yet.</p><a href="/browse/collection">Continue shopping</a>{lines.some(l=>l.slug==="hopscotch-peach-pop"&&l.currency==="INR"&&l.qty===1)&&<p><a href="/india-checkout/">Check delivery for one Peach Pop</a></p>}</main>
}
