
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import { redirect } from "next/navigation";
import {
  currentCorporateSession,
  partnerHome,
  slugMatchesSession,
} from "@/lib/corporate-auth";
import { partnerCapabilities } from "@/lib/partner-capabilities";
import { tier1OnlyPartner } from "@/lib/tier1-cities";
import Workspace from "./workspace";
export const dynamic = "force-dynamic";
export const metadata = brandMetadata({
  title: "Customer projects · partner portal",
  robots: { index: false, follow: false },
});
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = await currentCorporateSession();
  if (!s) redirect(`/partners/${slug}`);
  if (!slugMatchesSession(s, slug)) redirect(`/partners/${slug}`);
  if (s.staff) redirect(`${partnerHome(s.account)}/orders`);
  if (s.agreementPending) redirect(`${partnerHome(s.account)}/agreement`);
  if (!partnerCapabilities(s.account).customerProjects)
    redirect(`${partnerHome(s.account)}/orders`);
  // No city chosen on this sign-in yet: the portal's front page asks for it
  // before any work, because orders can only be delivered there.
  if (tier1OnlyPartner(s.account.slug) && !s.city)
    redirect(partnerHome(s.account));
  return (
    <Workspace
      slug={s.account.slug}
      name={s.account.name}
      email={s.email}
      city={s.city}
      tourIdentity={
        s.member?.active
          ? {
              memberKey: s.member.id,
              canBuild: Boolean(s.member.can_build),
              canPurchase: Boolean(s.member.can_order),
              isAdmin: s.member.role === "admin",
            }
          : undefined
      }
    />
  );
}
