"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Review = { rating: number; author_name: string | null; body: string | null; verified: boolean };

/**
 * Social proof at the point of decision: the product's best published review
 * as a pull-quote right under the price, where a hesitant buyer actually
 * looks. Executes the "Feature the Padma review as social proof" intelligence
 * decision — site-wide, so every design earns this block the moment it gets a
 * glowing review. Renders nothing when there's no published review.
 */
export function FeaturedReview({ handle }: { handle: string }) {
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: product } = await supabaseBrowser
        .from("products")
        .select("id")
        .eq("handle", handle)
        .maybeSingle();
      if (!product || !alive) return;
      const { data } = await supabaseBrowser
        .from("reviews")
        .select("rating, author_name, body, verified")
        .eq("product_id", product.id)
        .eq("status", "published")
        .gte("rating", 4)
        .not("body", "is", null)
        .order("rating", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (alive && data?.body) setReview(data as Review);
    })();
    return () => {
      alive = false;
    };
  }, [handle]);

  if (!review?.body) return null;

  return (
    <figure className="mt-5 rounded-[18px] bg-wash p-5">
      <div className="text-amber-500" aria-label={`${review.rating} out of 5 stars`}>
        {"★★★★★".slice(0, review.rating)}
        <span className="text-mist">{"★★★★★".slice(review.rating)}</span>
      </div>
      <blockquote className="mt-2 text-sm italic leading-relaxed text-charcoal">
        &ldquo;{review.body}&rdquo;
      </blockquote>
      <figcaption className="mt-2 text-xs text-mist">
        — {review.author_name || "A Zyvorah customer"}
        {review.verified && <span className="ml-2 rounded-full bg-sage/50 px-2 py-0.5 text-[0.6rem] font-semibold uppercase text-charcoal">Verified buyer</span>}
      </figcaption>
    </figure>
  );
}
