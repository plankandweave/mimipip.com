// Customer facts share MimiPip's published guides and pricing constants.
import { guides } from "@/brand/review/guides";
import { INSTALL_RATE_LABEL, INSTALL_MIN_SQFT, INSTALL_CITIES_LABEL } from "@/lib/pricing";

export const BRAND_TOPICS = ["delivery_dispatch", "returns_cancellation_refunds", "materials_finishes", "installation_care", "samples", "pricing_gst", "gift_cards", "services", "about_brand", "international"] as const;
export type BrandTopic = (typeof BRAND_TOPICS)[number];
const guide = (key: string) => guides[key]?.[1].join(" ") ?? "";
const facts: Record<BrandTopic, string> = {
  delivery_dispatch: guide("shipping-returns") + " Delivery dates are estimates, not guarantees. Do not offer express delivery unless checkout explicitly provides it.",
  returns_cancellation_refunds: guide("shipping-returns") + " Contact hello@mimipip.com with the order number.",
  materials_finishes: guide("materials") + " Read each wallpaper's assigned surface from its product record; never infer price or compatibility from a room image.",
  installation_care: guide("installation") + ` Optional professional wallpaper installation is offered only in eligible postcodes in ${INSTALL_CITIES_LABEL}, at ${INSTALL_RATE_LABEL}, with a ${INSTALL_MIN_SQFT} sq ft minimum. Confirm eligibility and the exact total in the configurator.`,
  samples: "India design samples are A4, smooth self-adhesive, ₹200 including delivery, one per order. Only offer a sample when the selected design and checkout show availability. Do not promise international samples.",
  pricing_gst: guide("terms") + " Custom-size wallpaper has a 20 sq ft billing minimum. India also offers finished self-adhesive sizes: 2 × 3 ft at ₹1,200, 3 × 4.5 ft at ₹2,700 and 4 × 6 ft at ₹4,800, including GST. These fixed sizes do not use the custom-size minimum. Use price_mural for the exact total; never calculate it mentally. At the minimum, India is ₹4,000 including GST and US is $200 including delivery. Fixed packs use their own listed prices, never the wallpaper square-foot rate. The three Hopscotch packs are ₹4,900 each including GST and India delivery. An unpriced product has no confirmed selling price; do not invent one. Installation and paid personalisation are separate line items where offered.",
  gift_cards: "Mimi Pip gift-card purchasing and redemption have not been enabled. Do not offer or promise a gift card. For gifting help, contact hello@mimipip.com.",

  services: guide("tools") + " Only offer a tool, uploaded-art order or custom design purchase when its live page supports that action. For custom projects or trade enquiries, contact hello@mimipip.com. Never promise an unavailable checkout or production option.",
  about_brand: guide("about") + " MimiPip is a brand of Magnitude Brands Private Limited. Contact hello@mimipip.com.",
  international: guide("us") + " US wallpaper is $10 per square foot including delivery, with a 20 sq ft minimum. Destination duties and taxes are not included. Check the selected country's checkout and product availability; do not promise fulfilment for an unavailable product or market.",
};
export function getBrandInfo(topics: string[]): { topic: string; facts: string }[] {
  const wanted = topics.filter((t): t is BrandTopic => (BRAND_TOPICS as readonly string[]).includes(t));
  return (wanted.length ? wanted : ["about_brand" as const]).map(topic => ({topic, facts: facts[topic]}));
}
