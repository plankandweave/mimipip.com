import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { capturedConceptPayment } from "./concept-payment-proof";
import { releaseSoldExclusiveFromNav } from "./concept-availability";
/** Existing ten-minute checkout sweep recovers exclusive payments when the buyer closed the tab.
 * Read-only gateway calls: this never charges or captures money. No webhook secret is required.
 */
export async function recoverExclusivePayments() {
  const admin=supabaseAdmin(); const key=process.env.RAZORPAY_KEY_ID; const secret=process.env.RAZORPAY_KEY_SECRET;
  if(!admin||!key||!secret)return;
  const {data,error}=await admin.from("design_exclusivity").select("order_id,orders!inner(order_number,razorpay_order_id)").eq("state","reserved").not("orders.razorpay_order_id","is",null).order("payment_checked_at",{nullsFirst:true}).limit(120);
  if(error)throw new Error("Could not check exclusive payment reservations");
  const unique=new Map<string,{order_number:number;razorpay_order_id:string}>();
  for(const row of data??[]){const order=Array.isArray(row.orders)?row.orders[0]:row.orders; if(order)unique.set(row.order_id,order);}
  const headers={Authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`};
  // Bound work so this cannot consume the sweep's entire execution budget.
  await Promise.all([...unique].slice(0,5).map(async([orderId,order])=>{
    try{
      const root=`https://api.razorpay.com/v1/orders/${encodeURIComponent(order.razorpay_order_id)}`;
      const [a,b]=await Promise.all([fetch(root,{headers,signal:AbortSignal.timeout(8000)}),fetch(`${root}/payments`,{headers,signal:AbortSignal.timeout(8000)})]);
      if(!a.ok||!b.ok)throw new Error("Gateway lookup unavailable");
      const gateway=await a.json();const payments=await b.json();
      const paymentId=capturedConceptPayment({gatewayId:order.razorpay_order_id,orderNumber:order.order_number},gateway,Array.isArray(payments.items)?payments.items:[]);
      if(paymentId){const {error:paidError}=await admin.rpc("mark_order_paid_by_rzp",{p_rzp_order_id:order.razorpay_order_id,p_payment_id:paymentId,p_signature:"verified-gateway-recovery"});if(paidError)throw new Error("Exclusive payment reconciliation failed");await releaseSoldExclusiveFromNav(orderId);
        // Paid with the tab closed: the order becomes an order here, as at verify (lib/retail-paid.ts).
        const {settlePaidOrder,produceThenNotify}=await import("./retail-paid");await settlePaidOrder(orderId,{paymentReference:paymentId});await produceThenNotify(orderId,5000);}
    }catch(e){console.error("[exclusive-payment-recovery]",orderId,e instanceof Error?e.message:"failed");}
    finally{await admin.from("design_exclusivity").update({payment_checked_at:new Date().toISOString()}).eq("order_id",orderId);}
  }));
}
