
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentCorporateSession, partnerHome, slugMatchesSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import ShowroomSignOff from "./sign-off";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; id: string }> };

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Client sign-off · ${slug} print portal`, robots: { index: false, follow: false } };
}

/**
 * The SHOWROOM screen. This page is turned to face the partner's client, so
 * the payload it renders from carries the SELLING figure only — website list
 * price, taxes in. The partner's net, discount and rate are deliberately never
 * selected here: what is not in the page cannot be seen by view-source, a
 * network tab, or someone leaning over the counter.
 */
export default async function ShowroomQuotePage({ params }: Props) {
  const { slug, id } = await params;
  const session = await currentCorporateSession();
  if (!session) redirect(`/partners/${slug}`);
  if (!slugMatchesSession(session, slug)) redirect(`${partnerHome(session.account)}/orders`);
  if (session.agreementPending) redirect(`${partnerHome(session.account)}/agreement`);

  const sb = supabaseAdmin();
  if (!sb) redirect(`${partnerHome(session.account)}/orders`);

  const { data } = await sb.from("corporate_orders")
    .select("id, order_ref, os_print_order_no, print_name, width_mm, height_mm, area_sqft, list_amount, amount, gst_pct, status, frozen_at, client_name, client_ref, client_quote_url, client_signed_at")
    .eq("id", id).eq("account_id", session.account.id).maybeSingle();
  if (!data) notFound();

  const o = data as Record<string, unknown>;
  const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
  // Selling price = ex-GST list + tax, same arithmetic the client-quote route
  // bills the PDF with. Flat-rate fallback: no list means cost is the only
  // price on the account and there is no margin to hide.
  const sellTotal = Math.round((num(o.list_amount) || num(o.amount)) * (1 + num(o.gst_pct) / 100));

  return (
    <ShowroomSignOff
      slug={session.account.slug}
      accountName={session.account.name}
      logoPath={session.account.logo_path}
      orderId={String(o.id)}
      orderRef={String(o.os_print_order_no ?? o.order_ref)}
      printName={(o.print_name as string | null) ?? null}
      widthMm={num(o.width_mm)}
      heightMm={num(o.height_mm)}
      areaSqft={num(o.area_sqft)}
      sellTotal={sellTotal}
      savedClientName={(o.client_name as string | null) ?? null}
      savedClientRef={(o.client_ref as string | null) ?? null}
      alreadySigned={Boolean(o.client_signed_at)}
      hasQuotePdf={Boolean(o.client_quote_url)}
    />
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
