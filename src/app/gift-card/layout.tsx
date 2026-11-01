import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";

const title = "Zyvorah Gift Card — Give the Gift of a Beautiful Wall";
const description = "Buy a Zyvorah gift card, redeemable at checkout across every mural wallpaper design. Choose any amount from ₹500 to ₹50,000. Issued in rupees and redeemable on delivery within India.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/gift-card" },
  openGraph: { type: "website", title, description, url: `${SITE_URL}/gift-card`, siteName: "Zyvorah" },
  twitter: { card: "summary_large_image", title, description },
};

export default function GiftCardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
