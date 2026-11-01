
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";

// AID = Architects & Interior Designers (Roheena, 2026-09-02). This program is
// for professionals specifying walls for their clients — commission on orders
// through their login. Offline SHOWROOMS that resell across a counter are a
// different animal: they get a corporate_accounts row and the partner portal
// (/partners/<slug>), not this program.
export const metadata: Metadata = brandMetadata({
  title: "AID Partners",
  description:
    "Zyvorah's AID Partners program for architects and interior designers — mural wallpaper designs at any scale, project boards, partner pricing and priority samples.",
  alternates: { canonical: "/trade" },
});

export default function TradePage() {
  return (
    <InfoPage
      eyebrow="For architects & interior designers"
      title="AID Partners"
      intro="For architects, interior designers and commercial projects — Zyvorah is built to make specifying custom murals effortless."
      sections={[
        { heading: "Sized to your wall, at any scale", body: "From a single feature wall to a hotel lobby, we make to spec on your choice of material, with consistent colour across large runs." },
        { heading: "Boards for every project", body: "Create a board per client or room, drop in wall previews, and share the look — keep every project organised in one place." },
        { heading: "Partner pricing & samples", body: "AID Partner accounts earn commission on every order placed through your login. Onboarding is instant — PAN, GST and your bank account are verified automatically, no waiting on a human review." },
        { heading: "Run a showroom instead?", body: "Retail showrooms and dealers get their own ordering portal with partner pricing. Email hello@zyvorah.com with 'Showroom' in the subject and we'll set your account up." },
        { heading: "Questions first?", body: "Email hello@zyvorah.com with 'AID' in the subject, or use the contact form, and we'll walk you through it." },
      ]}
      cta={{ label: "Apply as an AID Partner", href: "/account/trade/apply" }}
    />
  );
}
