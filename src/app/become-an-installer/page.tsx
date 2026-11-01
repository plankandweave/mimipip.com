
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { InstallerApply } from "@/components/installer/InstallerApply";

export const metadata: Metadata = brandMetadata({
  title: "Register as Installer — इंस्टॉलर रजिस्ट्रेशन",
  description:
    "Join Zyvorah's installer network. Transparent per-square-foot payouts released after the customer confirms the job, and applications open to wallpaper installers from any city in India.",
  alternates: { canonical: "/become-an-installer" },
});

export default function BecomeAnInstallerPage() {
  return <InstallerApply />;
}
