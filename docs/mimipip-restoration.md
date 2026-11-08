# Mimi Pip restoration status — 8 November 2026

**Work in progress; not a release or completion claim. No storefront deployment has been made.**

The active checkout is the Cloudflare site, based on commit `1b785886b4d375e364ab434140d4bdf3ce06078b`. The older Sites deployment must not be used. The source comparison is Zyvorah main `b84a8b3` (7 November), with the original native product/configurator, cart and account components retained.

## Infrastructure

- Existing Magnitude Cloudflare account; `mimipip-com`, D1 `mimipip-orders`, existing `STORE_PAY` binding to `zyvorah-store` / `MimipipPay`.
- Existing Magnitude Supabase project `qrtznwnhuzkpynjetygg`, isolated `mimipip` and `mimipip_private` schemas. No Zyvorah customer, order or product rows copied.
- 151 wallpaper records seeded from Mimi's catalogue. 86 have the existing print mapping; 65 remain unavailable for purchase. Fixed products still use the existing listing/payment path.
- Private `mimipip-*` storage buckets; browser board access is owner-scoped. Cart previews are signed only for their own cart-token folder.
- Existing print backend is connected locally for lettering rendering. No email or actual payment was sent during verification.

## Implemented

- Native four-step product configurator, native cart, original account interface, original room-preview page.
- Removed the replacement homepage branch. Restored the inherited homepage composition with Mimi catalogue inputs and the latest Zyvorah hero component. Restored direct guided-design and photo-match pages and desktop tool links; service availability remains a blocker below.
- Measured local catalogue images and populated their dimensions in isolated Mimi data. Prevented a missing canvas category from falling back to wallpaper, and restored visible fixed-pack card prices.
- India wallpaper ₹200/sq ft before 18% GST; US $10/sq ft including delivery. An 8 × 9 ft wall totals ₹16,992 or $720. Existing 20 sq ft minimum retained.
- Database and D1 round the unit price to cents/paise before multiplying quantity; browser prices are not trusted.
- Plain native crop and sign-off survive into the durable D1 line record; unsupported wall markings are now refused before purchase and again at OS handoff. An unsupported upload or production option is refused rather than silently substituted/dropped.
- Paid D1 account history and receipts use a server-verified, email-confirmed session. Customer email supplied in request parameters is never trusted. Other-customer and unpaid records are excluded.
- Removed inherited Zyvorah seasonal discounts and unsupported express promises from the active Mimi cart.
- Corrected original Mimi typography and product description, rate labels and rounding. Original wordmark unchanged.

## Verification

`npm run test:restoration` runs 57 focused restoration tests, including payment-provider mocks, authoritative pricing, account ownership, crop preservation, storage scoping and wall defaults. These pass. The inherited Zyvorah catalogue/marketing fixture tests are not a claim of Mimi acceptance and are not part of this command.

`npm run typecheck:app` checks production application code separately from those inherited test fixtures. It passes. `npm run build:vinext` passes.

`python3 scripts/check-native-cart.py http://localhost:8802` checks the running isolated cart, quantities, anonymous separation, US quote and anonymous account-history denial; it removes its own test cart item and never creates a payment. The backend used by the local preview is live isolated Mimi data.

The public-route crawl returned 200 for all 226 checked URLs. Native browser verification covered the four-step plain-wallpaper selection and both country quotes. Desktop layout had no horizontal overflow; rendered font was MimiText (Nunito). A later browser session successfully applied real320/390px viewports. Plain product/configurator/cart and mixed checkout were exercised, with no horizontal overflow; checkout also checked768/1440px. Wider whole-site mobile review remains unfinished.

Local startup requires ignored `.env.local` with the approved public backend URL/key, plus ignored `.dev.vars` with separately configured server secrets. After building, use Wrangler's generated `dist/server/wrangler.json`. No secret values belong in this document or version control.

## Not complete / release blockers

- Full source parity: parts of navigation and fixed-product configuration still retain simplified/review paths. This is not yet the complete Zyvorah storefront with a brand change.
- Seamless layouts, opening-aware fulfilment, uploaded-art fulfilment and paid samples require the original production handoff to be completed. Installation is integrated and locally verified; lettering is integrated and locally verified but payment-gated pending the reviewed OS backend rollout. Their source code being present does not establish working purchase paths.
- Login emails: `mimipip.com` added to the existing Resend account; DNS verification is pending. Existing Cloudflare OAuth cannot read/edit DNS (403); browser sign-in requested. No test email sent.
- AI shopper workflow: locally available legacy Anthropic keys returned 401 on read-only model-list checks. No unrelated workflow key was repurposed. Concierge and visual search remain incomplete.
- Fixed-size pack prices: workbook explicitly labels area/cost figures provisional. User choice requested before replacing existing fixed prices. US fulfilment costs are unknown, not zero.
- Authenticated account/boards end-to-end checks, phone layout, final whole-site interactive review, exact deployment and live verification remain required.

