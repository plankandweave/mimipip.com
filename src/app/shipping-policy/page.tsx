
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { SHIPPING_TIERS, EXPRESS_SHIPPING } from "@/lib/shipping";

export const metadata: Metadata = editorialMetadata("/shipping-policy");

  function ShippingPolicyPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Shipping policy"
      intro="Every mural is prepared for your order. Timelines below are estimates in working days, not guarantees. Standard wallpaper ships free across India."
      sections={[
        {
          heading: "What we ship & when",
          body: (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-mist">
                    <th className="py-2 pr-4 font-semibold">Order type</th>
                    <th className="py-2 pr-4 font-semibold">Production</th>
                    <th className="py-2 pr-4 font-semibold">Delivery charge</th>
                    <th className="py-2 font-semibold">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {SHIPPING_TIERS.map((t) => (
                    <tr key={t.key} className="border-b border-edge/60 align-top">
                      <td className="py-2.5 pr-4 font-medium text-charcoal">
                        {t.label}
                        {!t.live && (
                          <span className="ml-1.5 rounded-full bg-mist/25 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-slate">
                            Coming soon
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-slate">{t.production}</td>
                      <td className="py-2.5 pr-4 text-slate">{t.charge}</td>
                      <td className="py-2.5 text-slate">{t.coverage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          heading: "Standard wallpaper",
          body: "Free across India on every order — wallpaper is billed at a minimum of 20 sq ft (minimum chargeable print width 4 ft), and once that minimum is billed there is no courier or shipping charge. Each mural is prepared for your order and dispatched within 5 working days of confirmation, and delivered within 10 working days of confirmation (Sundays excluded). Dispatch may take a little longer around major festivals (e.g. Diwali) or long weekends. You'll receive tracking by email once your order ships.",
        },
        {
          heading: "Express delivery",
          body: `Dispatched the next working day by a faster courier and delivered within 4 working days of confirmation (Sundays excluded), for ₹1,000 per wallpaper plus a flat ₹500 per order. Available across India. Dispatch may take a little longer around major festivals or long weekends.`,
        },
        {
          heading: "Samples",
          body: "Order a design sample for ₹200 each to check the colour, finish and print quality before you commit — posted across India.",
        },
        {
          heading: "Commercial projects",
          body: "For larger and commercial orders, production runs 7–10 working days after design approval and delivery is included in your project quotation. Email hello@zyvorah.com to start.",
        },
        {
          heading: "International",
          body: "We ship globally, including to the United States. International checkout is available. Select your delivery country before ordering. Outside India, the site auto-detects your country and shows a country-adjusted US-dollar price with international delivery included. Import duties, local taxes and customs charges in the destination country are not included and remain the recipient's responsibility.",
        },
        {
          heading: "Tracking & issues",
          body: "If your order hasn't arrived in the expected window, or arrives damaged, email hello@zyvorah.com with your order number and we'll sort it out.",
        },
      ]}
      cta={{ label: "How to measure", href: "/how-to-measure" }}
    />
  );
}

export default withBrandEditorial("/shipping-policy", ShippingPolicyPage);
