
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import { partnerCapabilities } from "@/lib/partner-capabilities";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  canManageMembers,
  currentCorporateSession,
  partnerHome,
  slugMatchesSession,
} from "@/lib/corporate-auth";
import TeamManager from "./team";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Team · ${slug} print portal`,
    robots: { index: false, follow: false },
  };
}

export default async function PartnerTeamPage({ params }: Props) {
  const { slug } = await params;
  if (slug === "vijay-sales") redirect(`/partners/vijay-sales/orders#team`);
  const session = await currentCorporateSession();
  if (!session) redirect(`/partners/${slug}`);
  if (!slugMatchesSession(session, slug))
    redirect(`${partnerHome(session.account)}/team`);
  // Agreement gate (0095): nothing in the portal before the entity has signed.
  if (session.agreementPending)
    redirect(`${partnerHome(session.account)}/agreement`);


  return (
    <TeamManager
      slug={session.account.slug}
      accountName={session.account.name}
      emailDomain={session.account.email_domain}
      email={session.email}
      tourIdentity={
        !session.staff && session.member?.active
          ? {
              memberKey: session.member.id,
              canBuild: Boolean(session.member.can_build),
              canPurchase: Boolean(session.member.can_order),
              isAdmin: session.member.role === "admin",
            }
          : undefined
      }
      privateWorkflow={partnerCapabilities(session.account).poRequiredRelease}
      canManage={
        canManageMembers(session) &&
        !(
          session.staff &&
          partnerCapabilities(session.account).poRequiredRelease
        )
      }
    />
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
