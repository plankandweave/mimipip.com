
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentCorporateSession, partnerHome, slugMatchesSession } from "@/lib/corporate-auth";
import SiteBatchReview from "./review";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; id: string }> };

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Store approval · ${slug} print portal`, robots: { index: false, follow: false } };
}

export default async function SiteBatchPage({ params }: Props) {
  const { slug, id } = await params;
  const session = await currentCorporateSession();
  // Straight back here after the code: this page is what the proposal email
  // links to, and landing on the orders board instead hid the thing to approve.
  if (!session) redirect(`/partners/${slug}?next=${encodeURIComponent(`site-batches/${id}`)}`);
  if (!slugMatchesSession(session, slug)) redirect(partnerHome(session.account));
  if (session.agreementPending) redirect(`${partnerHome(session.account)}/agreement`);
  return <SiteBatchReview batchId={id} slug={slug} accountName={session.account.name}
    isAdmin={session.member?.role === "admin" || !session.member} />;
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
