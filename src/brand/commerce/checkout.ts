/** MimiPip-only payment boundary. No legacy customer or order services are enabled. */
export const peachPop={slug:'hopscotch-peach-pop',name:'Peach Pop',pricePaise:399900,widthCm:75,heightCm:260};
export function tubeDimensions(widthCm:number,heightCm:number){
 if(!Number.isFinite(widthCm)||!Number.isFinite(heightCm)||Math.min(widthCm,heightCm)<=0)throw new Error('Invalid product dimensions');
 return {lengthCm:Math.min(widthCm,heightCm)+2,widthCm:8.3,heightCm:8.3};
}
export type Fulfilment={stock:number;qcReleased:boolean;weightKg:number;pickupPin:string;warehouse:string;batch:string;quote:{destinationPin:string;shippingPaise:number;reference:string;expiresAt:number;carrier:'Delhivery'}};
export function fulfilment(raw:string|undefined):Fulfilment|null{
 try{const f=JSON.parse(raw||'null');
 if(!f||!Number.isSafeInteger(f.stock)||f.stock<=0||f.qcReleased!==true||!Number.isFinite(f.weightKg)||f.weightKg<=0||!/^\d{6}$/.test(f.pickupPin)||!f.warehouse||!f.batch||f.quote?.carrier!=='Delhivery'||!/^\d{6}$/.test(f.quote.destinationPin)||!Number.isSafeInteger(f.quote.shippingPaise)||f.quote.shippingPaise<0||!f.quote.reference||!Number.isFinite(f.quote.expiresAt)||f.quote.expiresAt<=Date.now())return null;
 return f;
 }catch{return null;}
}
type Statement={bind(...values:unknown[]):Statement;first<T=any>():Promise<T|null>;run():Promise<{meta:{changes:number}}>};
type Env={DB?:{prepare(sql:string):Statement};RAZORPAY_KEY_ID?:string;RAZORPAY_KEY_SECRET?:string;RAZORPAY_WEBHOOK_SECRET?:string;PEACH_POP_FULFILMENT_JSON?:string};
type Order={id:string;token_hash:string;status:string;amount:number;shipping:number;customer:string;fulfilment:string;razorpay_order_id:string|null;payment_id:string|null;created_at:number;updated_at:number};
const encoder=new TextEncoder();
const hex=(v:ArrayBuffer)=>Array.from(new Uint8Array(v),n=>n.toString(16).padStart(2,'0')).join('');
export async function digest(v:string){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(v)));}
export async function validSignature(secret:string,message:string,signature:string){
 if(!/^[a-f0-9]{64}$/.test(signature))return false;
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g)!,s=>parseInt(s,16)),encoder.encode(message));
}
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function validCustomer(c:any){return c&&typeof c.name==='string'&&c.name.trim().length>=2&&c.name.length<=100&&typeof c.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)&&c.email.length<=254&&typeof c.phone==='string'&&/^[6-9]\d{9}$/.test(c.phone)&&typeof c.address==='string'&&c.address.trim().length>=8&&c.address.length<=500&&typeof c.city==='string'&&c.city.length>=2&&c.city.length<=100&&typeof c.state==='string'&&c.state.length>=2&&c.state.length<=100&&typeof c.pin==='string'&&/^[1-9]\d{5}$/.test(c.pin);}
export function paymentMatches(p:any,o:Order){return p?.status==='captured'&&p.captured===true&&p.order_id===o.razorpay_order_id&&p.amount===o.amount&&p.currency==='INR'&&p.amount_refunded===0&&/^pay_[A-Za-z0-9]+$/.test(p.id);}
export async function handleCommerce(request:Request,env:Env,transport:typeof fetch):Promise<Response>{
 const path=new URL(request.url).pathname.replace(/\/$/,'');
 const f=fulfilment(env.PEACH_POP_FULFILMENT_JSON);
 const configured=!!(env.DB&&env.RAZORPAY_KEY_ID&&env.RAZORPAY_KEY_SECRET&&env.RAZORPAY_WEBHOOK_SECRET);
 if(path==='/api/india-checkout/readiness'&&request.method==='GET')return json({product:peachPop,packing:tubeDimensions(75,260),available:configured&&!!f,quote:f?{pin:f.quote.destinationPin,shippingPaise:f.quote.shippingPaise,expiresAt:f.quote.expiresAt}:null,message:f?'':'Delivery and availability are being confirmed. Payment is not open yet.'});
 if(!env.DB||!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)return json({error:'Checkout is temporarily unavailable.'},503);
 const db=env.DB;
 async function provider(path:string,body?:unknown){
  const res=await transport('https://api.razorpay.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+btoa(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!res.ok)throw new Error('Payment provider unavailable');return res.json() as Promise<any>;
 }
 async function confirm(o:Order,p:any){
  if(!paymentMatches(p,o))return false;
  const ro=await provider('orders/'+o.razorpay_order_id);
  if(ro.status!=='paid'||ro.amount!==o.amount||ro.currency!=='INR'||ro.amount_paid!==o.amount)return false;
  await db.prepare("UPDATE mimipip_orders SET status='paid', payment_id=?, updated_at=? WHERE id=? AND status IN ('pending','paid')").bind(p.id,Date.now(),o.id).run();return true;
 }
 try{
  if(path==='/api/india-checkout/webhook'&&request.method==='POST'){
   if(!env.RAZORPAY_WEBHOOK_SECRET)return json({error:'Webhook not configured'},503);
   const raw=await request.text();if(raw.length>65536)return json({error:'Payload too large'},413);
   if(!await validSignature(env.RAZORPAY_WEBHOOK_SECRET,raw,request.headers.get('x-razorpay-signature')||''))return json({error:'Invalid signature'},401);
   const event=JSON.parse(raw);const p=event.payload?.payment?.entity;
   if(p?.order_id){const o=await db.prepare('SELECT * FROM mimipip_orders WHERE razorpay_order_id=?').bind(p.order_id).first<Order>();if(o&&event.event==='payment.captured')await confirm(o,p);}
   return json({received:true});
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Invalid request origin'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  const raw=await request.text();if(raw.length>8192)return json({error:'Payload too large'},413);const b=JSON.parse(raw);
  if(typeof b.token!=='string'||!/^\w{64}$/.test(b.token))return json({error:'Invalid checkout session'},400);
  const tokenHash=await digest(b.token);
  let o=await db.prepare('SELECT * FROM mimipip_orders WHERE token_hash=?').bind(tokenHash).first<Order>();
  if(path==='/api/india-checkout/create'){
   if(!o){
    if(!f||!env.RAZORPAY_WEBHOOK_SECRET)return json({error:'Delivery and stock must be confirmed before payment.'},409);
    if(b.slug!==peachPop.slug||b.quantity!==1||!validCustomer(b.customer)||b.customer.pin!==f.quote.destinationPin)return json({error:'Check the delivery address and product selection.'},400);
    const customer={name:b.customer.name.trim(),email:b.customer.email.trim(),phone:b.customer.phone,address:b.customer.address.trim(),city:b.customer.city.trim(),state:b.customer.state.trim(),pin:b.customer.pin};
    const id='MP-'+crypto.randomUUID();const now=Date.now();
    // A single conditional insert prevents simultaneous shoppers overselling the confirmed batch.
    // Reservations are conservative: ambiguous provider failures are never automatically released.
    const r=await db.prepare("INSERT INTO mimipip_orders (id,token_hash,status,amount,shipping,customer,fulfilment,created_at,updated_at) SELECT ?,?,'creating',?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM mimipip_orders WHERE json_extract(fulfilment,'$.batch')=? AND status!='cancelled') < ?")
     .bind(id,tokenHash,peachPop.pricePaise+f.quote.shippingPaise,f.quote.shippingPaise,JSON.stringify(customer),JSON.stringify({...f,packing:tubeDimensions(75,260)}),now,now,f.batch,f.stock).run();
    if(!r.meta.changes)return json({error:'This batch is currently reserved. Please try later.'},409);
    o=(await db.prepare('SELECT * FROM mimipip_orders WHERE id=?').bind(id).first<Order>())!;
    const ro=await provider('orders',{amount:o.amount,currency:'INR',receipt:id.replaceAll('-','').slice(0,40),notes:{brand:'MimiPip',mimipip_order_id:id,sku:peachPop.slug}});
    if(!/^order_[A-Za-z0-9]+$/.test(ro.id)||ro.amount!==o.amount||ro.currency!=='INR')throw new Error('Invalid provider order');
    await db.prepare("UPDATE mimipip_orders SET razorpay_order_id=?,status='pending',updated_at=? WHERE id=?").bind(ro.id,Date.now(),id).run();o.razorpay_order_id=ro.id;o.status='pending';
   }
   if(o.status==='creating')return json({error:'Your payment session is being checked. Please do not create another order.'},409);
   if(o.status==='paid')return json({paid:true,orderNumber:o.id});
   if(o.status!=='pending')return json({error:'This order cannot be paid.'},409);
   return json({keyId:env.RAZORPAY_KEY_ID,orderId:o.razorpay_order_id,amount:o.amount,currency:'INR',orderNumber:o.id,customer:JSON.parse(o.customer)});
  }
  if(!o)return json({error:'Order not found'},404);
  if(path==='/api/india-checkout/verify'){
   if(b.razorpay_order_id!==o.razorpay_order_id||!/^pay_[A-Za-z0-9]+$/.test(b.razorpay_payment_id||'')||!await validSignature(env.RAZORPAY_KEY_SECRET,o.razorpay_order_id+'|'+b.razorpay_payment_id,b.razorpay_signature||''))return json({error:'Payment verification failed.'},400);
   await confirm(o,await provider('payments/'+b.razorpay_payment_id));
  }else if(path==='/api/india-checkout/status'){
   if(o.razorpay_order_id){const ps=await provider('orders/'+o.razorpay_order_id+'/payments');for(const p of ps.items||[])if(paymentMatches(p,o)){await confirm(o,p);break;}}
  }else return json({error:'Not found'},404);
  o=(await db.prepare('SELECT * FROM mimipip_orders WHERE id=?').bind(o.id).first<Order>())!;
  return json({paid:o.status==='paid',orderNumber:o.id,amount:o.amount,shipping:o.shipping,currency:'INR',product:peachPop.name,customer:JSON.parse(o.customer),message:o.status==='paid'?'Payment received. Your order is confirmed.':'Payment has not yet been confirmed. If debited, check again before paying.'});
 }catch{return json({error:'We could not complete this step. Please retry checking the same order; do not pay again if already debited.'},503);}
}
