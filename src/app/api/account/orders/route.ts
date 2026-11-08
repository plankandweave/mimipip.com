import {supabaseServerAuth} from '@/lib/auth-server';
import {readAccountOrders} from '@/brand/commerce/account-orders';
import type {Env} from '@/brand/commerce/checkout';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request){
 try {
  const auth=await supabaseServerAuth();
  const {data,error}=await auth.auth.getUser();
  const user=data.user;
  if(error||!user?.email||!user.email_confirmed_at)return json({error:'Please sign in to view your orders.'},401);
  const {env}=await import(/* @vite-ignore */ 'cloudflare:workers') as {env:Env};
  if(!env.DB)return json({error:'Your orders are temporarily unavailable.'},503);
  const id=new URL(request.url).searchParams.get('id')??undefined;
  if(id&&!/^MP-[A-F0-9]{16}$/.test(id))return json({error:'Order not found.'},404);
  const orders=await readAccountOrders(env.DB,user.email,id);
  if(id&&!orders.length)return json({error:'Order not found.'},404);
  return json({orders});
 }catch{return json({error:'Your orders could not be loaded. Please try again.'},503);}
}
