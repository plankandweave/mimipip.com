# MimiPip: US-first parent shopping audit
30 October 2026. Target confirmed by owner: https://mimipip.com.

## Coverage and limits
Reviewed live mobile homepage, nursery filtering and product dialog; inventoried all 206 HTML source routes from published commit d53f4ed7e736e7fbf3f3c3ea4ce586d5bd580619. Read shared catalog, product-page generator, regional bathroom pages, floor-game pages, play instructions, artist story and analytics implementation. Local-link scan found no missing file targets. Template inspection covers 176 wallpaper detail routes, not an individual visual review of every image. Checkout cannot submit an order. Desktop/mobile regression follows implementation. Existing unrelated local edits are preserved in the original website folder.

## Benchmark evidence
These are established specialist references, not an objective ranking of the world's best sites.
- WallPops product page: exact piece count, sheet and motif dimensions, room/flat/detail images, sample entry, installation, returns, calculator and cart together: https://www.wallpops.com/products/up-up-and-away-wall-decals
- Urbanwalls: product-type and room browsing, variant choices, samples and room-visualizer entry: https://uwdecals.com/
- Chasing Paper: country selection and navigation by room, color and material, plus installation help: https://chasingpaper.com/
Transfer these information patterns, not their materials, certifications, shipping promises or return terms.

## Journey A: parent preparing a baby nursery
I need to see calm room ideas immediately, distinguish decals from a full-wall mural, understand the actual size, check my painted wall, inspect the exact material and choose with enough time before decorating. Today I encounter a collection campaign, bath products and several long sections before age browsing. Nursery returns 83 tagged designs, including generic activity/pool titles. A product shows rupee rates, imaginative prose and a name badge before answering material, compatibility, dispatch or returns. Safety-sounding homepage headings do not link to evidence. I cannot buy, request a sample or obtain a confirmed delivery date.

## Journey B: parent shopping for a toddler
I need recognizable themes, room-to-grow options, practical cleaning/removal advice, a clear distinction between decorative stickers and floor products, dimensions, and easy comparison with my partner. The existing filters help, but wall-sticker/floor-sticker selections return an empty wallpaper catalog rather than the relevant category. There is no shortlist or useful format comparison. The name preview is presented before practical details. A local cart leads to address entry and a payment dead end. A toddler-stage label is design inspiration, not an age/safety certification.

## Serial implementation list
Work in this order. 'Evidence' requires business/supplier facts or operational services; never fill it with invented claims.

