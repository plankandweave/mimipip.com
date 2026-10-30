# Implementation status — 30 October 2026

## Completed implementation
Audit rows 01–40 implemented, with the following scope notes:
- 13 new pages: nursery, toddler, wall stickers, format comparison, measuring, surfaces, installation/care, samples, shipping, returns, FAQ, contact and privacy.
- Expanded all 176 wallpaper product pages and added product pages for both existing borders. Preserved source artwork and catalog descriptions. Added material information, flat artwork where present, planning guidance and links to relevant help.
- Default United States market, retained India choice, and explicit regional bathroom routing. Existing confirmed-looking bathroom list prices preserved; unconfigured US wallpaper prices are quote-on-request. No fabricated USD conversion.
- Replaced the public nonfunctional checkout with local saved designs and email-enquiry links. No emails sent. Removed address/contact collection. Name previews are not saved in new shortlist records. Legacy prototype browser storage is left untouched and is no longer read.
- Added feet/centimeter entry and conversion, shareable filters, clear filters, actual sticker/floor-category routing, product links, useful footer, visible focus, skip links and modal focus containment.
- Fixed pre-existing stage-card event selector that also attached to noninteractive informational cards.
- Removed blanket material/certification headings, internal SEO commentary, and unnecessary franchise-comparison copy.
- Adapted relevant Zyvorah wallpaper guidance and policy reference per owner instruction. Kept sticker/floor requirements separate.
- Fixed mobile overflow in the Little Ocean variant selector.

## Verification
Rows 41–42: automated checks pass for 221 packaged HTML files, 15 inline scripts, shared scripts, JSON-LD, local page/assets references, duplicate IDs and 212 sitemap URLs.
Browser-tested at a narrow 304-pixel viewport: nursery filter and product details; saved-design creation and review; toddler animals entry (4 matches); US→India selection retaining filters; feet→centimeter conversion (10 × 8 ft = 304.80 × 243.84 cm, 80 sq ft); clear filters; wall-sticker category routing; India bathroom price ₹1,199 and US $19.99; product detail help sections; zero horizontal overflow on checked homepage, guide, product and corrected Little Ocean views.
Desktop sizing rules are implemented but a separate wide-viewport visual/device test is not claimed. This is not an exhaustive accessibility or real-device audit. Images across all 178 designs have not each received visual review.

## Remaining serial items
43: Region-specific wallpaper pricing configuration remains required. Existing source INR rates and new bathroom prices exist, but no verified shared US price-book/checkout computation is connected.
44–48: Product evidence remains required for exact materials, certifications, adhesion/removal, wet-area grip and production-ready sticker tolerances. Existing sourced finish names and Little Ocean design dimensions are displayed with their limitations.
49–51: Relevant wallpaper shipping/cancellation/returns text adapted from Zyvorah. Actual MimiPip carrier coverage, fulfillment readiness, sticker policy and tax configuration still need implementation/evidence.
52–55: Commerce backend, payment account, order notifications, full test orders/refunds, sample fulfillment and production personalization remain incomplete. Existing Zyvorah reference components cannot run in this static site and explicitly reference private Zyvorah services. No cross-brand backend connection was made.
56–61: Catalog-by-catalog visual/tag curation, new physical photography, verified reviews, bundles/registry, accurate room visualizer and subscription backend remain unimplemented. They require product/content/service work; no invented proof or mock functionality was added.
62: Mobile overflow checks completed on representative routes. Lab/field Core Web Vitals, desktop and real-device accessibility review remain open.
63: Post-commerce analytics review remains future operational work.
64: Release result recorded separately after deployment.

## Maintenance
This checkout is isolated from the original website folder, whose unfinished changes were not overwritten. `scripts/parent-upgrade.py` and `scripts/finish-parent-upgrade.py` record one-time migrations; do not rerun them. Normal rebuild sequence: `node scripts/generate-seo.mjs`, `python3 scripts/package-static.py`, `python3 scripts/verify-static.py`. Edit guide HTML directly. The package excludes audit notes and copied private implementation references.
