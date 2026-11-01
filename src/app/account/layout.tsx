import type { Metadata } from "next";

// Never held at the Cloudflare edge: private, per-person pages. The root
// layout's hour of ISR is for the public catalogue only.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
