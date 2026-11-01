"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The first thing on the dashboard: everything that is waiting on THIS person,
 * each one a single tap to the screen where it gets done.
 *
 * Vijay Sales keep the portal on a phone home screen and open it like an app
 * (Abhay, 8 October 2026). The store artwork they had to approve lived behind
 * Stores → Surveys → a store, and the orders board below shows every order
 * the account has ever placed, so "what do I need to do" had no answer on the
 * screen they opened. Proposals to approve and surveys to release come from
 * /api/corporate/site-batch; drafts and payments from the orders the
 * dashboard already holds, passed in.
 */

type Batch = {
  id: string; title: string; storeName: string | null; city: string | null;
  walls: number; awaitingRelease: boolean; awaitingApproval?: number;
};

type Quote = { token: string; walls: number; totalInr: number; sentBy: string; sentTo: string | null; createdAt: string };

const firstName = (email: string) => {
  const local = email.split("@")[0] ?? "";
  const w = local.split(/[._-]+/)[0] ?? "";
  return w ? w[0].toUpperCase() + w.slice(1) : email;
};

export type WaitingOrder = { ref: string; name: string; stage: "Draft" | "Awaiting payment" };

type Item = { key: string; title: string; detail: string; action: string; href?: string; onOpen?: () => void };

const storeOf = (b: Batch) =>
  b.storeName ?? b.title.split(" · ").slice(1, 2)[0] ?? b.title;

export default function WaitingOnYou({ slug, isAdmin, canOrder, orders, onOpenOrder }: {
  slug: string;
  /** Approving artwork and releasing a survey are admin acts (the review page
   *  and the release route both say so); nobody is shown a task they cannot do. */
  isAdmin: boolean;
  canOrder: boolean;
  orders: WaitingOrder[];
  onOpenOrder: (ref: string) => void;
}) {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/corporate/site-batch", { cache: "no-store" });
      if (r.ok) setBatches(((await r.json()).batches ?? []) as Batch[]);
    } catch { /* the strip is a shortcut; the board below still works */ }
    // Quotations sent out for a PO: the team sees them here, not only the one
    // inbox they were mailed to.
    if (canOrder) try {
      const r = await fetch("/api/corporate/quotes", { cache: "no-store" });
      if (r.ok) setQuotes(((await r.json()).quotes ?? []) as Quote[]);
    } catch { /* same: a shortcut */ }
  }, [canOrder]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // An approval made in the review screen should leave this list the moment
    // the person comes back, and a phone app is "come back" far more often
    // than it is "reload".
    const t = setInterval(() => void load(), 60_000);
    const onShow = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); window.removeEventListener("focus", onShow); };
  }, [load]);

  const items: Item[] = [];
  if (isAdmin) for (const b of batches ?? []) {
    if (b.awaitingApproval) items.push({
      key: `approve-${b.id}`,
      title: `Approve artwork · ${storeOf(b)}`,
      detail: `${b.awaitingApproval} wall${b.awaitingApproval === 1 ? "" : "s"} ready for your approval${b.city ? ` · ${b.city}` : ""}`,
      action: "Review",
      href: `/partners/${slug}/site-batches/${b.id}`,
    });
    else if (b.awaitingRelease) items.push({
      key: `release-${b.id}`,
      title: `Release survey · ${storeOf(b)}`,
      detail: `${b.walls} wall${b.walls === 1 ? "" : "s"} measured — release them to design`,
      action: "Open",
      href: `/partners/${slug}/site-batches`,
    });
  }
  if (canOrder) for (const q of quotes) items.push({
    key: `quote-${q.token}`,
    title: `Enter PO · ${q.walls} wall${q.walls === 1 ? "" : "s"} · ₹${Math.round(q.totalInr).toLocaleString("en-IN")}`,
    detail: `Quotation from ${firstName(q.sentBy)}${q.sentTo ? ` to ${q.sentTo}` : ""}, ${new Date(q.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — prints once the PO number is entered`,
    action: "Enter PO",
    href: `/q/${q.token}`,
  });
  if (canOrder) for (const o of orders) items.push({
    key: `order-${o.ref}`,
    title: `${o.stage === "Draft" ? "Confirm order" : "Pay for order"} · ${o.ref}`,
    detail: o.stage === "Draft" ? `${o.name} — a draft until you lock the price` : `${o.name} — payment due before printing`,
    action: o.stage === "Draft" ? "Confirm" : "Pay",
    onOpen: () => onOpenOrder(o.ref),
  });

  if (batches === null) return null;

  return (
    <section aria-labelledby="waiting-heading" className="mb-6 rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <h2 id="waiting-heading" className="text-base font-semibold">Waiting on you</h2>
        {items.length > 0 && <span className="text-xs text-stone-500">{items.length} to do</span>}
      </div>
      {items.length === 0
        ? <p className="px-5 pb-4 pt-1 text-sm text-stone-500">Nothing needs you right now. New approvals will appear here first.</p>
        : <ul className="mt-2 divide-y divide-stone-100">
            {items.map(it => {
              const body = <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-stone-800">{it.title}</span>
                  <span className="mt-0.5 block text-xs text-stone-500">{it.detail}</span>
                </span>
                <span className="shrink-0 rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">{it.action}</span>
              </>;
              const cls = "flex min-h-[56px] w-full items-center gap-4 px-5 py-3 text-left hover:bg-stone-50";
              return <li key={it.key}>
                {it.href
                  ? <a href={it.href} data-title={it.title} className={cls}>{body}</a>
                  : <button type="button" onClick={it.onOpen} className={cls}>{body}</button>}
              </li>;
            })}
          </ul>}
    </section>
  );
}
