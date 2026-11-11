import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";

const title = "Mimi Pip Gift Cards — A Little Joy, Just for You";
const description = "Preview a Mimi Pip gift card in three playful designs. Choose an occasion, personalise the names and message, and create a printable preview in Indian rupees.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/gift-card" },
  openGraph: { type: "website", title, description, url: `${SITE_URL}/gift-card`, siteName: "Mimi Pip" },
  twitter: { card: "summary_large_image", title, description },
};

export default function GiftCardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
