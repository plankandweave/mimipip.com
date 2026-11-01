"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocalList, WISHLIST_KEY } from "@/lib/local-store";
import { ProductRow } from "@/components/ProductRow";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/AuthModal";
import { sendTasteSignal } from "@/components/TasteSignal";

export default function WishlistPage() {
  const handles = useLocalList(WISHLIST_KEY);
  const { session, loading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  // The page where the ask makes its own case: the customer is looking at the
  // thing they would lose. Logged as the same funnel step as SaveKeeper's card
  // so "asks shown → addresses given" is one number across both surfaces.
  const asking = !session && !loading && handles.length > 0;
  useEffect(() => {
    if (asking) sendTasteSignal("", "save_prompt");
  }, [asking]);

  return (
    <div className="container-x py-10">
      <h1 className="font-display text-2xl font-bold">Your saved designs</h1>
      <p className="mt-1 text-sm text-slate">
        {session
          ? "Saved to your account — these follow you to any device you sign in on."
          : "Saved on this device. No account needed."}
      </p>

      {asking && (
        <div className="mt-6 flex flex-col gap-3 rounded-[18px] border border-edge bg-wash px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-sm font-bold text-charcoal">
              Keep {handles.length === 1 ? "this design" : `these ${handles.length} designs`}
            </p>
            <p className="mt-0.5 text-xs text-slate">
              This list lives in this browser, so clearing it — or moving to your phone —
              starts you over. Add your email and it stays with you.
            </p>
          </div>
          <button onClick={() => setAuthOpen(true)} className="btn h-10 shrink-0 px-5 text-[0.8rem]">
            Keep my list
          </button>
        </div>
      )}

      <div className="mt-8">
        {handles.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate">You haven&apos;t saved anything yet.</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-mist">
              Tap the heart on any design and it lands here — no account, no interruption.
            </p>
            <Link href="/collections/wall-art" className="btn mt-5 inline-flex h-11 px-6 text-[0.8rem]">
              Browse wallpaper
            </Link>
          </div>
        ) : (
          <ProductRow handles={handles} />
        )}
      </div>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setAuthOpen(false);
          sendTasteSignal("", "save_identify");
          // SaveKeeper merges the list into the account off the session change.
        }}
        reason="keep your saved designs"
      />
    </div>
  );
}
