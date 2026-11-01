"use client";

import { useRouter } from "next/navigation";
import { SampleOrderModal } from "@/components/SampleOrderModal";
import { SAMPLE_SCOPE_NOTE } from "@/lib/sample-designs";
import { MarketPricingNote } from "@/components/MarketMoney";

/** Standalone "order a sample" page — reuses the sample modal full-screen. */
export default function SamplesPage() {
  const router = useRouter();
  return (
    <div className="container-x py-16">
      <div className="mx-auto max-w-lg text-center">
        <span className="caps text-slate">Samples</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,2.8rem)] leading-tight">
          <MarketPricingNote india="Order a sample" international="Design samples" />
        </h1>
        {/* The offer, then its price — but only where the price can be paid.
            The form below is gated on the same market (OrderSample), so a
            reader abroad met a rupee figure and then a panel telling them it
            was not for them. */}
        <p className="mt-4 text-slate">
          See an actual design shown at full quality on our paste-the-wall Soft Matte wallpaper finish
          <MarketPricingNote
            india=" — delivered across India, ₹200 per design sample."
            international=". Samples are cut and posted within India only, so we cannot send one overseas yet."
          />
        </p>
        <p className="mt-2 text-sm text-mist">
          {SAMPLE_SCOPE_NOTE}
        </p>
      </div>
      <SampleOrderModal open onClose={() => router.push("/collections/wall-art")} />
    </div>
  );
}
