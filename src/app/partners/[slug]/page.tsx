
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import {partnerCapabilities} from "@/lib/partner-capabilities";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  can, canAdministerAccount, isVaultUploadOnly, currentCorporateSession, partnerHome, isStaffSession,
  type CorporateAccount,
} from "@/lib/corporate-auth";
import { areaLabel, type AreaRow, type BuildingRow, type Progress } from "@/lib/portfolio";
import { partnerReturnPath } from "@/lib/partner-return";
import { tier1OnlyPartner } from "@/lib/tier1-cities";
import CityPicker from "./city-picker";
import CorporateLogin from "./login-form";
import PortfolioDashboard from "./portfolio-dashboard";
import WrongAccount from "./wrong-account";

// The corporate portal is one codebase serving every partner. The tenant comes
// from the URL for branding, but authorisation always comes from the email
// domain — see accountForEmail() in lib/corporate-auth.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ next?: string | string[]; city?: string | string[] }>;
};

/** Public tenant facts needed to render the sign-in page (name, logo, domain).
 *  Deliberately not the whole row — no rates or policy before sign-in. */
export async function accountBySlug(slug: string): Promise<CorporateAccount | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("corporate_accounts")
    .select("*").eq("slug", slug).eq("active", true).maybeSingle();
  return (data as CorporateAccount | null) ?? null;
}

/** A portfolio account's whole tree: its buildings and the spaces inside them.
 *
 *  Both lists in one pass, scoped to the account by id — a portfolio is tens of
 *  rows, and the dashboard needs them together to draw anything at all. */
async function loadPortfolio(accountId: string): Promise<{
  buildings: BuildingRow[]; areas: AreaRow[]; progress: Progress;
}> {
  const empty: Progress = {
    buildings: 0, areas: 0, walls: 0, wallsWithPhoto: 0,
    designs: 0, studies: 0, approvedStudies: 0,
    firstBuildingName: null, firstAreaLabel: null, firstAreaId: null,
  };
  const sb = supabaseAdmin();
  if (!sb) return { buildings: [], areas: [], progress: empty };

  const [{ data: buildingRows }, { data: areaRows }] = await Promise.all([
    sb.from("corporate_stores")
      .select("*").eq("account_id", accountId).eq("active", true)
      .order("state").order("name"),
    sb.from("corporate_site_areas")
      .select("*").eq("account_id", accountId).eq("active", true)
      .order("sort").order("floor").order("name"),
  ]);
  const buildings = (buildingRows ?? []) as BuildingRow[];
  const areas = (areaRows ?? []) as AreaRow[];

  // Counts for the "what now?" prompt. Cheap head-counts, and the wall ones are
  // scoped through this account's own open surveys so another tenant's walls
  // can never be counted into somebody's progress.
  const areaIds = areas.map((a) => a.id);
  const { data: batchRows } = areaIds.length
    ? await sb.from("corporate_site_batches")
        .select("id").in("area_id", areaIds).eq("status", "collecting")
    : { data: [] as { id: string }[] };
  const batchIds = (batchRows ?? []).map((b) => b.id as string);

  const [walls, wallsWithPhoto, designs, studies, approvedStudies] = await Promise.all([
    batchIds.length
      ? sb.from("corporate_site_batch_walls").select("id", { count: "exact", head: true })
          .in("batch_id", batchIds).then((r) => r.count ?? 0)
      : Promise.resolve(0),
    batchIds.length
      ? sb.from("corporate_site_batch_walls").select("id", { count: "exact", head: true })
          .in("batch_id", batchIds).not("photo_path", "is", null).then((r) => r.count ?? 0)
      : Promise.resolve(0),
    sb.from("corporate_designs").select("id", { count: "exact", head: true })
      .eq("account_id", accountId).neq("status", "archived").then((r) => r.count ?? 0),
    sb.from("corporate_wall_studies").select("id", { count: "exact", head: true })
      .eq("account_id", accountId).then((r) => r.count ?? 0),
    sb.from("corporate_wall_studies").select("id", { count: "exact", head: true })
      .eq("account_id", accountId).eq("status", "approved").then((r) => r.count ?? 0),
  ]);

  const firstArea = areas[0] ?? null;
  return {
    buildings,
    areas,
    progress: {
      buildings: buildings.length,
      areas: areas.length,
      walls, wallsWithPhoto, designs, studies, approvedStudies,
      firstBuildingName: buildings[0]?.name ?? null,
      firstAreaLabel: firstArea ? areaLabel(firstArea) : null,
      firstAreaId: firstArea?.id ?? null,
    },
  };
}

