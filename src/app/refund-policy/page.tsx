
import { withBrandEditorial, editorialMetadata } from "@/brand/editorial-page";
import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

export const metadata: Metadata = editorialMetadata("/refund-policy");

  function RefundPolicyPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title="Refund & cancellation policy"
      intro="Every mural is made to order for your exact wall, so please read this before purchasing."
      sections={[
        {
          heading: "Cancellations",
          body: "Changed your mind? Email hello@zyvorah.com with your order number within 12 hours and we'll cancel it for a full refund, as long as production hasn't started. Once production starts, the order can't be cancelled.",
        },
        {
          heading: "Made-to-order returns",
          body: "As each piece is made to your selected dimensions and cannot be resold, we cannot accept returns or refunds for a change of mind. Please measure with our How to Measure guide, and use the visualiser or order a design sample to be sure before buying.",
        },
        {
          heading: "Your measurements, our print",
          body: "You are responsible for providing accurate wall measurements; we print to the dimensions you enter. Zyvorah is responsible for faithfully reproducing the design and framing you approve, at the size ordered, and for the print quality of what we ship.",
        },
        {
          heading: "Colour variation",
          body: "Screens differ, so slight colour variation between your screen and the finished artwork is normal and is not considered a defect. Order a design sample first if exact colour matters to you.",
        },
        {
          heading: "Damaged in transit",
          body: "If your order arrives damaged, email hello@zyvorah.com within 48 hours of delivery with your order number and clear photos of the item and its packaging. We will replace the affected panels, or reprint the order, at no cost.",
        },
        {
          heading: "Manufacturing defects",
          body: "If your order has a print fault or manufacturing defect, report it within 7 days of delivery with photos. We will reprint or replace the affected item at no cost.",
        },
        {
          heading: "Panel replacement",
          body: "Murals ship as several panels. Where only specific panels are affected, we replace those panels rather than the whole order.",
        },
        {
          heading: "Installation damage",
          body: "Damage that occurs during installation — whether self-installed or fitted by a third party — is not covered. Professional installation is available in Bengaluru, Mumbai and Pune if you'd prefer us to fit it.",
        },
        {
          heading: "Our remedy",
          body: "For a valid claim, our remedy is, at our discretion, a reprint or replacement. Where a reprint is not possible, we offer a store credit or a refund.",
        },
        {
          heading: "Refund method & timing",
          body: "Approved refunds are issued to your original payment method via Razorpay within 7 working days of approval.",
        },
        {
          heading: "Contact & escalation",
          body: "Email hello@zyvorah.com with your order number and photos, and we'll respond within one working day. If your issue isn't resolved within 3 working days, reply to ask for it to be escalated to our team lead.",
        },
      ]}
      cta={{ label: "Order a sample first", href: "/samples" }}
    />
  );
}

export default withBrandEditorial("/refund-policy", RefundPolicyPage);
