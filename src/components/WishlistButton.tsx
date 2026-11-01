"use client";

import { useLocalList, toggleWishlist, WISHLIST_KEY } from "@/lib/local-store";
import { sendTasteSignal } from "@/components/TasteSignal";
import { announceSave } from "@/components/SaveKeeper";

/**
 * Heart toggle. One tap, no questions: the design is saved the moment it is
 * pressed, for everyone, signed in or not.
 *
 * It used to demand a verified email first — the reasoning being that a save is
 * the moment an anonymous browser becomes a lead worth having. In practice it
 * collected neither. Over the two months to 26 September 2026 the shop took
 * 6,231 design views and 10 saves: a shopper thirty seconds into browsing
 * wallpaper will not stop to fetch a code out of their inbox in order to
 * bookmark a picture, so the wall produced no saves AND no email addresses, and
 * the abandonment was invisible because the only event fired after verification.
 * Pinterest's "Pin It" is one tap because you are already signed in to
 * Pinterest; asking for the account and the save in the same gesture asks at the
 * moment of least commitment.
 *
 * So the ask moved instead of disappearing: SaveKeeper invites the customer to
 * keep their list once there are a few designs in it, and the wishlist page asks
 * outright. A guest's saves are held in localStorage and merged into their
 * account at sign-in (src/lib/wishlist-sync.ts), so nothing saved before
 * verifying is lost, and every save is logged against the anonymous taste cookie
 * either way — which is how the pre-login ones still show up against the person
 * once the cookie is linked to them.
 *
 * Two variants: "overlay" floats on a product card image; "inline" sits in the
 * product page.
 */
export function WishlistButton({
  handle,
  variant = "overlay",
}: {
  handle: string;
  variant?: "overlay" | "inline";
}) {
  const list = useLocalList(WISHLIST_KEY);
  const on = list.includes(handle);

  const heart = (
    <svg
      width={variant === "inline" ? 20 : 18}
      height={variant === "inline" ? 20 : 18}
      viewBox="0 0 24 24"
      fill={on ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20s-7-4.35-9.2-8.35C1.3 8.9 2.6 6 5.5 6 7.4 6 8.7 7 12 10c3.3-3 4.6-4 6.5-4 2.9 0 4.2 2.9 2.7 5.65C19 15.65 12 20 12 20Z" />
    </svg>
  );

  // The heart lives inside the card's <Link>; without this every save would
  // also navigate away from the grid the shopper is browsing.
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { on: nowOn, count } = toggleWishlist(handle);
    if (nowOn) sendTasteSignal(handle, "save"); // saving is a strong taste signal
    announceSave({ handle, on: nowOn, count });
  };

  if (variant === "inline") {
    return (
      <button
        onClick={handleClick}
        aria-pressed={on}
        className={`flex h-12 items-center gap-2 rounded-full border px-5 text-sm font-semibold transition-colors ${
          on ? "border-charcoal bg-charcoal text-surface" : "border-edge text-charcoal hover:border-charcoal"
        }`}
      >
        {heart}
        {on ? "Saved" : "Save"}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      aria-label={on ? "Remove from saved designs" : "Save this design"}
      aria-pressed={on}
      /* Bigger than it looks: the visible pill is 9/10 units but the tap target
         is padded out to ~44px so a thumb on a phone hits the heart and not the
         card underneath it. */
      className="absolute right-1.5 top-1.5 z-10 grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-90 sm:right-3 sm:top-3 sm:h-10 sm:w-10"
    >
      <span
        className={`grid h-9 w-9 place-items-center rounded-full bg-surface/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-surface ${
          on ? "text-charcoal" : "text-slate"
        }`}
      >
        {heart}
      </span>
    </button>
  );
}
