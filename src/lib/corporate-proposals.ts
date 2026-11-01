import "server-only";
import { readFormat } from "./presentation-format";
import { supabaseAdmin } from "./supabase-admin";
import type { CorporateSession } from "./corporate-auth";

// The decks we have already sent a client, seen from inside their own account.
//
// Until now a proposal reached a client as capability links in three separate
// inboxes and nothing more: forwardable, losable, and invisible to anyone who
// joined the conversation afterwards. An account holder should be able to open
// what we sent them without going to find the email.
//
// THE JOIN ALREADY EXISTED. crm_companies.corporate_account_id is the marker
// that promotes a prospect to a customer (migration 0116); following it the
// other way is how a signed-in account finds its own company's decks. No new
// column, and no second place recording which client a deck belongs to.
//
// TWO FILTERS THAT ARE NOT OPTIONAL:
//
//   audience = 'client'  Migration 0155 split internal review decks from client
//                        ones precisely because they are written differently.
//                        The LTM proposal has both — "Three Aesthetic
//                        Directions" and "…— internal review" — and the second
//                        contains our own commentary. It must never appear here.
//
//   status = 'sent'      A draft is a deck we have not shown them yet. Surfacing
//                        it inside their account IS showing it to them, a day or
//                        a week before anyone meant to.

export type ClientProposal = {
  id: string;
  title: string;
  format: "html" | "pdf" | "video";
  sentAt: string | null;
};

/** The company this account was promoted from, if any. */
async function companyIdFor(accountId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("crm_companies")
    .select("id").eq("corporate_account_id", accountId).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Everything we have actually sent this client, newest first. */
export async function proposalsForAccount(session: CorporateSession): Promise<ClientProposal[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const companyId = await companyIdFor(session.account.id);
  if (!companyId) return [];

  const { data } = await sb.from("crm_presentations")
    .select("id, title, format, sent_at, audience, status")
    .eq("company_id", companyId)
    .eq("audience", "client")
    .eq("status", "sent")
    .order("sent_at", { ascending: false });

  return ((data ?? []) as { id: string; title: string; format: string; sent_at: string | null }[])
    .map((p) => ({
      id: p.id,
      title: p.title,
      format: readFormat(p.format),
      sentAt: p.sent_at,
    }));
}

/**
 * One deck, proven to belong to this session's account.
 *
 * The same two filters again rather than trusting the caller to have listed it
 * first: this resolves an id that arrived in a URL, and a presentation id from
 * another client's account must be a 404 here even though it is a perfectly
 * real row.
 */
export async function proposalForAccount(
  session: CorporateSession, id: string,
): Promise<{
  id: string; title: string; format: "html" | "pdf" | "video"; storagePath: string;
} | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const companyId = await companyIdFor(session.account.id);
  if (!companyId) return null;

  const { data } = await sb.from("crm_presentations")
    .select("id, title, format, storage_path")
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("audience", "client")
    .eq("status", "sent")
    .maybeSingle();
  if (!data?.storage_path) return null;

  return {
    id: data.id as string,
    title: data.title as string,
    format: readFormat(data.format),
    storagePath: data.storage_path as string,
  };
}
