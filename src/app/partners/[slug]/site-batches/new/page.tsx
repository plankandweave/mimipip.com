
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  canAdministerAccount, currentCorporateSession, partnerHome, slugMatchesSession,
} from "@/lib/corporate-auth";
import NewSiteBatchForm from "./form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = brandMetadata({ title: "New measured order", robots: { index: false, follow: false } });

export default async function NewSiteBatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await currentCorporateSession();
  if (!session) redirect(`/partners/${slug}`);
  if (!slugMatchesSession(session, slug)) redirect(`${partnerHome(session.account)}/site-batches/new`);
  if (session.agreementPending) redirect(`${partnerHome(session.account)}/agreement`);
  if (!canAdministerAccount(session)) redirect(`${partnerHome(session.account)}/site-batches`);
  return <NewSiteBatchForm slug={session.account.slug} accountName={session.account.name} />;
}
