import {linesInr,type StoredLine,type StoredCustomer} from './order-payload';
import type {Env} from './checkout';
export const DESIGN_STATES=['new','designing','proof_sent','complete'] as const;
type Row={id:string;lines:string;customer:string;amount_inr:number;fulfilment:string;created_at:number};
/** Paid design services live in the existing durable order record. The existing
 * OS design desk reads this queue; no print job is created for design labour. */
export function designBriefRows(row:Row){
 const lines=JSON.parse(row.lines) as StoredLine[],customer=JSON.parse(row.customer) as StoredCustomer;
 const amounts=linesInr(lines,row.amount_inr),progress=JSON.parse(row.fulfilment||'{}').designServices??{};
 return lines.flatMap((line,index)=>line.kind==='design-service'?[{
  orderRef:row.id,lineRef:String(index+1),name:customer.name,email:customer.email,phone:customer.phone,
  brief:line.brief?.note??'',forTitle:line.brief?.forTitle??'',forHandle:line.brief?.forHandle??'',
  quantity:line.qty,amountInr:amounts[index],status:progress[String(index+1)]?.status??'new',
  createdAt:row.created_at,updatedAt:progress[String(index+1)]?.updatedAt??row.created_at,
 }]:[]);
}
export async function handleDesignBriefs(request:Request,env:Env){
 const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(!env.DB||!env.STORE_PAY||!await env.STORE_PAY.osTokenMatches(request.headers.get('x-zyvorah-token')??''))return json({error:'Not authorised'},401);
 if(request.method==='GET'){
  const rows=await env.DB.prepare("SELECT id,lines,customer,amount_inr,fulfilment,created_at FROM mimipip_orders WHERE status='paid' AND EXISTS (SELECT 1 FROM json_each(lines) WHERE json_extract(value,'$.kind')='design-service') ORDER BY created_at DESC LIMIT 200").all<Row>();
  return json({briefs:rows.results.flatMap(designBriefRows)});
 }
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const b=await request.json().catch(()=>null) as {orderRef?:string;lineRef?:string;status?:string}|null;
 if(!b||!/^MP-[A-F0-9]{16}$/.test(b.orderRef??'')||!/^\d{1,2}$/.test(b.lineRef??'')||!(DESIGN_STATES as readonly unknown[]).includes(b.status))return json({error:'Check the design service and status.'},400);
 const row=await env.DB.prepare("SELECT id,lines,customer,amount_inr,fulfilment,created_at FROM mimipip_orders WHERE id=? AND status='paid'").bind(b.orderRef).first<Row>();
 if(!row||!designBriefRows(row).some(r=>r.lineRef===b.lineRef))return json({error:'Paid design service not found'},404);
 const fulfilment=JSON.parse(row.fulfilment||'{}');
 fulfilment.designServices={...fulfilment.designServices,[b.lineRef!]:{status:b.status,updatedAt:Date.now()}};
 const r=await env.DB.prepare('UPDATE mimipip_orders SET fulfilment=?,updated_at=? WHERE id=? AND fulfilment=?').bind(JSON.stringify(fulfilment),Date.now(),row.id,row.fulfilment).run();
 return r.meta.changes?json({ok:true}):json({error:'The brief changed. Reload before updating it.'},409);
}
