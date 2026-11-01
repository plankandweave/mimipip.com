
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  canManageMembers, currentCorporateSession, partnerHome, slugMatchesSession,
} from "@/lib/corporate-auth";
import AccountSettings from "./settings";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Account · ${slug} print portal`, robots: { index: false, follow: false } };
}

export default async function PartnerAccountPage({ params }: Props) {
  const { slug } = await params;
  if (slug === "vijay-sales") redirect(`/partners/vijay-sales/orders#settings`);
  const session = await currentCorporateSession();
  if (!session) redirect(`/partners/${slug}`);
  if (!slugMatchesSession(session, slug)) redirect(`${partnerHome(session.account)}/settings`);
  if (session.agreementPending) redirect(`${partnerHome(session.account)}/agreement`);

  // isOwner only decides what this page RENDERS. The commercial terms are
  // withheld by the API, which never puts them in a non-owner's payload — so a
  // crafted request gets the same answer as the screen does.

  return (
    <AccountSettings
      slug={session.account.slug}
      accountName={session.account.name}
      isOwner={canManageMembers(session)}
    />
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
