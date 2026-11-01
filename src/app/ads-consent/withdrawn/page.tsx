
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = brandMetadata({
  title: "Ads consent withdrawn",
  description: "Zyvorah will no longer use your details for ads on Google or Meta.",
  robots: { index: false, follow: false },
});

export default function AdsConsentWithdrawnPage() {
  return (
    <div className="container-x py-24">
      <div className="mx-auto max-w-lg rounded-[32px] bg-sky/30 px-8 py-14 text-center">
        <span className="caps text-slate">Your privacy</span>
        <h1 className="mt-3 text-[clamp(1.8rem,3.5vw,2.6rem)] leading-tight">Consent withdrawn</h1>
        <p className="mx-auto mt-4 max-w-sm text-slate">
          We&apos;ve stopped using your email and phone for Zyvorah ads on Google and Meta. You&apos;ll be taken off
          those lists at our next update, and within Google&apos;s and Meta&apos;s own processing time after that.
          Order and account messages are not affected.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn text-sm">
            Back to Zyvorah
          </Link>
          <Link href="/privacy#personalised-ads" className="btn btn-ghost text-sm">
            Privacy policy
          </Link>
        </div>
      </div>
    </div>
  );
}
