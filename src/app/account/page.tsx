"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/AuthModal";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { clearSavedContact } from "@/lib/saved-contact";
import { AdsConsentToggle } from "@/components/AdsConsentToggle";
import { usePartner } from "@/components/PartnerProvider";

const STATUS_PILL: Record<string, string> = {
  pending: "Awaiting payment", paid: "Paid", in_production: "Printing",
  printed: "Ready to ship", shipped: "In transit", delivered: "Delivered", cancelled: "Cancelled",
};

type OrderLite = { status: string; created_at: string };

export default function AccountPage() {
  const { session, loading } = useAuth();
  const { partner, loading: partnerLoading } = usePartner();
  const [authOpen, setAuthOpen] = useState(false);
  const [orders, setOrders] = useState<OrderLite[] | null>(null);
  const [gift, setGift] = useState<{ balanceMinor: number; cards: { id: string; balanceMinor: number; from: string; occasion: string }[] } | null>(null);
  const email = session?.user?.email ?? null;

  useEffect(() => {
    if (loading) return;
    if (!session) {setOrders(null);return;}
    let active=true;
    setOrders(null);
    fetch('/api/account/orders',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Orders unavailable');return r.json();}).then(d=>{if(active)setOrders(d.orders);}).catch(()=>{if(active)setOrders(null);});
    return()=>{active=false};
  }, [session, loading]);

  // The gift wallet: cards sent to this account's confirmed email.
  useEffect(() => {
    if (loading || !session) { setGift(null); return; }
    let active = true;
    fetch('/api/account/gift-wallet', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => { if (active) setGift(d); }).catch(() => { if (active) setGift(null); });
    return () => { active = false; };
  }, [session, loading]);

  // Orders come back newest-first from the RPC.
  const count = orders?.length ?? 0;
  const latest = orders && orders.length ? orders[0] : null;
  const ordersDesc =
    orders === null
      ? "Track and manage every order."
      : count === 0
        ? "No orders yet."
        : `${count} order${count > 1 ? "s" : ""} · latest: ${STATUS_PILL[latest!.status] ?? latest!.status}`;

  const links = [
    { href: "/registry/manage", title: "My registries", desc: "Your wish lists, gifts and celebration messages.", badge: null },
    { href: "/account/orders", title: "My orders", desc: ordersDesc, badge: count > 0 ? count : null },
    { href: "/account/boards", title: "My boards", desc: "Wall previews you've saved.", badge: null },
    { href: "/wishlist", title: "Saved designs", desc: "Wallpapers you've hearted.", badge: null },
  ];

  return (
    <div className="container-x py-10">
      <div className="mx-auto max-w-2xl">
        <span className="caps text-slate">Account</span>
        <h1 className="mt-1 font-display text-2xl font-bold">Your account</h1>
        {email ? (
          <p className="mt-1 text-sm text-slate">Signed in as {email}</p>
        ) : partner ? (
          <p className="mt-1 text-sm text-slate">Signed in as {partner.email} through the {partner.name} partner workspace.</p>
        ) : !loading && !partnerLoading ? (
          <p className="mt-1 text-sm text-slate">
            <button onClick={() => setAuthOpen(true)} className="underline underline-offset-2">Log in</button>{" "}
            to see your orders, boards and saved designs.
          </p>
        ) : null}

        {partner && !email && (
          <Link href={`${partner.home}/projects`} className="mt-6 block rounded-[18px] border border-edge p-5 transition-colors hover:border-charcoal">
            <span className="font-display text-base font-semibold">Open {partner.name} workspace →</span>
            <span className="mt-1 block text-xs text-slate">Your partner projects and orders are here.</span>
          </Link>
        )}

        {/* latest-order highlight */}
        {latest && (
          <Link href="/account/orders" className="mt-6 flex items-center justify-between gap-4 rounded-[18px] bg-lavender/30 px-5 py-4 transition-colors hover:bg-lavender/50">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-slate">Latest order</p>
              <p className="mt-0.5 text-sm font-semibold text-charcoal">{STATUS_PILL[latest.status] ?? latest.status}</p>
            </div>
            <span className="text-sm font-semibold underline underline-offset-2">View →</span>
          </Link>
        )}

        {gift && gift.balanceMinor > 0 && (
          <section className="mt-6 rounded-[18px] border border-edge p-5" aria-label="Gift balance">
            <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-slate">Gift balance</p>
            <p className="mt-1 font-display text-2xl font-semibold">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(gift.balanceMinor / 100)}</p>
            <ul className="mt-2 grid gap-1 text-xs text-slate">
              {gift.cards.map(c => <li key={c.id}>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(c.balanceMinor / 100)}{c.from ? ` from ${c.from}` : ''}{c.occasion ? ` · ${c.occasion}` : ''}</li>)}
            </ul>
            <p className="mt-2 text-xs text-slate">No expiry. It is applied at checkout when you choose “Use my gift balance”; anything you don’t spend stays here.</p>
          </section>
        )}

        {email && <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-[18px] border border-edge p-5 transition-colors hover:border-charcoal">
              <div className="flex items-center gap-2">
                <p className="font-display text-base font-semibold">{l.title}</p>
                {l.badge != null && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-charcoal px-1.5 text-[0.62rem] font-bold text-surface">{l.badge}</span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate">{l.desc}</p>
            </Link>
          ))}
        </div>}

        {session && <AdsConsentToggle />}

        {email && (
          <button
            onClick={() => {
              // The browser-local address is a convenience for the person who
              // typed it. Logging out says the next person is somebody else.
              clearSavedContact();
              void supabaseBrowser.auth.signOut();
            }}
            className="mt-8 text-sm text-slate underline underline-offset-2 hover:text-charcoal"
          >
            Log out
          </button>
        )}
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => setAuthOpen(false)} />
    </div>
  );
}