/** Does anybody on this account actually sign in by phone?
 *
 *  Decides which door the sign-in card leads with. Cheap, and read before the
 *  session exists — so it must reveal nothing: it returns a boolean about the
 *  account, never a number, and both answers render a usable card. */
async function accountHasPhoneMember(accountId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return false;
  const { count } = await sb.from("corporate_members")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId).eq("active", true)
    .not("phone", "is", null);
  return (count ?? 0) > 0;
}

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const account = await accountBySlug(slug);
  return {
    title: account ? `${account.name} · Zyvorah print portal` : "Zyvorah print portal",
    robots: { index: false, follow: false },
  };
}

export default async function PartnerLoginPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const account = await accountBySlug(slug);
  if (!account) notFound();
  // Only a named local destination is accepted; never redirect to an arbitrary URL.
  const query = await searchParams;
  const returnTo = partnerReturnPath(query?.next);
  const returnToDocuments = returnTo === "documents";

  // Already signed in on THIS account. A portfolio account STAYS here — this
  // page is its dashboard, and the whole point of it is that there is nowhere
  // else to go. A reseller account keeps the old behaviour and lands on its
  // orders, which is what the link was for.
  const session = await currentCorporateSession({ allowVaultUploadOnly: true });
  if (session && session.account.slug === account.slug) {
    if (isVaultUploadOnly(session)) redirect(`/partners/${account.slug}/vault`);
    // HomeLane: every sign-in chooses its city first, and orders from it can
    // only be delivered there (lib/tier1-cities.ts). A fresh session has none,
    // so this is the screen straight after the code; `?city=change` brings it
    // back to switch. Our own staff do not place HomeLane orders and skip it.
    if (tier1OnlyPartner(account.slug) && !session.staff && (!session.city || query?.city === "change")) {
      const home = partnerHome(session.account);
      return (
        <CityPicker
          accountName={account.name}
          logoPath={account.logo_path}
          current={session.city}
          next={returnTo ? `${home}/${returnTo}` : home}
        />
      );
    }
    if (returnTo) redirect(`${partnerHome(session.account)}/${returnTo}`);
    if (partnerCapabilities(session.account).poRequiredRelease && !session.staff) redirect(`${partnerHome(session.account)}/projects`);
    if (session.account.portfolio_mode) {
      // Loaded here rather than from the dashboard's own effect: this page is
      // already dynamic and holds the session, so the tree arrives painted
      // instead of after a round trip — which matters most on the phone in a
      // lift lobby that this account is used from.
      const { buildings, areas, progress } = await loadPortfolio(session.account.id);
      return (
        <PortfolioDashboard
          accountName={session.account.name}
          logoPath={session.account.logo_path}
          you={session.email}
          isAdmin={canAdministerAccount(session)}
          canBuild={can(session, "build")}
          canUpload={can(session, "upload")}
          initialBuildings={buildings}
          initialAreas={areas}
          progress={progress}
        />
      );
    }
    redirect(`${partnerHome(session.account)}/orders`);
  }
  // Signed in on a DIFFERENT account. This used to redirect silently to
  // whichever account the session held — harmless for a partner, whose address
  // resolves to exactly one account, but wrong for our own staff: a link to a
  // partner's portal landed on whoever we were last signed in as, with nothing
  // on screen to say so, which is indistinguishable from a broken link.
  if (session) {
    return (
      <WrongAccount
        signedInAs={session.email}
        currentName={session.account.name}
        currentHref={`${partnerHome(session.account)}/orders`}
        wantedName={account.name}
        wantedSlug={account.slug}
        wantedLogo={account.logo_path}
        maySwitch={isStaffSession(session)}
        returnToDocuments={returnToDocuments}
      />
    );
  }

  return (
    <CorporateLogin
      slug={account.slug}
      returnTo={returnTo}
      accountName={account.name}
      // '.invalid' (RFC 2606) marks a partner with no company domain of their
      // own, granted individually via corporate_members instead (0116) — never
      // show that placeholder as something to sign in "@".
      emailDomain={account.email_domain.endsWith(".invalid") ? null : account.email_domain}
      logoPath={account.logo_path}
      // Which door opens first is a FACT ABOUT THE ACCOUNT, not a preference.
      // Knowledge Realty's people are reached on a handset and their domain is
      // a '.invalid' placeholder, so the phone is the only way in. LTM are an
      // IT company whose people all hold @ltm.com addresses and none of whom
      // has a number on file — leading with the phone there would open on a
      // door not one of them can use. So: ask.
      phoneFirst={account.portfolio_mode && (await accountHasPhoneMember(account.id))}
      // What the portal IS, which is not the same question as which door opens
      // first — LTM is a wall-design account whose people all sign in by email.
      portfolio={account.portfolio_mode}
    />
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
