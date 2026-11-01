
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import {partnerCapabilities} from "@/lib/partner-capabilities";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, currentCorporateSession, isStaffSession, partnerHome, slugMatchesSession } from "@/lib/corporate-auth";
import { fetchPrintRules } from "@/lib/print-rules";
import { billingFloorsBySlug, minBillableWidthMm, WALLPAPER_PRINT_TYPE, WALLPAPER_RULES } from "@/lib/print-types";
import { supabaseAdmin } from "@/lib/supabase-admin";
import NewOrderForm from "./form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams?: Promise<{ design?: string | string[]; repeat?: string | string[] }> };

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `New print order · ${slug}`, robots: { index: false, follow: false } };
}

export default async function NewCorporateOrderPage({ params, searchParams }: Props) {
  const { slug } = await params;
  if (slug === "vijay-sales") {
    const sp = await searchParams;
    const q = (["design", "repeat"] as const)
      .filter((k) => typeof sp?.[k] === "string")
      .map((k) => `${k}=${encodeURIComponent(sp![k] as string)}`).join("&");
    redirect(`/partners/vijay-sales/orders${q ? `?${q}` : ""}#new`);
  }
  const session = await currentCorporateSession();
  if (!session) redirect(`/partners/${slug}`);
  if (!slugMatchesSession(session, slug)) redirect(`${partnerHome(session.account)}/new`);
  // Agreement gate (0095): nothing in the portal before the entity has signed.
  if (session.agreementPending) redirect(`${partnerHome(session.account)}/agreement`);
  if (partnerCapabilities(session.account).poRequiredRelease && !session.staff) redirect(`${partnerHome(session.account)}/projects`);
  // Someone with neither permission has no business on this page at all; send
  // them to the library, which they can always read.
  if (!can(session, "build") && !can(session, "order")) {
    redirect(`${partnerHome(session.account)}/library`);
  }

  const a = session.account;
  // Live panel geometry from the OS, exactly as the retail product page does it:
  // the opening plan a partner is shown must fall on the seams the machine will
  // actually cut, and a rule change must not need a website deploy to reach them.
  const printRules = await fetchPrintRules();
  // Billing floor per print type (migration 0106) so the on-screen quote can
  // mirror what the server will actually bill — a one-lane piece pays for the
  // web it consumes, minimum media width − trim.
  const sb = supabaseAdmin();
  const billingFloors = sb
    ? await billingFloorsBySlug(sb)
    : { [WALLPAPER_PRINT_TYPE]: minBillableWidthMm(WALLPAPER_RULES) };
  return (
    <NewOrderForm
      slug={a.slug}
      accountName={a.name}
      logoPath={a.logo_path}
      ratePerSqft={Number(a.rate_per_sqft)}
      gstPct={Number(a.gst_pct)}
      pricingMode={a.pricing_mode}
      discountPct={Number(a.discount_pct)}
      staffEmail={isStaffSession(session) ? session.email : null}
      canOrder={can(session, "order")}
      shipStates={a.ship_states ?? null}
      printRules={{ maxPanelCm: printRules.maxPanelCm, overlapCm: printRules.overlapCm }}
      billingFloors={billingFloors}
    />
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
