
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { DecisionBoard } from "./DecisionBoard";

// The decision command board: every decision the intelligence layer has ever
// proposed, what happened to it, and whether it moved the numbers. Gated by
// the staff Google sign-in — never indexed.
export const dynamic = "force-dynamic";
export const metadata: Metadata = brandMetadata({
  title: "Decision Board",
  robots: { index: false, follow: false },
  alternates: { canonical: "/decide" },
});

export default function DecidePage() {
  return <DecisionBoard />;
}
