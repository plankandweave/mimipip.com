
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = editorialMetadata("/shipping-returns");

  function ShippingReturnsPage() {
  return (
    <InfoPage
      eyebrow="Help"
      title="Shipping & returns"
      sections={[
        {
          heading: "Shipping itself is always free across India",
          body: "Every order — standard or Express — ships free, anywhere in India. Express is a paid upgrade: we print it first and send it by a faster courier — see below.",
        },
        {
          heading: "We ship globally",
          body: "Outside India, the website shows country-adjusted prices in US dollars with international delivery included. Destination-country duties, local taxes and customs charges are not included and remain the recipient's responsibility.",
        },
        {
          heading: "Made to order",
          body: `Because each mural is sized to your wall size, we begin production as soon as your order is confirmed. Counting from the moment your order is confirmed, Standard orders dispatch within 5 working days and are delivered within 10 working days, free. Express orders, for ₹1,000 per wallpaper plus ₹500 per order, dispatch the next working day by a faster courier and are delivered within 4 working days. Working days exclude Sundays. Tracking is sent to your email once your order ships. Dispatch may take a little longer around major festivals (e.g. Diwali) or long weekends. Timelines are estimates, not guarantees.`,
        },
        {
          heading: "Returns on items sized to your wall",
          body: "As each piece is sized to your wall, mural wallpaper designs can't be returned for a change of mind. Report transit damage within 48 hours of delivery, or a print fault within 7 days, with clear photos at hello@zyvorah.com and we'll replace or reprint it. See our Refund & Cancellation Policy for full details.",
        },
        {
          heading: "Samples",
          body: "Within India, order a design sample (₹200) first so you can check colour and texture before committing. Samples are not yet shipped internationally.",
        },
      ]}
      cta={{ label: "Order a sample", href: "/samples" }}
    />
  );
}

export default withBrandEditorial("/shipping-returns", ShippingReturnsPage);
