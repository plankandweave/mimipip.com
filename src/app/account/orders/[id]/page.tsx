'use client';
import {use, useEffect,useState} from 'react';
import Link from 'next/link';
import {useAuth} from '@/components/AuthProvider';
import {AuthModal} from '@/components/AuthModal';
import {orderMoney,type AccountOrder} from '@/brand/commerce/account-orders';
export default function AccountOrderPage({params}:{params:Promise<{id:string}>}){
 const {id}=use(params),{session,loading}=useAuth();
 const [order,setOrder]=useState<AccountOrder|null>(null),[error,setError]=useState(''),[authOpen,setAuthOpen]=useState(false);
 useEffect(()=>{
  if(loading)return;
  setOrder(null);setError('');
  if(!session)return;
  const controller=new AbortController();
  fetch('/api/account/orders?id='+encodeURIComponent(id),{signal:controller.signal,cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(!controller.signal.aborted)setOrder(d.orders[0]);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return()=>controller.abort();
 },[id,session,loading]);
 return <div className="container-x py-10"><div className="mx-auto max-w-2xl"><Link className="text-sm underline" href="/account/orders">← My orders</Link><h1 className="mt-5 text-2xl font-bold">Order {id}</h1>
 {!loading&&!session&&<button className="btn mt-6" onClick={()=>setAuthOpen(true)}>Log in to view this order</button>}
 {error&&<p role="alert" className="mt-5">{error}</p>}
 {session&&!order&&!error&&<p className="mt-5">Loading your order…</p>}
 {order&&<><p className="mt-3">Paid · {new Date(order.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</p><div className="mt-6 space-y-4">{order.lines.map((line,i)=><article className="rounded-2xl border border-edge p-5" key={i}><h2 className="font-semibold">{line.name}</h2><p className="mt-1 text-sm">Quantity {line.qty}{line.widthCm&&line.heightCm?` · ${line.widthCm} × ${line.heightCm} cm`:''}</p><p className="mt-2">{orderMoney({currency:order.currency,amountMinor:line.lineMinor})}</p></article>)}</div><p className="mt-6 text-xl font-semibold">Total paid {orderMoney(order)}</p><p className="mt-2 text-sm">Delivery included{order.currency==='INR'?' · GST included':''}</p><p className="mt-6 text-sm">For delivery updates, <Link className="underline" href="/contact">contact MimiPip</Link> with your order number.</p></>}
 <AuthModal open={authOpen} onClose={()=>setAuthOpen(false)} onSuccess={()=>setAuthOpen(false)}/></div></div>;
}
