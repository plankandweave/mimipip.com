# MimiPip checkout

mimipip.com moved from ChatGPT Sites to our Cloudflare account on the CTO's decision of 5 November 2026: Worker `mimipip-com`, D1 `mimipip-orders`. This replaces `docs/INDIA-CHECKOUT.md`.

## The pipeline

Cart → `/checkout` → server re-prices the cart (`src/brand/commerce/prices.ts`) → Razorpay order → signature, then the captured payment and paid order read again from Razorpay → `POST https://os.magnitudegroup.in/api/zyvorah/web-order`, brand `lorange` → print, courier, invoice and books as for Zyvorah.

D1 holds the payment record only. The OS order is the order. A cron runs every five minutes: it asks Razorpay about payments the browser never reported, and offers unsent paid orders to the OS again. `GET /api/checkout/unsent` (header `x-zyvorah-token`) lists any paid order the OS has not taken.

## Prices

One file: `src/brand/commerce/prices.json`. A design with no figure there is not on sale: the shop leaves it out and the checkout refuses it.

| What | Figure | Source |
|---|---|---|
| Wallpaper abroad | US$10 per sq ft, delivery included | Roheena, 5 Nov 2026 (replaces US$60), at ₹50 per sq ft cost |
| Wallpaper India | ₹200 per sq ft plus GST | `MIMIPIP_PRICING.sellingInrPerSqFt` |
| Fixed pieces | `fixedInr` / `fixedUsd` in `prices.json` (Hopscotch ₹4,953.55 / US$209.90) | Simple Price List, 8 Nov 2026 |
| Minimum | 20 sq ft billed; delivery free in India | Zyvorah's rule, carried over |

To price a family: add it to `fixedInr` / `fixedUsd`, or set `indiaRateUnlisted` for the wallpapers with no India rate.

`src/brand/commerce/print-map.json` (made by `scripts/gen-print-map.py`) names each design's print artwork. No artwork, no sale. Designs still in preview are left out until proofed. A picture from this site is never a print file: the OS holds any order that names a file it has no record of. Masters live at `media.zyvorah.com/_print-masters/mimipip/`, listed in `src/brand/commerce/print-masters.json`, built by `scripts/masters/`; the table of every family is `docs/MIMIPIP_PRINT_MASTERS.md` in the OS repo.

To sell a family that now has masters: price it in `prices.json`, and for a sticker or stair set add its `printWidthCm` / `printHeightCm` to the print map. A repeat also needs the site to send `placement.seamless.repeatWidthCm` from the master, which `order-payload.ts` does not do yet.

## Abroad

Charged in USD. The OS is told Razorpay's own rupee figure (`base_amount`); no exchange rate of ours is used. With no such figure the order is recorded as paid and waits, with the reason, at `/unsent`. The OS holds an export's invoice until the export tax position is answered in /approvals.

## Keys

This site holds no keys. mimipip.com is Magnitude Brands, the same Razorpay account as Zyvorah, so the Worker has a service binding, `STORE_PAY`, to the `MimipipPay` entrypoint of `zyvorah-store`. That entrypoint has no URL. It holds the keys and may create and read orders, read payments, check a signature, and post a `lorange` order to the OS (`src/edge/mimipip-pay-rules.ts` in `plankandweave/Zyvorah.com`). Razorpay's webhook for this account goes to the store, which ignores orders it does not hold; a MimiPip payment is settled by the browser's return and the five-minute sweep.

Checkout opens when `MIMIPIP_CHECKOUT_ENABLED` is `1` and the binding answers ready (`GET /api/checkout/readiness`).

## Build and deploy

One path: `.github/workflows/deploy.yml`. Every push to `main` is tested, built, deployed with `wrangler deploy` and checked on the live site. It needs the repository secret `CLOUDFLARE_API_TOKEN`. Do not deploy from a laptop or a session: Cloudflare's file upload step uses its own short-lived pass, which a cloud session's key handling replaces, so a session cannot finish a deploy.

D1 migrations are not run by the workflow. A new table is created by the Worker itself (`CREATE TABLE IF NOT EXISTS`, as `mimipip_funnel` is) and its migration file kept for the record.

## Checks

`node --import tsx --test src/brand/commerce/checkout.test.ts` simulates Razorpay and the OS: tampering, abroad, OS down, closed browser, webhook, repeats. `scripts/check-site.py <base url>` reads every published page and fails on any line that says the shop is closed. It failed 196 of 226 pages on the Sites version and passes on this one.

A live paid order is not proven by these checks.

## What is on sale, search, feeds and the funnel (10 November 2026)

One answer to "is this on sale": a price and a print file (`src/brand/commerce/sale.ts`). Everything in `src/brand/seo/` reads it.

- **Hidden.** A design that cannot be bought is not listed, searched, linked, in the sitemap or in a feed, and its address goes to the shop (`routes.ts`, `hiddenDestination`). It shows itself the day it gets a price and a print file. The same holds for a landing page with nothing to sell.
- **Head tags.** The Worker writes each published page's title, description, canonical address, preview picture and Product/Offer data from `head.ts` (`worker/public-page.ts`). Do not add a second source of these.
- **Landing pages.** `landing.ts`. Words come from the catalogue and prices; `seo.test.ts` refuses a safety or material claim and any other brand's name.
- **Feeds.** `/feeds/google-merchant.xml` (India), `/feeds/google-merchant-us.xml`, `/feeds/meta-catalogue.xml` (India), `/feeds/meta-catalogue-us.xml`. Pictures are JPEGs in `public/feed-images/`, made by `python3 scripts/gen-feed-images.py`; run it when a design goes on sale.
- **Funnel.** D1 table `mimipip_funnel` (migration `0004`; the Worker also creates it if missing): product view, add to cart, checkout started, paid, per IST day, design and country. No cookie and nothing about a person. The OS reads `GET /api/checkout/funnel?days=30` with header `x-zyvorah-token`.
- **Cloudflare Web Analytics** is the zone's own; the page policy now allows its beacon.
- **Build.** The public backend address and publishable key are in `vite.config.ts`, so a build needs no `.env.local`. Server secrets stay in Cloudflare.

## Live key only (11 November 2026)

A Razorpay test key's payments read as `captured` exactly like real ones, but no money moves. So nothing of value comes of a payment unless the key behind `STORE_PAY` is live (`src/brand/commerce/gateway-mode.ts`, which reads only the key's public id and lets only its mode out):
- `/api/checkout/readiness` and `/api/gift-card/readiness` report `gateway: live | test | unknown`. Checkout and gift purchasing are open only on `live`.
- A product payment captured on a test key is set to `review` (`os_error = gateway_not_live`) and never sent to the OS for printing.
- A gift payment captured on a test key sets the gift to `review` and never creates a card. It stays held if the key later turns live.
- No gift email leaves while the key is not live.
- An unreadable key decides nothing: the next pass asks again.
- The deploy's live check requires both doors open on a live key and both closed otherwise, and warns when not live.

To take real money, the zyvorah-store Worker's `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` must be Magnitude Brands' live pair. That is a credential set in Cloudflare, never in this repository.
