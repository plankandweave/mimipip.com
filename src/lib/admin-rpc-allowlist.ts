// Every database function a signed-in staff page may call through /api/admin/rpc.
//
// Explicit, not a prefix rule: "anything starting with admin_" grows silently
// every time a function is named well, and the point of this list is that adding
// a new privileged call is a decision someone makes on purpose.
//
// Not here on purpose: decision_by_token and outreach_by_token. Those are the
// PUBLIC capability pages under /decide/[token] — they authorise with the token
// in the link, take no key, and are still called straight from the browser.
export const ADMIN_RPCS = [
  "admin_activate_design",
  "admin_cancellations_list",
  "admin_create_design",
  "admin_delete_design",
  "admin_email_metrics",
  "admin_intel_decisions",
  "admin_intel_reports",
  "admin_list_designs",
  "admin_marketing_campaigns",
  "admin_marketing_posts",
  "admin_orders",
  "admin_orders_list",
  "admin_outreach_inbox_status",
  "admin_outreach_list",
  "admin_pending_reviews",
  "admin_resolve_cancellation",
  "admin_search_products",
  "admin_set_price_tier",
  "admin_set_product_flags",
  "admin_set_review_status",
  "admin_trade_contact_delete",
  "admin_trade_contact_update",
  "admin_trade_contacts_list",
  "admin_trade_contacts_upsert",
  "admin_trade_ledger_list",
  "admin_trade_partner_detail",
  "admin_trade_partners_list",
  "admin_trade_set_partner_status",
  "admin_trade_tds_report",
  "admin_traffic_sources",
  "crm_capture",
  "crm_company",
  "crm_overview",
  "crm_presentation_revoke",
  "crm_presentations_for_company",
  "crm_set_deal_stage",
  "crm_set_task_done",
  "crm_task_draft_flags",
  "crm_update_company",
  "women_contribution_report",
] as const;

export type AdminRpc = (typeof ADMIN_RPCS)[number];

const SET: ReadonlySet<string> = new Set(ADMIN_RPCS);

export function isAdminRpc(fn: string): fn is AdminRpc {
  return SET.has(fn);
}
