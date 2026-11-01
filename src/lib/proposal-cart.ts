import { guardCapture } from "@/lib/portfolio-capture";
import { priceProjectLines } from "@/lib/corporate-project";
import { initialProposalConfiguration } from "@/lib/proposal-configuration";
import { proposalCheckoutPrice } from "@/lib/proposal-checkout";
export async function loadProposalCart(areaId: string, studyId: string) {
 const g=await guardCapture(areaId);
 if(!g.ok) return {error:g.error,status:g.status} as const;
 const {sb,session}=g.ctx;
 const {data:s}=await sb.from("corporate_wall_studies").select("*").eq("id",studyId).eq("account_id",session.account.id).maybeSingle();
 if(!s) return {error:"Proposal not found",status:404} as const;
 const {data:w}=await sb.from("corporate_site_batch_walls").select("batch_id,name,width_mm,height_mm").eq("id",s.wall_id).maybeSingle();
 const {data:b}=w ? await sb.from("corporate_site_batches").select("id").eq("id",w.batch_id).eq("area_id",areaId).eq("account_id",session.account.id).maybeSingle():{data:null};
 if(!b||!w) return {error:"Proposal not found in this space",status:404} as const;
 const {data:order}=await sb.from("corporate_orders").select("id,order_ref,total,service_breakdown,frozen_at,payment_status").eq("source_study_id",s.id).eq("account_id",session.account.id).maybeSingle();
 if(order) return {ctx:g.ctx,s,order} as const;
 if(session.account.print_gate!=="payment_first") return {error:"Proposal checkout requires a payment-first account.",status:409} as const;
 if(!s.product_handle||!s.material_slug) return {error:"Zyvorah is preparing this proposal’s product and finish pricing.",status:409} as const;
 const {data:d}=await sb.from("corporate_designs").select("design_url,status").eq("id",s.design_id).eq("account_id",session.account.id).maybeSingle();
 if(!d||d.status==="archived") return {error:"The artwork is unavailable",status:409} as const;
 const c=s.configuration??initialProposalConfiguration(w.width_mm,w.height_mm);
 const priced=await priceProjectLines(session.account,[{...c,designUrl:d.design_url,printName:w.name,productHandle:s.product_handle,materialSlug:s.material_slug}]);
 if(!priced.ok) return {error:priced.error,status:priced.status} as const;
 const line=priced.lines[0]!;
 const breakdown=proposalCheckoutPrice(line.price.total,Number(session.account.gst_pct),s.customisation_required);
 // Keep the wallpaper rate/discount distinct; amount + GST includes the fee.
 line.price={...line.price,amount:breakdown.amount,gstAmount:breakdown.gstAmount,total:breakdown.total};
 line.proposal={studyId:s.id,revision:s.revision,breakdown};
 return {ctx:g.ctx,s,order:null,line,breakdown} as const;
}
