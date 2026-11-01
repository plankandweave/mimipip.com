import { NextResponse } from "next/server";
import { loadProposalCart } from "@/lib/proposal-cart";
import { can, recordAudit, shipStateAllowed } from "@/lib/corporate-auth";
import { placeProject } from "@/lib/corporate-project";
import { checkShipTo } from "@/lib/corporate-ship-to";
import { receiverMobile } from "@/lib/receiver-mobile";
import { checkGstin, gstinStateMismatch } from "@/lib/gstin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req:Request){
 const u=new URL(req.url); const q=await loadProposalCart(u.searchParams.get("areaId")??"",u.searchParams.get("studyId")??"");
 if("error" in q)return NextResponse.json({ok:false,error:q.error},{status:q.status});
 return NextResponse.json({ok:true,revision:q.s.revision,approved:q.s.status==="approved",canOrder:can(q.ctx.session,"order"),
  breakdown:q.order?.service_breakdown??q.breakdown,areaSqft:q.line?.price.areaSqft,discountPct:Number(q.ctx.session.account.discount_pct),
  order:q.order,ordersUrl:`/partners/${q.ctx.session.account.slug}/orders`});
}
export async function POST(req:Request){
 const b=await req.json().catch(()=>({})); const q=await loadProposalCart(String(b.areaId??""),String(b.studyId??""));
 if("error" in q)return NextResponse.json({ok:false,error:q.error},{status:q.status});
 const {session,sb}=q.ctx;
 if(!can(session,"order"))return NextResponse.json({ok:false,error:"An account member with ordering permission must complete checkout."},{status:403});
 if(q.order)return NextResponse.json({ok:true,order:q.order,ordersUrl:`/partners/${session.account.slug}/orders`});
 if(q.s.status!=="approved"||q.s.revision!==b.revision)return NextResponse.json({ok:false,error:"Approve the saved design version before checkout."},{status:409});
 if(b.expectedTotal!==q.breakdown.total)return NextResponse.json({ok:false,error:"The price changed. Review the updated cart before continuing."},{status:409});
 const state=String(b.state??"").trim();
 if(!state||!shipStateAllowed(session.account,state))return NextResponse.json({ok:false,error:"Choose a valid delivery state."},{status:400});
 const ship=checkShipTo({address:b.address,city:b.city,pincode:b.pincode});
 if(!ship.ok)return NextResponse.json({ok:false,error:ship.error},{status:400});
 const phone=receiverMobile(session.account.slug,b.phone);
 if(!phone.ok)return NextResponse.json({ok:false,error:phone.error},{status:400});
 const gst=checkGstin(b.gstin); if("error" in gst)return NextResponse.json({ok:false,error:gst.error},{status:400});
 const mismatch=gstinStateMismatch(gst.value,state); if(mismatch)return NextResponse.json({ok:false,error:mismatch},{status:400});
 const result=await placeProject({sb,acc:session.account,lines:[q.line],placedByEmail:session.email,poNumber:null,
  profile:{state,gstin:gst.value,address_line:ship.value.address,city:ship.value.city,pincode:ship.value.pincode,contact_name:String(b.name??"").trim()||null,contact_phone:phone.value}});
 if(!result.ok){
  const {data:existing}=await sb.from("corporate_orders").select("id,order_ref").eq("source_study_id",q.s.id).eq("account_id",session.account.id).maybeSingle();
  if(existing)return NextResponse.json({ok:true,order:existing,ordersUrl:`/partners/${session.account.slug}/orders`});
  return NextResponse.json({ok:false,error:result.error},{status:result.status});
 }
 await recordAudit(session,"proposal.checkout",{type:"area",id:q.ctx.area.id},{studyId:q.s.id,revision:q.s.revision,breakdown:q.breakdown});
 return NextResponse.json({ok:true,order:{id:result.placed[0]!.id},ordersUrl:`/partners/${session.account.slug}/orders`});
}
