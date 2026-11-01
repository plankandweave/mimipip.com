"use client";

import { useEffect, useState } from "react";
import Image from "@/components/SiteImage";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/AuthModal";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { formatINR } from "@/lib/pricing";
import { useMarket } from "@/components/MarketProvider";

type Order = {
  order_number: number;
  status: string;
  created_at: string;
  total: number | string;
  access_token: string;
  placed_via: string;
  title: string | null;
  item_count: number;
  image: string | null;
};

const STATUS_PILL: Record<string, string> = {
  pending: "Awaiting payment", paid: "Queued", in_production: "Printing",
  printed: "Ready to ship", shipped: "In transit", delivered: "Delivered", cancelled: "Cancelled",
};
const PILL_CLASS: Record<string, string> = {
  shipped: "bg-peach/60", delivered: "bg-sage/60", cancelled: "bg-blush/60",
};

export default function MyOrdersPage() {
  const { market } = useMarket();
  const { session, loading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      setAuthOpen(true);
      return;
    }
    supabaseBrowser.rpc("my_orders").then(({ data }) => setOrders((data as Order[]) ?? []));
  }, [session, loading]);

  return (
    <div className="container-x py-10">
      <div className="mx-auto max-w-2xl">
        <span className="caps text-slate">Account</span>
        <h1 className="mt-1 font-display text-2xl font-bold">My orders</h1>
        <p className="mt-1 text-sm text-slate">Track and manage every order placed with this email.</p>

        {!session && !loading && (
          <p className="mt-8 text-sm text-slate">
            <button onClick={() => setAuthOpen(true)} className="underline underline-offset-2">Log in</button>{" "}
            to see your orders.
          </p>
        )}

        {session && orders === null && <p className="mt-8 text-sm text-slate">Loading…</p>}

        {orders && orders.length === 0 && (
          <div className="mt-8 rounded-[18px] bg-wash p-6 text-center">
            <p className="text-sm text-slate">No orders yet.</p>
            <Link href="/collections/wall-art" className="btn mt-4 inline-flex h-11 px-6 text-[0.8rem]">Browse wallpaper</Link>
          </div>
        )}

        <div className="mt-8 space-y-4">
          {orders?.map((o) => (
            <Link
              key={o.access_token}
              href={`/order/${o.access_token}`}
              className="flex items-center gap-4 rounded-[18px] border border-edge p-4 transition-colors hover:border-charcoal"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px] bg-wash">
                {o.image && <Image src={o.image} alt={o.title ?? "Order"} fill sizes="64px" className="object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold leading-snug">
                  {o.title ?? (o.placed_via === "sample" ? "Printed design sample" : `Order #${o.order_number}`)}
                  {o.item_count > 1 && <span className="text-mist"> +{o.item_count - 1} more</span>}
                </p>
                <p className="mt-0.5 text-xs text-slate">
                  Order #{o.order_number} · {new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
                </p>
                <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-charcoal ${PILL_CLASS[o.status] ?? "bg-lavender/60"}`}>
                  {STATUS_PILL[o.status] ?? o.status}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{market.currency === "INR" ? formatINR(Number(o.total)) : "View total"}</p>
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
