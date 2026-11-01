
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Image from "@/components/SiteImage";
import { redirect } from "next/navigation";
import {
  currentCorporateSession, isAccountAdmin, nameFromEmail, partnerHome, slugMatchesSession,
} from "@/lib/corporate-auth";
import { ResellerAgreementText } from "@/lib/reseller-agreement";
import AgreementAcceptForm from "./accept-form";

// The agreement gate (migration 0095). A session whose account owes an
// acceptance is routed here from every portal page and can go nowhere else in
// the portal until the entity has signed; an account that owes nothing never
// sees this URL — it bounces straight to orders.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Reseller agreement · ${slug} print portal`, robots: { index: false, follow: false } };
}

export default async function PartnerAgreementPage({ params }: Props) {
  const { slug } = await params;
  const session = await currentCorporateSession();
  if (!session) redirect(`/partners/${slug}`);
  if (!slugMatchesSession(session, slug)) redirect(`${partnerHome(session.account)}/agreement`);
  if (!session.agreementPending) redirect(`${partnerHome(session.account)}/orders`);

  const a = session.account;
  const canAccept = isAccountAdmin(session);

  return (
    <div className="container-x flex justify-center py-12">
      <div className="w-full max-w-[720px]">
        <div className="flex items-center gap-3">
          {a.logo_path && (
            <Image src={a.logo_path} alt={a.name} width={44} height={44}
              className="rounded-[10px]" priority />
          )}
          <div>
            <p className="font-display text-lg font-extrabold leading-tight">{a.name}</p>
            <p className="text-xs text-slate">Wallpaper print portal</p>
          </div>
        </div>

        <div className="mt-6 rounded-[16px] border border-edge bg-wash px-5 py-4 text-sm text-slate">
          One step before your portal opens: please review the reseller agreement below.{" "}
          {canAccept
            ? "Accepting it unlocks ordering for everyone on your account."
            : "Only your account admin can accept it — ask them to sign in and do so; until then the portal stays read-only for everyone on the account."}
        </div>

        <div className="mt-6 rounded-[22px] border border-edge bg-surface p-8 shadow-sm">
          <ResellerAgreementText
            commercials={{
              pricingMode: a.pricing_mode,
              discountPct: Number(a.discount_pct),
              ratePerSqft: Number(a.rate_per_sqft),
              minOrderInr: a.min_order_value_inr == null ? null : Number(a.min_order_value_inr),
            }}
          />

          <AgreementAcceptForm
            slug={a.slug}
            canAccept={canAccept}
            defaultSignatory={nameFromEmail(session.email)}
            defaultBusiness={a.legal_name || a.name}
            signatoryEmail={session.email}
          />
        </div>

        <p className="mt-4 text-center text-xs text-mist">
          Zyvorah · made-to-order wallpaper for {a.name}
        </p>
      </div>
    </div>
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
