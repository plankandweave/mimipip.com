
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  canAdministerAccount, currentCorporateSession, partnerHome, slugMatchesSession,
} from "@/lib/corporate-auth";
import SiteBatchList from "./list";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Surveys · ${slug} print portal`, robots: { index: false, follow: false } };
}

// The destination of the "ready to release" email a submitted survey sends.
// It existed as a URL in that email before it existed as a page.
export default async function SiteBatchesPage({ params }: Props) {
  const { slug } = await params;
  const session = await currentCorporateSession();
  if (!session) redirect(`/partners/${slug}`);
  if (!slugMatchesSession(session, slug)) redirect(`${partnerHome(session.account)}/site-batches`);
  if (session.agreementPending) redirect(`${partnerHome(session.account)}/agreement`);

  return <SiteBatchList slug={session.account.slug} isAdmin={canAdministerAccount(session)} />;
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
