
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import PrismDeskView from "./desk";

export const metadata: Metadata = brandMetadata({ title: "Prism · Zyvorah", robots: { index: false, follow: false } });

export default async function PrismDeskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PrismDeskView blueprintId={id} />;
}