| # | Priority | Change / acceptance criterion | Type |
|---|---|---|---|
| 01 | P0 | Preserve published baseline and unrelated edits; inventory every route | Code |
| 02 | P0 | State preview/ordering status before shoppers enter a buying flow | Code |
| 03 | P0 | Remove blanket self-adhesive, PVC-free and certification impressions | Code |
| 04 | P0 | US-first market selection across the site; persist explicit choice; respect regional URLs | Code |
| 05 | P0 | No INR prices presented as US prices; no invented currency conversion | Code |
| 06 | P0 | Replace dead-end public checkout with useful saved-design planning and enquiry | Code |
| 07 | P0 | Do not collect contact/address data for a checkout that cannot submit | Code |
| 08 | P0 | Keep child-name preview ephemeral; do not retain a child's name in saved designs | Code |
| 09 | P1 | Put nursery and toddler paths near the top of the homepage | Code |
| 10 | P1 | Dedicated nursery page: room planning, themes, wall questions and shopping links | Code |
| 11 | P1 | Dedicated toddler page: interests, refresh choices, care and shopping links | Code |
| 12 | P1 | Dedicated wall-sticker entry; separate decorative and floor use | Code |
| 13 | P1 | Format guide: wallpaper, borders, decals, floor games; availability clearly stated | Code |
| 14 | P1 | Fix empty sticker filters by routing to real categories | Code |
| 15 | P1 | Clear-all filters and helpful zero-results recovery | Code |
| 16 | P1 | Shareable stage/interest/color/search filter URLs and history restoration | Code |
| 17 | P1 | Honest sort label: source order is not proof of newest/bestselling | Code |
| 18 | P1 | Consistent product-page links from cards and product dialog | Code |
| 19 | P1 | Persistent design shortlist with remove controls and no order implications | Code |
| 20 | P1 | Product details before personalization: material options and validation limits | Code |
| 21 | P1 | Product detail template: exact artwork access, room image, planning notes and help links | Code |
| 22 | P1 | Dimensions shown in US and metric units; estimator measures area, not invented price | Code |
| 23 | P1 | Explain room-render scale limits and sample need | Code |
| 24 | P1 | Wall suitability guide: texture, paint finish, fresh paint and humidity questions | Code |
| 25 | P1 | Measuring guide: multiple wall measurements, obstacles, panel/crop confirmation | Code |
| 26 | P1 | Installation/care/removal guide with product-specific instruction limits | Code |
| 27 | P1 | Sample information page; distinguish sample request from an order | Code |
| 28 | P1 | US and India delivery/tax/import information with unknowns disclosed | Code |
| 29 | P1 | Returns/damage/cancellation information without invented eligibility or deadlines | Code |
| 30 | P1 | FAQ organized around the two parent journeys | Code |
| 31 | P1 | Contact page with product/market questions and existing brand support address | Code |
| 32 | P1 | Privacy explanation and access to existing analytics choices | Code |
| 33 | P1 | Footer connects all help pages and regional choices | Code |
| 34 | P1 | Skip links, visible focus, keyboard dialog containment and focus return | Code |
| 35 | P1 | Readable mobile product text, usable touch targets and no horizontal overflow | Code |
| 36 | P1 | Reduced-motion handling and responsive layouts for new pages | Code |
| 37 | P1 | US English default; preserve India-specific pages | Code |
| 38 | P1 | Crawlable guide/age pages, unique titles/descriptions, canonical URLs and sitemap | Code |
| 39 | P1 | Remove internal SEO commentary and keyword-stuffed franchise comparisons | Code |
| 40 | P1 | Retain factual Product schema; never add false offers/reviews/stock | Code |
| 41 | P1 | Validate local links, scripts, generated/source bundle parity and route coverage | QA |
| 42 | P1 | Test nursery and toddler journeys, market switching, filters, shortlist and help | QA |
| 43 | P0 | Approve US USD and India INR price books, margins and minimum sizes per SKU | Evidence |
| 44 | P0 | Confirm substrate, adhesive, ink, finish and available material variants per SKU | Evidence |
| 45 | P0 | Obtain product-specific certification documents and claim scope before badges | Evidence |
| 46 | P0 | Validate adhesion/removal on US textured/painted walls and Indian wall finishes | Evidence |
| 47 | P0 | Validate wet-area grip, cleaning and floor compatibility before floor release | Evidence |
| 48 | P0 | Confirm production dimensions, tolerances, piece counts, panel widths and coverage | Evidence |
| 49 | P0 | Establish US/India inventory, dispatch origin, carriers, ZIP/PIN coverage and delivery estimates | Evidence |
| 50 | P0 | Approve taxes, duties, importer responsibility and total landed-cost disclosure | Evidence |
| 51 | P0 | Approve cancellation, returns, custom-order exceptions, damage and refund procedures | Evidence |
| 52 | P0 | Connect authorized commerce backend, inventory, regional payment processors and order emails | Evidence/code |
| 53 | P0 | Verify full test orders, payment failure/retry, stock, refund and fulfilment for both countries | Evidence/QA |
| 54 | P1 | Sample stock, sample pricing, shipping and ordering workflow | Evidence/code |
| 55 | P1 | Production-accurate personalization preview, crop proof and sign-off workflow | Evidence/code |
| 56 | P1 | Verify each catalog tag, title and image; curate nursery/toddler suitability manually | Content review |
| 57 | P1 | Real product photography: close-up texture, sheet contents and measured room scale | Assets |
| 58 | P2 | Verified reviews and permission-cleared customer-room photos | Evidence/code |
| 59 | P2 | Bundles, gift notes, gifting/registry options and related-product merchandising | Business/code |
| 60 | P2 | Room-photo visualizer only after accurate SKU scale/material behavior and privacy workflow | Product/code |
| 61 | P2 | Consent-based availability notifications with real backend and unsubscribe | Evidence/code |
| 62 | P2 | Measured Core Web Vitals, image optimization and real-device accessibility audit | QA |
| 63 | P2 | Review search terms, filter use and conversion funnels after real commerce launch | Operations |
| 64 | P0 | Publish verified implementation; report remaining dependencies honestly | Release |

## Release boundary
The owner authorized improvements and publication. The source contains no production commerce service or approved fulfillment/policy evidence. The implementable outcome is a more complete US-first discovery and planning site. It cannot honestly be called a functioning US/India shop until rows 43–55 are resolved. Do not invent reviews, certifications, shipping deadlines, support response times or payment integrations.

## Owner clarification and policy reuse
The owner instructed reuse of relevant Zyvorah website content during this audit. Adapted the dedicated measuring, installation, shipping and refund policy pages, accessed 30 October 2026:
- https://zyvorah.com/how-to-measure
- https://zyvorah.com/installation
- https://zyvorah.com/shipping-policy
- https://zyvorah.com/refund-policy
- https://zyvorah.com/faq

Dedicated shipping policy distinguishes dispatch from courier transit. Some product-page snippets still contain older conflicting express-delivery wording; those were not reused. Wallpaper guidance does not establish sticker adhesion or wet-area grip. Existing local reference notes explicitly state Zyvorah private cart/rendering routes are not a MimiPip backend. Relevant wallpaper policy content is now adapted; payment configuration, final regional price books and product-specific evidence remain open.