Current production remains deployment `109d0529-8a20-4a33-9cd7-ce2c75a3ea4d`, version `d0cdb637-8cf6-4d2e-a3d6-b5af74b090e2`, as last verified in this task.

See the task outputs/continuation-verification.md for the final continuation checks and flow-specific blockers. No production deployment.

## Sample adapter continuation (8 November 2026)
Original OrderSample and SampleOrderModal are routed again at /samples. Design search uses only Mimi wallpaper handles with verified smooth-matt print artwork. Samples use the existing D1/STORE_PAY payment ledger, not a new payment account or shared Zyvorah order RPC. The original ₹200 India-only A4 price is authoritative server-side. Durable sample lines carry their own kind and dedicated OS sample metadata; production cannot mistake them for cheap full walls. Token retry, capture verification, OS retry and status recovery are retained.

Release gate: MIMIPIP_SAMPLE_CHECKOUT_ENABLED is absent/off. Do not enable until the actual engine sample layout, Mimi branding/QR and production quality pass. Current OS source defaults to one fit card, despite older comments describing two cards. No real payment or print job was triggered. Business GST identity is captured as a separate retail billing identity and held by MIMIPIP_BUSINESS_INVOICE_ENABLED until OS #1018 is corrected, reviewed and deployed. It must never classify retail buyers as corporate.

Original design options remain safely held before cart/payment where the production contract is incomplete. The live engine OpenAPI supports text_overlay.shape and companion, but deployed OS WebItemSchema currently rejects them; draft OS #1015 supplies the missing intake. OS web-order placement lacks seamless; multi-wall corner seams/divisions lack a complete transfer contract. Opening capability variable names exist in production but OAuth does not reveal values. Do not guess that name existence proves enabled capability.


## Installation and lettering continuation
Original installation rules are active in the isolated Mimi database and D1 quote: ₹35/sq ft plus GST, minimum 80 sq ft, existing Bengaluru/Mumbai/Pune PIN coverage. The real checkout address is rechecked. Quantity changes recompute the fee. Browser verified a 10 x 9 ft wall with Pune installation at ₹24,957 in configurator, cart and checkout; no payment.

Original lettering now preserves scalloped name clouds and companion quotes. Name fee is the original ₹500 once per configured line; quote text is included. Server validates text, placement, sign-off and fee, and hands `textOverlay` plus the fee breakout to OS. Database migration 007 applied only to Mimi's existing pricing trigger function. Live isolated cart integration passed rendering, canonical name/fee, quantity changes and D1 price parity. MIMIPIP_LETTERING_CHECKOUT_ENABLED remains absent/off until OS #1015 is reviewed and deployed. Overseas paid name-cloud pricing is not invented; ordinary quotes remain included.

Backend cloud draft PRs are OS #1015 (lettering/seamless intake), OS #1016 (sample brand propagation/capability hold), print-platform #175 (original Mimi logo, exact product QR, own footer). No merge/deploy yet. These are under active review, not permanent blockers.

CSP now carries the existing Razorpay origins on every storefront HTML document, because client navigation retains the initial document policy. It retains robots and analytics directives and removes unsafe-eval. Sample and normal checkout no longer depend on opening their URL as a fresh page.

Local preview secrets must be placed in ignored `dist/server/.dev.vars` beside the generated Wrangler config (chmod 600). `--env-file` alone did not bind them in this preview. This is local binding preparation using the existing approved credentials, not a production secret change. Do not commit or upload that file.

## Business billing identity continuation
The original sample form and main checkout collect optional GSTIN plus registered business name. Syntax/checksum/state-code validation happens before payment; it does not claim a live registration or verify ownership. The durable payment record binds the normalized identity to the payment session, and changing it requires a new session. OS receives a separate order-level billingIdentity with no corporate channel. The feature remains gated until OS #1018 handles invalid declared details as an invoice hold and preserves the buyer-declared name. Focused mock-payment regression passes; no real business identifier or payment was submitted.

The latest build and application typecheck pass. The latest browser viewport override did not change the measured viewport, so no new narrow-screen acceptance claim is made for the final sample/billing edits. The offline engine sample-card preview was visually inspected with clearly labelled synthetic artwork: original Mimi wordmark, own domain and QR are present; this proves layout only, not a physical sample.
