import type { Env } from './checkout';
import type { StoredLine } from './order-payload';
import records from '../review/catalogue.json';
export type AccountOrder = {
 id:string; status:'paid'; created_at:string; amountMinor:number; currency:'INR'|'USD';
 title:string; image:string|null; item_count:number;
 lines:Pick<StoredLine,'name'|'qty'|'lineMinor'|'widthCm'|'heightCm'>[];
};
type Row={id:string;status:'paid';created_at:number;amount:number;currency:'INR'|'USD';lines:string};
/** The email must come from the server-verified session, never a request field.
 * Payment credentials, addresses and internal operational errors are not selected. */
export async function readAccountOrders(db:NonNullable<Env['DB']>,verifiedEmail:string,id?:string):Promise<AccountOrder[]> {
 const email=verifiedEmail.trim().toLowerCase();
 if(!email||!email.includes('@'))throw new Error('Verified email required');
 const rows=await db.prepare("SELECT id,status,created_at,amount,currency,lines FROM mimipip_orders WHERE status='paid' AND lower(trim(json_extract(customer,'$.email')))=?"+(id?' AND id=?':'')+' ORDER BY created_at DESC LIMIT 100').bind(...(id?[email,id]:[email])).all<Row>();
 return rows.results.map(row=>{
  const lines=JSON.parse(row.lines) as StoredLine[];
  return {id:row.id,status:row.status,created_at:new Date(row.created_at).toISOString(),amountMinor:row.amount,currency:row.currency,title:lines[0]?.name??'MimiPip order',image:records.find(r=>r.slug===lines[0]?.slug)?.image??null,item_count:lines.length,
   lines:lines.map(({name,qty,lineMinor,widthCm,heightCm})=>({name,qty,lineMinor,widthCm,heightCm}))};
 });
}
export const orderMoney=(order:Pick<AccountOrder,'currency'|'amountMinor'>)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:order.currency}).format(order.amountMinor/100);
