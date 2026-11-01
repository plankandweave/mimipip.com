// What every Meta ad links to and how it is tagged — shared by the launchers,
// kept free of server imports so the payload builders can be tested.

/** Ads point at the live apex, never at a preview host a Worker happens to run on. */
export const SITE = "https://zyvorah.com";

/** docs/campaign-tracking.md — exactly this, as the creative's url_tags. */
export const URL_TAGS =
  "utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{adset.name}}--{{ad.name}}";
