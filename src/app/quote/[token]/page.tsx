
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchQuote } from "@/lib/zyvorah-quote-os";
import QuoteActions from "./QuoteActions";

// The customer's quotation, sent the moment we finish measuring their walls.
// The token is unguessable and minted by the OS — the same one their order
// page uses. Never indexed.

export const metadata: Metadata = brandMetadata({
  title: "Your Zyvorah quotation",
  robots: { index: false, follow: false },
});

export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await fetchQuote(token);
  if (!q) notFound();

  const settled = Boolean(q.acceptedAt || q.paidAt);

  return (
    <div className="container-x max-w-2xl py-10">
      <p className="caps text-slate">Your quotation</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight">
        {q.firstName ? `${q.firstName}, here's your wallpaper` : "Here's your wallpaper"}
      </h1>
      <p className="mt-1.5 text-sm text-slate">
        {q.walls} wall{q.walls === 1 ? "" : "s"}, made to your exact measured sizes.
        {q.number ? <> · <span className="font-mono text-xs">{q.number}</span></> : null}
      </p>

      <div className="mt-7 rounded-[18px] border border-edge bg-surface p-5">
        {q.lines.length === 0 ? (
          <p className="text-sm text-slate">We&apos;re preparing your figures — this page will show them shortly.</p>
        ) : (
          <div className="space-y-3">
            {q.lines.map((l, i) => (
              <div key={i} className="flex items-start justify-between gap-4 border-b border-edge pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{l.desc}</p>
                  {l.sub && <p className="mt-0.5 text-xs text-slate">{l.sub}</p>}
                  {l.qtyLabel && <p className="mt-0.5 text-[11px] text-mist">{l.qtyLabel}{l.rateLabel ? ` · ${l.rateLabel}` : ""}</p>}
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">{inr(l.incl)}</p>
              </div>
            ))}
          </div>
        )}

        {q.grandTotal != null && (
          <div className="mt-4 flex items-baseline justify-between border-t border-edge pt-4">
            <span className="font-display font-bold">Total</span>
            <span className="font-display text-xl font-extrabold tabular-nums">{inr(q.grandTotal)}</span>
          </div>
        )}
        <p className="mt-1 text-right text-[11px] text-mist">Inclusive of GST</p>
      </div>

      <div className="mt-6">
        {settled ? (
          <div className="rounded-[18px] border border-edge bg-wash p-6 text-center">
            <p className="font-display text-lg font-bold">
              {q.paidAt ? "Payment received — thank you" : "Accepted — thank you"}
            </p>
            <p className="mt-1.5 text-sm text-slate">
              Your walls are in production. We&apos;ll email you as each one is printed and on its way.
            </p>
          </div>
        ) : q.declinedAt ? (
          <div className="rounded-[18px] border border-dashed border-edge bg-wash p-6 text-center">
            <p className="text-sm text-slate">
              This quotation is on hold. If you&apos;d like us to revisit it, just reply to our email — the measurements are safe.
            </p>
          </div>
        ) : (
          <QuoteActions token={token} customerName={q.customerName}
            totalLabel={q.grandTotal != null ? inr(q.grandTotal) : ""} />
        )}
      </div>

      <p className="mt-8 text-center text-xs text-mist">
        Questions about anything here? Reply to our email or write to hello@zyvorah.com.
      </p>
    </div>
  );
}
