import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dealToOpen, osPipelineUrl } from "@/lib/crm-in-the-os";

// Retired 29 Oct 2026: a company is opened on the OS Pipeline, on its newest
// open deal (src/lib/crm-in-the-os.ts). The Proposal Studio below this path
// stays on the store.
export default async function CrmCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let dealId: string | null = null;
  const sb = /^[0-9a-f-]{36}$/i.test(id) ? supabaseAdmin() : null;
  if (sb) {
    const { data } = await sb.from("crm_deals").select("id,stage,updated_at").eq("company_id", id).limit(50);
    dealId = dealToOpen((data ?? []) as { id: string; stage: string | null; updated_at: string | null }[]);
  }
  redirect(osPipelineUrl(dealId));
}
