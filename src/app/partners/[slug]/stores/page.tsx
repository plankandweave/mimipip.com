
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  canAdministerAccount, currentCorporateSession, partnerHome, slugMatchesSession,
} from "@/lib/corporate-auth";
import StoresManager from "./stores";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Stores · ${slug} print portal`, robots: { index: false, follow: false } };
}

export default async function PartnerStoresPage({ params }: Props) {
  const { slug } = await params;
  if (slug === "vijay-sales") redirect(`/partners/vijay-sales/orders#stores`);
  const session = await currentCorporateSession();
  if (!session) redirect(`/partners/${slug}`);
  if (!slugMatchesSession(session, slug)) redirect(`${partnerHome(session.account)}/stores`);
  if (session.agreementPending) redirect(`${partnerHome(session.account)}/agreement`);


  return (
    <StoresManager
      slug={session.account.slug}
      accountName={session.account.name}
      isAdmin={canAdministerAccount(session)}
    />
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
