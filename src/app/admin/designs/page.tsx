
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { DesignUploader } from "./DesignUploader";

// Upload artwork and publish it as a catalogue design — the founder path that
// used to require a dev session. Gated by the staff Google sign-in.
export const dynamic = "force-dynamic";
export const metadata: Metadata = brandMetadata({
  title: "Add a design",
  robots: { index: false, follow: false },
  alternates: { canonical: "/admin/designs" },
});

export default function DesignsPage() {
  return <DesignUploader />;
}
