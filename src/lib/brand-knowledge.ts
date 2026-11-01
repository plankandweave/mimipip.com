// The single knowledge base the Ask Zyvorah concierge answers brand/policy
// questions from. Where a fact is a NUMBER or timeline, it is imported from the
// master config (shipping.ts / pricing.ts) — NEVER re-typed — so the assistant
// can never contradict the live site. Prose policy facts (returns, materials,
// installation, services, about) are transcribed once here; if you change one
// of those policies on its page, update the matching entry below.

import {
  STANDARD_SHIPPING,
  EXPRESS_SHIPPING,
  expressSurcharge,
  estimateStandardDelivery,
  estimateExpressDelivery,
  formatShipDate,
} from "@/lib/shipping";
import { GST_RATE, INSTALL_RATE_LABEL, INSTALL_MIN_SQFT, INSTALL_CITIES_LABEL, BESPOKE_PRICE } from "@/lib/pricing";

const CONTACT_EMAIL = "hello@zyvorah.com";
const GST_PCT = Math.round(GST_RATE * 100);

export const BRAND_TOPICS = [
  "delivery_dispatch",
  "returns_cancellation_refunds",
  "materials_finishes",
  "installation_care",
  "samples",
  "pricing_gst",
  "gift_cards",
  "services",
  "about_brand",
  "international",
] as const;

export type BrandTopic = (typeof BRAND_TOPICS)[number];

function deliveryFacts(): string {
  const s = estimateStandardDelivery();
  const e = estimateExpressDelivery();
  return [
    `Standard wallpaper: FREE across ${STANDARD_SHIPPING.coverage} on every order — there is no courier charge; small orders are simply billed at the ${STANDARD_SHIPPING.minBilledSqFt} sq ft minimum (see pricing). Prepared for your order, dispatched within ${STANDARD_SHIPPING.productionWorkingDays} working days and delivered within ${STANDARD_SHIPPING.deliveryWorkingDays} working days of order confirmation (Sundays excluded). If a customer orders today, delivered by ${formatShipDate(s.deliveryTo)}.`,
    `Express delivery: dispatched the next working day by a faster courier and delivered within ${EXPRESS_SHIPPING.deliveryWorkingDays} working days of order confirmation, for ${expressSurcharge(1).toLocaleString("en-IN")} for one wallpaper (₹${EXPRESS_SHIPPING.perWallpaperCharge.toLocaleString("en-IN")} per wallpaper + a flat ₹${EXPRESS_SHIPPING.perOrderCharge.toLocaleString("en-IN")} per order), chosen at checkout. Order today with Express → delivered by ${formatShipDate(e.deliveryTo)}.`,
    `IMPORTANT — ${EXPRESS_SHIPPING.speedNote} Never promise Express in fewer than ${EXPRESS_SHIPPING.deliveryWorkingDays} working days, or Standard in fewer than ${STANDARD_SHIPPING.deliveryWorkingDays}.`,
    STANDARD_SHIPPING.exceptionsNote,
    "All timelines are estimates in working days, not guarantees. Tracking is emailed once an order ships.",
    "For commercial/large orders: production runs 7–10 working days after design approval; delivery is included in the project quotation.",
  ].join(" ");
}

