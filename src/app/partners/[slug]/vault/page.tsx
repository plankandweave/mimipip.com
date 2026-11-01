
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentCorporateSession, partnerHome, slugMatchesSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import VaultPanel from "../vault-panel";

// The Vault, at its own address — so an email can say "sign in and open your
// Vault" and land here after the code. The dashboard reaches the same panel
// from its Vault tab.
export const dynamic = "force-dynamic";

export const metadata: Metadata = brandMetadata({
  title: "Vault · Zyvorah",
  robots: { index: false, follow: false },
});

export default async function VaultPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = supabaseAdmin();
  const { data: account } = sb
    ? await sb.from("corporate_accounts").select("id, slug, name").eq("slug", slug).eq("active", true).maybeSingle()
    : { data: null };
  if (!account) notFound();

  const session = await currentCorporateSession({ allowVaultUploadOnly: true });
  if (!session || !slugMatchesSession(session, slug)) redirect(`/partners/${slug}?next=vault`);

  return (
    <main className="container-x max-w-3xl py-8">
      <VaultPanel standalone backHref={partnerHome(session.account)} />
      <p className="mt-10 text-xs text-mist">Signed in as {session.email}</p>
    </main>
  );
}
