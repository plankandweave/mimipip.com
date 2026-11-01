
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { MatchPhoto } from "@/components/MatchPhoto";

export const metadata: Metadata = brandMetadata({
  title: "Match a Photo — Zyvorah",
  alternates: { canonical: "/match-a-photo" },
});

export default function MatchAPhotoPage() {
  return <MatchPhoto />;
}
