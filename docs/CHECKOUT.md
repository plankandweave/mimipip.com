# MimiPip checkout

mimipip.com moved from ChatGPT Sites to our Cloudflare account on the CTO's decision of 5 November 2026: Worker `mimipip-com`, D1 `mimipip-orders`. This replaces `docs/INDIA-CHECKOUT.md`.

## The pipeline

Cart → `/checkout` → server re-prices the cart (`src/brand/commerce/prices.ts`) → Razorpay order → signature, then the captured payment and paid order read again from Razorpay → `POST https://os.magnitudegroup.in/api/zyvorah/web-order`, brand `lorange` → print, courier, invoice and books as for Zyvorah.

D1 holds the payment record only. The OS order is the order. A cron runs every five minutes: it asks Razorpay about payments the browser never reported, and offers unsent paid orders to the OS again. `GET /api/checkout/unsent` (header `x-zyvorah-token`) lists any paid order the OS has not taken.

## Prices

One file: `src/brand/commerce/prices.json`. A design with no figure there is not on sale: the shop leaves it out and the checkout refuses it.

| What | Figure | Source |
|---|---|---|
| Wallpaper abroad | US$60 per sq ft, delivery included | Roheena, 2 Nov 2026 |
| Wallpaper India | ₹200, ₹300 or ₹400 per sq ft by design | `sourceIndiaPricePerSqft`, the Zyvorah rate of each design; "retain India INR prices", Roheena, 2 Nov 2026 |
| Hopscotch India | ₹3,999 including GST | product record |
| Minimum | 20 sq ft billed; delivery free in India | Zyvorah's rule, carried over |

To price a family: add it to `fixedInr` / `fixedUsd`, or set `indiaRateUnlisted` for the wallpapers with no India rate.

`src/brand/commerce/print-map.json` (made by `scripts/gen-print-map.py`) names each design's print artwork. No artwork, no sale. Designs still in preview are left out until proofed. A picture from this site is never a print file: the OS holds any order that names a file it has no record of. Masters live at `media.zyvorah.com/_print-masters/mimipip/`, listed in `src/brand/commerce/print-masters.json`, built by `scripts/masters/`; the table of every family is `docs/MIMIPIP_PRINT_MASTERS.md` in the OS repo.

To sell a family that now has masters: price it in `prices.json`, and for a sticker or stair set add its `printWidthCm` / `printHeightCm` to the print map. A repeat also needs the site to send `placement.seamless.repeatWidthCm` from the master, which `order-payload.ts` does not do yet.

## Abroad

Charged in USD. The OS is told Razorpay's own rupee figure (`base_amount`); no exchange rate of ours is used. With no such figure the order is recorded as paid and waits, with the reason, at `/unsent`. The OS holds an export's invoice until the export tax position is answered in /approvals.

## Secrets on the Worker

`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `ZYVORAH_WEBHOOK_TOKEN` (the same value as the OS), and `MIMIPIP_CHECKOUT_ENABLED` = `1`. Checkout stays shut until all five exist (`GET /api/checkout/readiness`). Razorpay webhook: `https://mimipip.com/api/checkout/webhook`, event `payment.captured`.

## Build and deploy

```bash
pnpm install --frozen-lockfile --ignore-scripts
MIMIPIP_LOCAL_REVIEW=1 NEXT_PUBLIC_MIMIPIP_LOCAL_REVIEW=1 NEXT_TELEMETRY_DISABLED=1 npx vinext build
npx wrangler d1 migrations apply mimipip-orders --remote --config dist/server/wrangler.json
npx wrangler deploy --config dist/server/wrangler.json
```

## Checks

`node --import tsx --test src/brand/commerce/checkout.test.ts` simulates Razorpay and the OS: tampering, abroad, OS down, closed browser, webhook, repeats. `scripts/check-site.py <base url>` reads every published page and fails on any line that says the shop is closed. It failed 196 of 226 pages on the Sites version and passes on this one.

A live paid order is not proven by these checks.
