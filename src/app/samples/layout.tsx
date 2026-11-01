import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";

const title = "Order a Wallpaper Sample — ₹200";
const description = "See and feel eligible Zyvorah designs before you commit. Order an A4 design sample for ₹200, delivered across India.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/samples" },
  openGraph: { type: "website", title, description, url: `${SITE_URL}/samples`, siteName: "Zyvorah" },
  twitter: { card: "summary_large_image", title, description },
};

export default function SamplesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
