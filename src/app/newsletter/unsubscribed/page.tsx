
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = brandMetadata({
  title: "Unsubscribed",
  description: "You've been removed from The Zyvorah Letter.",
  robots: { index: false, follow: false },
});

export default function UnsubscribedPage() {
  return (
    <div className="container-x py-24">
      <div className="mx-auto max-w-lg rounded-[32px] bg-sky/30 px-8 py-14 text-center">
        <span className="caps text-slate">The Zyvorah Letter</span>
        <h1 className="mt-3 text-[clamp(1.8rem,3.5vw,2.6rem)] leading-tight">You&apos;re unsubscribed</h1>
        <p className="mx-auto mt-4 max-w-sm text-slate">
          You won&apos;t receive our weekly letter anymore, and we won&apos;t use your details for Zyvorah ads on
          Google or Meta. No hard feelings — the door&apos;s always open if
          you&apos;d like the stories back one day.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn text-sm">
            Back to Zyvorah
          </Link>
          <Link href="/collections/wall-art" className="btn btn-ghost text-sm">
            Browse wallpaper
          </Link>
        </div>
        <p className="mt-8 text-xs text-mist">
          Changed your mind? You can re-join anytime from the footer of{" "}
          <Link href="/" className="underline">
            zyvorah.com
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
