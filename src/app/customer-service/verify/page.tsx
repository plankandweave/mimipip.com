
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import { ShikhaVerify } from "@/components/ShikhaVerify";
export const metadata = brandMetadata({ title: "Verify your order email", robots: { index: false, follow: false }, referrer: "no-referrer" as const });
export default function VerifyPage() { return <ShikhaVerify />; }
