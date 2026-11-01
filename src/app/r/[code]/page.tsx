
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { checkDiscount } from "@/lib/discounts";
import { DiscountKeeper } from "@/components/DiscountKeeper";
import { formatMarketMoney } from "@/lib/markets";

// zyvorah.com/r/<code> — two kinds of code land here:
//   • the QR printed on every install insert: a unique per-order 15%-off code
//     minted by the Magnitude OS;
//   • a creator collaboration code (lib/discounts.ts), sent to the creator in
//     her brief — the wall we are gifting, personal to her email.
// Either way, validate it live and carry it straight into the cart so the
// discount "just works".

export const metadata: Metadata = brandMetadata({
  title: "Your Zyvorah code",
  robots: { index: false, follow: false },
});

export const dynamic = "force-dynamic";

export default async function DiscountLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).trim().toUpperCase();
  // No email and no cart yet: a personal code previews as valid, and the
  // checkout holds it to the creator's own address.
  const check = await checkDiscount(code, { isTradeAccount: false });
  const collab = check.valid && check.issuedFor === "creator_collab";

  return (
    <div className="container-x flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-md rounded-[22px] bg-wash p-8 text-center">
        {check.valid ? (
          <>
            <DiscountKeeper code={code} />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mist">{collab ? "Your Zyvorah collaboration" : "Welcome back"}</p>
            <h1 className="mt-3 font-display text-3xl font-extrabold">
              {collab
                ? check.pct >= 100
                  ? check.maxValueInr
                    // A collaboration is settled in rupees: the ceiling is the
                    // figure agreed with the creator, not a market price.
                    ? `Your wall, on us — up to ${formatMarketMoney(check.maxValueInr, "INR")}`
                    : "Your wall, on us"
                  : `${check.pct}% off your wall`
                : `${check.pct}% off your next wallpaper`}
            </h1>
            <p className="mt-3 text-sm text-slate">
              {collab
                ? "Choose your design and measure your wall. Your code is applied and waiting at checkout:"
                : "Your personal code is applied and waiting at checkout:"}
            </p>
            <p className="mt-2 rounded-full bg-surface px-4 py-2 font-mono text-sm font-bold tracking-wide">{code}</p>
            <Link href="/collections/wall-art" className="btn mt-6 inline-flex h-12 w-full items-center justify-center text-[0.82rem]">
              Browse wallpapers
            </Link>
            <p className="mt-3 text-xs text-mist">
              {collab
                ? `One use · personal to ${check.personalTo ?? "your email"} — check out with that address${check.allowedHandles?.length ? " · for the design we agreed" : ""}${check.freeShipping ? " · delivery included" : ""}`
                : "One use · applies to the wallpaper price at checkout"}
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mist">Zyvorah</p>
            <h1 className="mt-3 font-display text-2xl font-extrabold">
              {check.reason === "already_redeemed" ? "This code has already been used" :
               check.reason === "expired" ? "This code has expired" :
               "We couldn't find that code"}
            </h1>
            <p className="mt-3 text-sm text-slate">
              {check.reason === "already_redeemed"
                ? "Each code works once — but your next order earns a fresh one, printed on its install sheet."
                : "Check the code under the QR on your install sheet, or write to hello@zyvorah.com and we'll sort it out."}
            </p>
            <Link href="/collections/wall-art" className="btn mt-6 inline-flex h-12 w-full items-center justify-center text-[0.82rem]">
              Browse wallpapers
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
