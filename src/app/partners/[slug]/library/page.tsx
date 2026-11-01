
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import {partnerCapabilities} from "@/lib/partner-capabilities";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentCorporateSession, partnerHome, slugMatchesSession } from "@/lib/corporate-auth";
import DesignLibrary from "./library";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Design library · ${slug} print portal`, robots: { index: false, follow: false } };
}

export default async function CorporateLibraryPage({ params }: Props) {
  const { slug } = await params;
  const session = await currentCorporateSession();
  if (!session) redirect(`/partners/${slug}`);
  if (!slugMatchesSession(session, slug)) redirect(`${partnerHome(session.account)}/library`);
  // Agreement gate (0095): nothing in the portal before the entity has signed.
  if (session.agreementPending) redirect(`${partnerHome(session.account)}/agreement`);
  if (partnerCapabilities(session.account).poRequiredRelease && !session.staff) redirect(`${partnerHome(session.account)}/projects`);

  return (
    <DesignLibrary
      slug={session.account.slug}
      accountName={session.account.name}
      logoPath={session.account.logo_path}
      email={session.email}
    />
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
