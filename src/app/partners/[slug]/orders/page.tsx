
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import {partnerCapabilities} from "@/lib/partner-capabilities";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, canAdministerAccount, canManageMembers, currentCorporateSession, partnerHome, slugMatchesSession } from "@/lib/corporate-auth";
import { fetchPrintRules } from "@/lib/print-rules";
import { billingFloorsBySlug, minBillableWidthMm, WALLPAPER_PRINT_TYPE, WALLPAPER_RULES } from "@/lib/print-types";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { WorkspaceAccess } from "@/components/partners/account-workspace";
import OrdersDashboard from "./dashboard";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams?: Promise<{ design?: string | string[] }> };

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Your orders · ${slug} print portal`, robots: { index: false, follow: false } };
}

export default async function CorporateOrdersPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const session = await currentCorporateSession();
  if (!session) {
    const design = (await searchParams)?.design;
    redirect(`/partners/${slug}${slug === "vijay-sales" && typeof design === "string" ? `?design=${encodeURIComponent(design)}` : ""}`);
  }
  // Signed in as a different tenant: send them to their own portal rather than
  // rendering their data under this partner's branding.
  if (!slugMatchesSession(session, slug)) {
    // A Vijay Sales bookmark must never silently open whichever account was used last.
    if (slug === "vijay-sales") {
      const design = (await searchParams)?.design;
      redirect(`/partners/${slug}${typeof design === "string" ? `?design=${encodeURIComponent(design)}` : ""}`);
    }
    redirect(`${partnerHome(session.account)}/orders`);
  }
  // Agreement gate (0095): an account that owes an acceptance goes nowhere in
  // the portal until the entity has signed. Always false for unflagged accounts.
  if (session.agreementPending) redirect(`${partnerHome(session.account)}/agreement`);
  if (partnerCapabilities(session.account).poRequiredRelease && !session.staff) redirect(`${partnerHome(session.account)}/projects`);

  let workspace: WorkspaceAccess | undefined;
  if (session.account.slug === "vijay-sales") {
    const a = session.account;
    const canCreate = can(session, "build") || can(session, "order");
    workspace = { canCreate, canManage: canManageMembers(session), isAdmin: canAdministerAccount(session), emailDomain: a.email_domain, form: null };
    if (canCreate) {
      const sb = supabaseAdmin();
      const [rules, floors] = await Promise.all([fetchPrintRules(), sb ? billingFloorsBySlug(sb) : Promise.resolve({ [WALLPAPER_PRINT_TYPE]: minBillableWidthMm(WALLPAPER_RULES) })]);
      workspace.form = {
        slug: a.slug, accountName: a.name, logoPath: a.logo_path,
        ratePerSqft: Number(a.rate_per_sqft), gstPct: Number(a.gst_pct), pricingMode: a.pricing_mode,
        discountPct: Number(a.discount_pct), staffEmail: session.staff ? session.email : null,
        canOrder: can(session, "order"), shipStates: a.ship_states ?? null,
        printRules: { maxPanelCm: rules.maxPanelCm, overlapCm: rules.overlapCm }, billingFloors: floors,
      };
    }
  }
  return (
    <OrdersDashboard
      workspace={workspace}
      slug={session.account.slug}
      accountName={session.account.name}
      logoPath={session.account.logo_path}
      email={session.email}
      installName={session.account.install_contact_name}
      installPhone={session.account.install_contact_phone}
    />
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
