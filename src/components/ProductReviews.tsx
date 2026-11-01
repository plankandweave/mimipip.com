"use client";

import { useCanvasJourney } from "./ShoppingJourney";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Review = {
  id: string;
  rating: number;
  author_name: string | null;
  body: string | null;
  created_at: string;
  verified: boolean;
};

function StarRow({ value }: { value: number }) {
  return (
    <span className="text-amber-500 text-sm" aria-label={`${value} out of 5`}>
      {"★★★★★".slice(0, value)}
      <span className="text-mist">{"★★★★★".slice(value)}</span>
    </span>
  );
}

export function ProductReviews({ handle }: { handle: string }) {
  const canvas = useCanvasJourney();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [agg, setAgg] = useState<{ count: number; average: number }>({ count: 0, average: 0 });
  const [rating, setRating] = useState(5);
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    const [{ data: prod }, aggRes] = await Promise.all([
      supabaseBrowser.from("products").select("id").eq("handle", handle).maybeSingle(),
      supabaseBrowser.rpc("product_rating", { p_handle: handle }),
    ]);
    if (aggRes.data) setAgg(aggRes.data as { count: number; average: number });
    if (prod?.id) {
      const { data } = await supabaseBrowser
        .from("reviews")
        .select("id, rating, author_name, body, created_at, verified")
        .eq("product_id", prod.id)
        .eq("status", "published")
        .order("verified", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);
      setReviews((data as Review[]) ?? []);
    }
  }, [handle]);

  useEffect(() => {
    load();
  }, [load]);

  const orderNo = parseInt(orderNumber.replace(/\D/g, ""), 10);
  const canSubmit =
    !busy && orderNumber.trim() !== "" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser.rpc("submit_verified_review", {
      p_handle: handle,
      p_order_number: orderNo,
      p_email: email.trim(),
      p_rating: rating,
      p_author: name || null,
      p_body: body || null,
    });
    setBusy(false);
    if (error) {
      const m = error.message || "";
      if (m.includes("no_verified_purchase"))
        setError("We couldn't find a paid order with that number and email for this design. Only verified buyers can leave a review.");
      else if (m.includes("already_reviewed"))
        setError("You've already reviewed this design — thank you!");
      else setError("Couldn't submit your review — please try again.");
      return;
    }
    setDone(true);
    setBody("");
    setName("");
    setOrderNumber("");
    setEmail("");
    load();
  };

  const field = "mt-2 h-11 w-full rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal";

  return (
    <section id="reviews" className="container-x scroll-mt-32 py-10 lg:py-16">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
        <div>
          {/* With no reviews the section no longer announces the absence. "No
              verified buyer reviews for this design yet" sat on every product
              page, under an ₹18,000 decision, and was the loudest trust signal
              the page had (7 October 2026 audit). The verified-buyer form
              stays, so the first review can still arrive. */}
          <h2 className="text-2xl">{agg.count > 0 ? "Reviews" : "Bought this design?"}</h2>
          {agg.count > 0 ? (
            <div className="mt-3">
              <p className="font-display text-4xl font-extrabold">{agg.average.toFixed(1)}</p>
              <StarRow value={Math.round(agg.average)} />
              <p className="mt-1 text-sm text-slate">{agg.count} {agg.count === 1 ? "review" : "reviews"}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate">{canvas ? "Explore the artwork, finished sizes and available close-ups before ordering." : "Each design has its own surface and is made for your wall. Explore its details and available close-ups before ordering."}</p>
          )}

          {/* write a review — verified buyers only */}
          <div className="mt-6 rounded-[18px] bg-wash p-5">
            {done ? (
              <p className="text-sm text-charcoal">Thanks for your review ✦ It&apos;s now live with a verified-purchase badge.</p>
            ) : (
              <>
                <button type="button" onClick={() => setFormOpen((v) => !v)} aria-expanded={formOpen} className="text-left text-sm font-semibold underline underline-offset-2">Purchased this design? Write a review</button>
                {formOpen && <>
                <p className="mt-1 text-xs text-slate">We verify reviews against your order, so every rating comes from a real buyer.</p>
                <div className="mt-3 flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRating(n)} aria-label={`${n} star`} className="text-2xl leading-none">
                      <span className={n <= rating ? "text-amber-500" : "text-mist"}>★</span>
                    </button>
                  ))}
                </div>
                <input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  inputMode="numeric"
                  placeholder="Order number (from your confirmation)"
                  className={field}
                />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="Email used for the order"
                  className={field}
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name (optional)"
                  className={field}
                />
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="What did you think?"
                  rows={3}
                  className="mt-2 w-full rounded-[12px] border border-edge bg-surface px-4 py-3 text-sm outline-none focus:border-charcoal"
                />
                {error && <p className="mt-2 text-xs text-charcoal/80">{error}</p>}
                <button onClick={submit} disabled={!canSubmit} className="btn mt-3 h-10 px-5 text-[0.78rem] disabled:opacity-40">
                  {busy ? "Submitting…" : "Submit review"}
                </button>
                </>}
              </>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {reviews.length > 0 && (
            reviews.map((r) => (
              <div key={r.id} className="border-b border-edge pb-5">
                <div className="flex items-center justify-between">
                  <StarRow value={r.rating} />
                  <span className="text-xs text-mist">
                    {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {r.author_name && <p className="text-sm font-semibold">{r.author_name}</p>}
                  {r.verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sage/50 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-charcoal">
                      ✓ Verified purchase
                    </span>
                  )}
                </div>
                {r.body && <p className="mt-1 text-sm text-slate">{r.body}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
