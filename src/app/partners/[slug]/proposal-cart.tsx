"use client";
import {useEffect,useState} from "react";
const inr=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n);
type Cart={revision:number;approved:boolean;canOrder:boolean;areaSqft:number;discountPct:number;ordersUrl:string;order:{id:string}|null;breakdown:{wallpaper:number;customisation:number;total:number}};
export default function ProposalCart({areaId,studyId,revision,dirty}:{areaId:string;studyId:string;revision:number;dirty:boolean}){
 const [cart,setCart]=useState<Cart|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[shipping,setShipping]=useState(false);
 useEffect(()=>{let alive=true;fetch(`/api/corporate/studies/cart?areaId=${encodeURIComponent(areaId)}&studyId=${encodeURIComponent(studyId)}`,{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);if(alive){setCart(j);setError("");}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[areaId,studyId,revision]);
 async function checkout(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(!cart)return;setBusy(true);setError("");const values=Object.fromEntries(new FormData(e.currentTarget));
  try{const r=await fetch("/api/corporate/studies/cart",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...values,areaId,studyId,revision,expectedTotal:cart.breakdown.total})});const j=await r.json();if(!r.ok)throw new Error(j.error);window.location.assign(j.ordersUrl);}
  catch(e){setError(e instanceof Error?e.message:"Could not save checkout.");setBusy(false);}
 }
 return <section className="mt-4 rounded-xl border border-edge p-4" aria-label="Proposal cart">
  <h3 className="font-display text-lg font-bold">Your cart</h3>
  {error&&<p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
  {cart&&<>
   <p className="mt-1 text-sm text-slate">{cart.areaSqft ? `${cart.areaSqft.toFixed(3)} sq ft · `:""}Wallpaper with {cart.discountPct}% AID discount</p>
   <dl className="mt-3 grid grid-cols-[1fr_auto] gap-2 text-sm"><dt>Wallpaper</dt><dd>{inr(cart.breakdown.wallpaper)}</dd><dt>Customisation (no discount)</dt><dd>{inr(cart.breakdown.customisation)}</dd><dt className="font-bold">Total including GST</dt><dd className="font-bold">{inr(cart.breakdown.total)}</dd></dl>
   <p className="mt-2 text-xs text-slate">Installation and applicable trade freight are excluded. Production follows design approval and confirmed payment.</p>
   {dirty?<p className="mt-3 text-sm">Save your changes to update the cart.</p>:cart.order?<a className="btn mt-3 inline-flex min-h-10 items-center px-4" href={cart.ordersUrl}>Open order & payment</a>:<>
    <button type="button" onClick={()=>setShipping(!shipping)} disabled={!cart.approved||!cart.canOrder} className="btn mt-3 min-h-10 px-4 disabled:opacity-50">Continue to checkout</button>
    {!cart.approved&&<p className="mt-2 text-xs">Approve the saved design to continue.</p>}
    {!cart.canOrder&&<p className="mt-2 text-xs">Your account’s ordering member can complete payment.</p>}
    {shipping&&cart.approved&&<form onSubmit={checkout} className="mt-4 grid gap-3 sm:grid-cols-2">
     {([['name','Receiver name'],['phone','Receiver mobile'],['address','Delivery address'],['city','City'],['state','State'],['pincode','PIN code'],['gstin','GSTIN (optional)']] as const).map(([key,label])=><label key={key} className="text-sm">{label}<input name={key} required={key!=="gstin"} maxLength={key==="address"?400:80} inputMode={key==="phone"||key==="pincode"?"numeric":"text"} className="mt-1 min-h-10 w-full rounded-lg border border-edge px-3"/></label>)}
     <p className="text-xs sm:col-span-2">Save the order, review it, then confirm and pay securely. Saving alone does not release production.</p>
     <button disabled={busy} className="btn min-h-10 px-4 sm:col-span-2">{busy?"Saving…":`Save order · ${inr(cart.breakdown.total)}`}</button>
    </form>}
   </>}
  </>}
 </section>;
}
