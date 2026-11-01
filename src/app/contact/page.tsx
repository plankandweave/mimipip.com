import { brand } from "@/brand/current";

import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { sellerGstConfig } from "@/lib/gst";
import { SITE_URL } from "@/lib/seo";
import { ContactForm } from "@/components/ContactForm";

const title = `Contact ${brand.name}`;
const description = `Contact and support information for ${brand.name}`;

export const metadata: Metadata = brandMetadata({
  title,
  description,
  alternates: { canonical: "/contact" },
  openGraph: { type: "website", title, description, url: `${SITE_URL}/contact`, siteName: "Zyvorah" },
  twitter: { card: "summary_large_image", title, description },
});

/**
 * `?about=` seeds the message box. A design page's "Use this in your
 * project" sends the design's name through it, so a developer lands on a
 * form that already knows what they clicked. Trimmed and length-capped:
 * the value lands in a textarea the visitor can edit, never in an email
 * header or a query we run, and a hostile link should not be able to paste
 * an essay into it.
 */
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ about?: string; question?: string }>;
}) {
  const { about, question } = await searchParams;
  const seller = sellerGstConfig();
  const initialMessage = question
    ? `I have a question about ${String(question).slice(0, 180).trim()}. `
    : about
    ? `I'd like to use ${String(about).slice(0, 120).trim()} in a project. `
    : "";

  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-lg">
        <span className="caps text-slate">Contact</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,2.8rem)] leading-tight">Get in touch</h1>
        <p className="mt-4 text-slate">
          {brand.contactEmail ? <>For questions, email <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>.</> : "Our support details will be published before the store opens."}
        </p>

        <ContactForm initialMessage={initialMessage} />

        {/* company details + grievance redressal — required for a company
            selling custom, non-returnable goods online in India */}
        <div className="mt-12 space-y-6 border-t border-edge pt-8 text-sm text-slate">
          {seller && (
            <div>
              <p className="caps mb-2 text-mist">Company details</p>
              <p className="font-semibold text-charcoal">{seller.legalName}</p>
              {seller.address.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
              <p className="mt-1">GSTIN: {seller.gstin}</p>
            </div>
          )}
          <div>
            <p className="caps mb-2 text-mist">Support &amp; grievance redressal</p>
            <p>
              Support hours and the escalation process will be published before orders open.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
