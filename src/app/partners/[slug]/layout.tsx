import type { Metadata } from "next";
import { partnerShortName } from "@/lib/partner-app";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Props = { params: Promise<{ slug: string }>; children: React.ReactNode };

// Every page of a partner's portal installs as THAT partner's app — opening on
// its dashboard, labelled with its name — instead of the shop's (lib/partner-app.ts).
export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { slug } = await params;
  // The manifest needs only the address, so it never waits on the database:
  // a portal must not fall back to installing as the shop because a lookup
  // was slow. An unknown slug's manifest 404s, as its page does.
  const manifest = `/api/corporate/app-manifest/${encodeURIComponent(slug)}`;
  const sb = supabaseAdmin();
  const { data: account } = sb
    ? await sb.from("corporate_accounts").select("slug, name").eq("slug", slug).eq("active", true).maybeSingle()
    : { data: null };
  return {
    manifest,
    ...(account ? { appleWebApp: { capable: true, title: partnerShortName(account.name as string), statusBarStyle: "default" as const } } : {}),
  };
}

export default function PartnerLayout({ children }: Props) {
  return children;
}
