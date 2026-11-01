
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import { ShikhaCall } from "@/components/ShikhaCall";
import type { Metadata } from "next";
export const metadata: Metadata = brandMetadata({ title: "Call Zyvorah", robots: { index: false, follow: false } });
export default function CallPage() {
  return <div className="px-5 py-16"><ShikhaCall /></div>;
}
