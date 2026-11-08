"use client";

import { useEffect, useState } from "react";
import Image from "@/components/SiteImage";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/AuthModal";

import {orderMoney,type AccountOrder as Order} from '@/brand/commerce/account-orders';

const STATUS_PILL: Record<string, string> = {
  pending: "Awaiting payment", paid: "Paid", in_production: "Printing",
  printed: "Ready to ship", shipped: "In transit", delivered: "Delivered", cancelled: "Cancelled",
};
const PILL_CLASS: Record<string, string> = {
  shipped: "bg-peach/60", delivered: "bg-sage/60", cancelled: "bg-blush/60",
};

export default function MyOrdersPage() {
  const { session, loading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [readError,setReadError]=useState('');
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      setOrders(null);setReadError('');
      setAuthOpen(true);
      return;
    }
    const controller=new AbortController();
    setOrders(null);setReadError('');
    fetch('/api/account/orders',{signal:controller.signal,cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(!controller.signal.aborted)setOrders(d.orders);}).catch(e=>{if(!controller.signal.aborted)setReadError(e.message);});
    return()=>controller.abort();
  }, [session, loading]);

  return (
    <div className="container-x py-10">
      <div className="mx-auto max-w-2xl">
        <span className="caps text-slate">Account</span>
        <h1 className="mt-1 font-display text-2xl font-bold">My orders</h1>
        <p className="mt-1 text-sm text-slate">Orders placed with this email.</p>

        {!session && !loading && (
          <p className="mt-8 text-sm text-slate">
            <button onClick={() => setAuthOpen(true)} className="underline underline-offset-2">Log in</button>{" "}
            to see your orders.
          </p>
        )}

        {readError && <p role="alert" className="mt-8 text-sm">{readError}</p>}
        {session && orders === null && !readError && <p className="mt-8 text-sm text-slate">Loading…</p>}

        {orders && orders.length === 0 && (
          <div className="mt-8 rounded-[18px] bg-wash p-6 text-center">
            <p className="text-sm text-slate">No orders yet.</p>
            <Link href="/collections/wall-art" className="btn mt-4 inline-flex h-11 px-6 text-[0.8rem]">Browse wallpaper</Link>
          </div>
        )}

        <div className="mt-8 space-y-4">
          {orders?.map((o) => (
            <Link
              key={o.id}
              href={`/account/orders/${o.id}`}
              className="flex items-center gap-4 rounded-[18px] border border-edge p-4 transition-colors hover:border-charcoal"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px] bg-wash">
                {o.image && <Image src={o.image} alt={o.title ?? "Order"} fill sizes="64px" className="object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold leading-snug">
                  {o.title}
                  {o.item_count > 1 && <span className="text-mist"> +{o.item_count - 1} more</span>}
                </p>
                <p className="mt-0.5 text-xs text-slate">
                  Order {o.id} · {new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
                </p>
                <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-charcoal ${PILL_CLASS[o.status] ?? "bg-lavender/60"}`}>
                  {STATUS_PILL[o.status] ?? o.status}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{orderMoney(o)}</p>
                <p className="text-[0.7rem] text-mist">View →</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => setAuthOpen(false)} />
    </div>
  );
}
