
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentCorporateSession, partnerHome, slugMatchesSession } from "@/lib/corporate-auth";
import InstallSheet from "./sheet";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; id: string }> };

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Installation sheet · ${slug} print portal`, robots: { index: false, follow: false } };
}

export default async function InstallSheetPage({ params }: Props) {
  const { slug, id } = await params;
  const session = await currentCorporateSession();
  if (!session) redirect(`/partners/${slug}`);
  if (!slugMatchesSession(session, slug)) redirect(partnerHome(session.account));
  // No agreement gate: this is a read, and an installer waiting on site is not
  // the person to block over a countersignature.
  return <InstallSheet batchId={id} slug={slug} />;
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
