# Mimi Pip organic discovery implementation — 14 November 2026

Scope: all sellable catalogue designs and their selectable offers, organic discovery only.

## Implemented
- 191 sellable designs: 185 wallpapers and six floor games. 39 unpublished records remain excluded for missing price/print readiness; they must not be activated by SEO work.
- India feed: 746 offers (three fixed sizes and one 8 × 9 ft custom configuration for each wallpaper, plus six floor games). US: 191 offers. Custom dimensions are configurable rather than infinitely enumerated.
- Stable existing offer IDs retained; explicit IDs and parent groups added for fixed sizes. Market and size deep links select the advertised offer.
- Checkout-derived fixed prices, actual dimensions, self-adhesive wallpaper material, colours and accurate product-type descriptions. Non-hopscotch games no longer claim numbered hopscotch paths.
- ProductGroup variant data, selected offer markup and visible catalogue facts.
- Read-only /api/agent/catalogue, /api/agent/search and /api/agent/product/{slug}; no ordering or private production-file exposure.
- 2,366 typed tags added to the isolated mimipip database schema, covering all 185 sellable wallpapers and the custom-upload service. Six floor games use the source catalogue and native checkout, not mirrored wallpaper records.
- Removed unsupported Child-Safe tags from those 185 wallpaper records; original tags backed up locally. Existing unpublished records were not changed.
- IndexNow key and submission script; deployment workflow reports submission errors without rolling back a healthy storefront.

## Access evidence
Fresh live check passed for eight assistant/search user-agent strings. Sitemap and feeds returned 200. This verifies requests from our test location, not real vendor IP crawls. Earlier 403 responses were not reproduced; no firewall protection was weakened.

## Validation and operations
Run npm test, npm run typecheck:app, npm run build, npx tsx scripts/audit-organic-discovery.ts, and node scripts/verify-ai-visibility.mjs after deployment. Catalogue audit and platform evidence are kept in output/organic-discovery-2026-11-14/.

Platform submission status belongs in that directory's tracker; feed preparation, submission, ingestion and actual AI recommendation are separate states. No recommendation is guaranteed.

## Remaining factual work
No unsupported safety certifications, GTINs, floor-sticker substrates, panel counts, weights or precise international delivery times were invented. These should be filled only from verified production specifications. General shipping, return and installation policies remain linked from products.