const STATIC_FACTS: Record<Exclude<BrandTopic, "delivery_dispatch">, string> = {
  returns_cancellation_refunds:
    "Cancellations: production is fully automated, so an order can be cancelled for a full refund ONLY within 12 hours of placing it AND only if printing hasn't begun (while still 'pending' or 'paid'). Email " +
    CONTACT_EMAIL +
    " to cancel, or ask the concierge to cancel it for you if it's still eligible. " +
    "Made-to-order returns: because every piece is custom-printed to the customer's exact wall, there are NO returns or refunds for a change of mind or for wrong measurements — the customer is responsible for their measurements; Zyvorah is responsible for faithful reproduction and print quality. " +
    "Damaged in transit: email " + CONTACT_EMAIL + " within 48 hours of delivery with photos — we replace the affected panels or reprint free. " +
    "Manufacturing/print defect: report within 7 days with photos — reprint or replace free. We replace only the affected panels, not the whole order. " +
    "Colour: screen-to-print variation is normal and not a defect. Installation damage is not covered (professional installation is available in Bengaluru, Mumbai and Pune)." +
    "Refunds, when due, go to the original payment method via Razorpay within 7 working days.",
  materials_finishes:
    "Each wallpaper has its own surface, selected as part of the design: a smooth matte surface or a linen feel. Do not offer a media selector or describe the business as a printer. Quote the design's catalogue price, never a price inferred from its surface. " +
    "Wallpaper is intended for long-term installation; removal generally requires dampening and peeling it from the wall. Removed panels should not be expected to remain suitable for reuse.",
  installation_care:
    "Each order arrives as clearly-labelled drops with a fitting guide in the box. Soft Matte hangs paste-the-wall (roll paste onto the wall, hang the dry drop; the material doesn't expand, so there's no soaking time). Prepare a smooth, clean, dry wall first. " +
    `Care: once hung, wipe gently with a barely-damp cloth; avoid harsh cleaners and scrubbing. For large walls we recommend a local professional wallpaper fitter; on-site professional installation is available ONLY in ${INSTALL_CITIES_LABEL} (${INSTALL_RATE_LABEL}, walls of ${INSTALL_MIN_SQFT}+ sq ft) — it cannot be ordered for any other city, where we supply the fitting guide instead.`,
  samples:
    "Printed design samples cost ₹200 each — an actual section of a real design, printed at full quality on the design’s surface and posted across India, so you can check colour and print before committing. Order from any product page, the samples page, or ask the concierge. A sample is an A4 section of the selected design and does not show the complete wall composition.",
  pricing_gst:
    `Every design is priced per square foot and made to the exact wall size (enter width and height, and the price updates instantly). In India, prices are INR and GST-inclusive at ${GST_PCT}%, with free standard shipping. Outside India, the site shows country-adjusted USD pricing based on regional market positioning rather than a spot-currency conversion; international delivery is included, while destination duties, local taxes and customs charges are excluded. SMALL-ORDER MINIMUMS: the chargeable print width is never less than 4 ft and a wallpaper order is never billed below 20 sq ft — the print is still made to the customer's exact wall size. Ordinary collection wallpapers are ₹300/sq ft; wallpapers outside collections are ₹200/sq ft, with Signature and Autograph exceptions. TAASH retains its designer-agreed rates. Always read the actual product rate. Ikat is ₹300 with a linen feel and is not Autograph; Katha stays Signature at ₹300 with a smooth matte surface; Stallion Spirit is Autograph at ₹300 with a linen feel. Other Autograph designs retain their own catalogue rates. Autograph is sold ONLY on zyvorah.com. Describe the surface as part of the design, never offer wallpaper media or stock choices. Professional installation is India-only and quoted at ${INSTALL_RATE_LABEL}. A GST tax invoice can include the customer's GSTIN for India orders.`,
  gift_cards:
    "Zyvorah gift cards are available from ₹500 up to ₹50,000 (preset ₹1,000 / ₹2,000 / ₹5,000 / ₹10,000, or a custom amount within that range), paid via Razorpay. They're redeemable at checkout against any design, and can be emailed to a recipient with a personal message. A gift card is tender, not a discount — the order total stays full and the card covers part or all of the amount payable.",
  services:
    `Beyond the ready catalogue, Zyvorah offers: Bespoke design — original design work to your brief at a flat ₹${BESPOKE_PRICE.toLocaleString("en-IN")} PER DESIGN, whatever the wall size, bookable straight from /bespoke (choose how many designs you need). It is DESIGN WORK ONLY and does NOT include printing the wallpaper — the wallpaper itself is ordered separately at its per-sq-ft price. Unusually complicated artwork is quoted before any work begins. The same service can be added to any specific design from its product page ("customise this design") when a customer wants an existing mural extended, recoloured or adjusted. ` +
    "Print Your Own (upload your own artwork and we prepare it to your exact wall size); " +
    "Commercial projects for hospitality, workspaces, retail and wellness (brief → design & proof → production 7–10 working days after approval → delivery & fitting; email " + CONTACT_EMAIL + " with 'Project'); " +
    "a Trade programme for interior designers and architects (trade pricing, priority sampling, dedicated support, project boards — email " + CONTACT_EMAIL + " with 'Trade'); " +
    `professional on-site installation in ${INSTALL_CITIES_LABEL} only; ` + "and free tools on the site: 'See it on your wall' (preview any design in a photo of your real wall) and the design-matching concierge.",
  about_brand:
    "Zyvorah is an Indian brand of hand-designed, mural wallpaper designs — designed and printed in India, sized to each customer's wall (nothing sits in a warehouse, so there's little waste). The catalogue spans florals, sweeping landscapes, playful kids' scenes, animals, art and signature collections. Sustainability: no overproduction; expanding a range of low-impact substrates (including an eco-cotton canvas) and using water-based inks where possible. Contact " + CONTACT_EMAIL + " — the team replies within one working day. Follow @zyvorah_wallpapers on Instagram and Zyvorah on Pinterest.",
  international:
    "Zyvorah ships globally. Cloudflare auto-detects the visitor's country and the buyer can correct it from the country selector. India is shown in INR with free standard shipping; every other country is shown and charged in USD using country-relative market pricing with international delivery included. Import duties, destination taxes and customs charges are not included and, if charged, are paid by the recipient. Wallpaper travels in a 1,400 mm long, 75 mm diameter protective tube.",
};

/** Retrieve the concierge-ready facts for one or more brand topics. */
export function getBrandInfo(topics: string[]): { topic: string; facts: string }[] {
  const wanted = topics.filter((t): t is BrandTopic => (BRAND_TOPICS as readonly string[]).includes(t));
  const list = wanted.length ? wanted : (["about_brand"] as BrandTopic[]);
  return list.map((topic) => ({
    topic,
    facts: topic === "delivery_dispatch" ? deliveryFacts() : STATIC_FACTS[topic],
  }));
}
