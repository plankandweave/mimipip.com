// One name for the Meta Marketing API token.
//
// This module exists because there were two. The daily ad-channel report read
// `META_ADS_TOKEN`; the campaign launcher read `META_SYSTEM_USER_TOKEN`. They
// are the same credential — one system-user token with ads_management — but
// setting either name left the other half of the integration silently dark:
// no error, no warning, the daily mail just quietly reported Meta from GA
// landings forever and said the channel was unconfigured.
//
// META_ADS_TOKEN is the canonical name. META_SYSTEM_USER_TOKEN is still read,
// so an environment already carrying the old name keeps working.

/** The Marketing API system-user token, under either name. */
export function metaAdsToken(): string | undefined {
  return process.env.META_ADS_TOKEN || process.env.META_SYSTEM_USER_TOKEN;
}

/**
 * The token the Conversions API reports with.
 *
 * `META_CAPI_TOKEN` stays the explicit name, for the case where CAPI is given
 * its own system user. But one system-user token with `ads_management` and the
 * Pixel assigned as an asset serves both the Marketing API and CAPI, and that
 * is the normal setup — so the ads token is the fallback. Without it, setting
 * the one credential the daily report needs would leave the purchase feed
 * silently dark: exactly the failure this module was written to end.
 */
export function metaCapiToken(): string | undefined {
  return process.env.META_CAPI_TOKEN || metaAdsToken();
}

/** Every ad account named in META_AD_ACCOUNT_ID (comma-separated), each
 *  `act_`-prefixed as the Graph API expects. Reporting reads them all: a
 *  campaign run from a second account is otherwise missing from every number. */
export function metaAdAccountIds(): string[] {
  return (process.env.META_AD_ACCOUNT_ID ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => (raw.startsWith("act_") ? raw : `act_${raw}`));
}

/** The ad account the engine LAUNCHES into — the first one named. */
export function metaAdAccountId(): string | undefined {
  return metaAdAccountIds()[0];
}

/**
 * The Instagram Business/Creator account id — the same account whether it is
 * receiving ad creative or an organic post. IG_BUSINESS_ACCOUNT_ID is the
 * organic publisher's own historical name and is still read, but there is only
 * one IG account, so the ads name serves both. (The same "there were two names"
 * trap this whole module exists to close.)
 */
export function metaIgAccountId(): string | undefined {
  return process.env.IG_BUSINESS_ACCOUNT_ID || process.env.META_IG_ACCOUNT_ID;
}

/**
 * The token organic Instagram publishing posts with.
 *
 * Publishing a feed post needs `instagram_content_publish`; the ads system-user
 * token normally carries `ads_management`. One system user CAN hold both, and
 * when it does — the usual setup once the IG account and Page are assigned to it
 * as assets — that single token serves ads AND organic, so it is the fallback.
 * IG_ACCESS_TOKEN stays the explicit name for the case where publishing is given
 * its own token. If the resolved token lacks the publish permission the post
 * fails with the Graph API's own message on the approval board — visible, not
 * silent — rather than being blocked before it is tried.
 */
export function metaPublishToken(): string | undefined {
  return process.env.IG_ACCESS_TOKEN || metaAdsToken();
}
