import {checkedBillingIdentity} from './billing-identity';
import { handleCommerce, type Env } from './checkout';
import { sampleDesign } from './samples';
import { SAMPLE_INR } from './sample-policy';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
/** Preserve the original sample widget contract without a second payment system. */
export async function handleSampleOrder(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname.endsWith('/readiness') && request.method==='GET'){
    const ready=await handleCommerce(new Request(new URL('/api/checkout/readiness',url)),env);
    const data=await ready.json() as {open:boolean};
    return json({open:env.MIMIPIP_SAMPLE_CHECKOUT_ENABLED==='1' && data.open});
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(request.headers.get('origin')!==url.origin)return json({error:'Invalid request origin'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  let b:any;
  try{const raw=await request.text();if(raw.length>8192)return json({error:'Payload too large'},413);b=JSON.parse(raw);}catch{return json({error:'Check your sample order.'},400);}
  if(!b || !sampleDesign(b.design?.handle) || !Array.isArray(b.finishes) || b.finishes.length!==1 || b.finishes[0]!=='Smooth Self-Adhesive')
    return json({error:'design_not_sampleable'},400);
  if(b.countryCode!=='IN')return json({error:'Samples can only be delivered within India.'},400);
  let billingIdentity;
  try{billingIdentity=checkedBillingIdentity(b.gstin||b.billingName?{gstin:b.gstin,legalName:b.billingName}:undefined,'IN');}
  catch(error){return json({error:error instanceof Error?error.message:'Check business invoice details.'},400);}
  const customer={name:b.name,email:b.email,phone:typeof b.phone==='string'?b.phone.replace(/^\+91/,''):b.phone,address:b.address?.line1,city:b.address?.city,state:b.address?.state,postcode:b.address?.pincode,countryCode:'IN',...(billingIdentity?{billingIdentity}:{})};
  const result=await handleCommerce(new Request(new URL('/api/checkout/create',url),{method:'POST',headers:request.headers,body:JSON.stringify({token:b.token,customer,lines:[{slug:b.design.handle,kind:'sample',qty:1}]})}),env);
  const data=await result.json() as any;
  if(!result.ok || data.paid)return json(data,result.status);
  return json({orderNumber:data.orderNumber,amount:SAMPLE_INR,razorpay:{keyId:data.keyId,razorpayOrderId:data.orderId,amount:data.amount,currency:data.currency}});
}
