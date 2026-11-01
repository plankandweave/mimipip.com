
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { sellerGstConfig } from "@/lib/gst";

export const metadata: Metadata = editorialMetadata("/terms");

  function TermsPage() {
  const seller = sellerGstConfig();
  const whoWeAre = seller
    ? `Zyvorah is operated by ${seller.legalName}, ${seller.address.replace(/\n/g, ", ")}, India. GSTIN: ${seller.gstin}. Contact: hello@zyvorah.com.`
    : "Zyvorah is an Indian brand of original mural wallpaper designs. For our full registered business details, email hello@zyvorah.com.";

  return (
    <InfoPage
      eyebrow="Legal"
      title="Terms & conditions"
      intro="These terms govern your use of zyvorah.com and any purchase you make. By placing an order you agree to them."
      sections={[
        { heading: "Who we are", body: whoWeAre },
        { heading: "Products & made-to-order", body: "Our wallpapers and murals are prepared for your order at the dimensions and on the material you select. Colours may vary slightly between screens and print; we recommend ordering a sample. Because each item is custom-produced for your wall, it is made specifically for you." },
        { heading: "Pricing & payment", body: "Prices are shown in Indian Rupees (₹) for delivery within India, and in US Dollars (US$) for every other destination, adjusted for that country; the currency follows the delivery country and is not chosen separately. Prices are calculated per square foot based on your wall dimensions and chosen material. A price shown outside India includes international delivery but excludes destination duties, customs and local taxes, which are payable by you. Payment is processed securely via Razorpay. Orders are confirmed once payment is received." },
        { heading: "Orders", body: "We reserve the right to decline or cancel an order (with full refund) in cases of pricing errors, product unavailability, or suspected fraud. An order confirmation does not guarantee acceptance until payment clears." },
        { heading: "Shipping & delivery", body: "See our Shipping Policy. Delivery timelines are estimates and not guaranteed dates." },
        { heading: "Cancellations & refunds", body: "See our Refund & Cancellation Policy." },
        { heading: "Intellectual property", body: "All designs, images and content on this site are the property of Zyvorah and may not be reproduced without permission." },
        {
          heading: "YouTube",
          body: (
            <>
              Our videos are published on YouTube using YouTube API Services. By watching or interacting with them you agree
              to be bound by the <a className="underline" href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>,
              and your data on YouTube is handled under the{" "}
              <a className="underline" href="https://policies.google.com/privacy">Google Privacy Policy</a>. See our Privacy
              Policy for what we store about our own videos.
            </>
          ),
        },
        { heading: "Limitation of liability", body: "To the extent permitted by law, Zyvorah is not liable for indirect or consequential losses. Our total liability for any order is limited to the amount paid for that order." },
        { heading: "Governing law", body: "These terms are governed by the laws of India, and any disputes are subject to the exclusive jurisdiction of the competent courts in India." },
      ]}
      cta={{ label: "Contact us", href: "/contact" }}
    />
  );
}

export default withBrandEditorial("/terms", TermsPage);
