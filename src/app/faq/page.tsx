
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { JsonLd } from "@/components/JsonLd";
import { EXPRESS_SHIPPING } from "@/lib/shipping";
import { SITE_URL, faqJsonLd } from "@/lib/seo";

export const metadata: Metadata = editorialMetadata("/faq");

// The answers, once. They are rendered for a reader AND emitted as FAQPage
// structured data, so an answer engine quotes the same sentence the page
// shows — rather than paraphrasing our pricing or dispatch promise itself.
const FAQS = [
  { heading: "How is pricing calculated?", body: "By the square foot. Enter your wall's width and height and pick a material — the price updates instantly. Custom sizes and ready sizes are both available." },
  { heading: "Can I get any size?", body: "Yes. Every mural is sized to your wall — we print to your exact wall dimensions, so it fits edge to edge with a small trim margin." },
  { heading: "Which part of the design will I get?", body: "Whatever you frame in the visualiser. Drag to reposition and zoom to set the pattern scale — what you preview is exactly what we print." },
  { heading: "Will it match my wall with the TV / furniture?", body: "Use 'See it on your wall' — upload a photo or use your live camera, and the design maps onto your actual wall while staying off furniture in front of it." },
  { heading: "How long does delivery take?", body: "Prepared for your order. In India, Standard is free and delivered within 10 working days of order confirmation (dispatched within 5); Express is delivered within 4 working days (dispatched the next working day by a faster courier) for ₹1,000 per wallpaper plus ₹500 per order. Sundays are not counted. International delivery estimates vary by country and are confirmed with the order. Dispatch may take a little longer around major festivals or long weekends. Timelines are estimates, not guarantees." },
  { heading: "Do you ship outside India?", body: "Yes — we ship globally. Outside India, the website shows country-adjusted prices in US dollars with delivery included. Destination duties, local taxes and customs charges are excluded." },
  { heading: "Does Express mean faster shipping?", body: `Yes. ${EXPRESS_SHIPPING.speedNote}` },
  { heading: "Can I order a sample first?", body: "Yes, within India — order a design sample for ₹200 so you can feel the texture and check the colour in your own light before you commit. Samples are not yet shipped internationally." },
  { heading: "How do I install it?", body: "Each order comes with a fitting guide. See our installation & care guide for step-by-step instructions per material." },
  { heading: "What if I measure wrong?", body: "We print to the measurements you enter, so please measure using our How to Measure guide before ordering. Because each piece is made to your size, it can't be returned for a measurement error. If you are unsure of a figure, email hello@zyvorah.com before you order. See our Refund & Cancellation Policy for full terms." },
];

  function FaqPage() {
  return (
    <>
      <JsonLd data={faqJsonLd(FAQS, `${SITE_URL}/faq`)} />
      <InfoPage
        eyebrow="Help"
        title="Frequently asked questions"
        sections={FAQS}
        cta={{ label: "Still have a question? Contact us", href: "/contact" }}
      />
    </>
  );
}

export default withBrandEditorial("/faq", FaqPage);
