# MimiPip gift cards — INR launch

Owner approved 11 November 2026: no expiry, partial redemption, retained balance, ₹500–₹50,000 custom values. Presets ₹1,001, ₹2,001, ₹5,001, ₹10,001 and ₹20,001. USD issuance is unavailable. The three supplied artworks remain unchanged; every occasion can use every artwork.

## Dependencies and release

Deploy OS gift settlement first (magnitude-global-platform PR1144), then the private shared payment/message service (Zyvorah.com PR1267), then this repository's normal main deployment. The OS must finish its build/typecheck. STORE_PAY.giftReady probes the OS capability. Purchasing stays closed if that capability, DB migration, signing key, payment service or Resend key is missing. No session-local deployment path is introduced.

The deploy workflow applies the D1 migrations before publishing and creates MIMIPIP_GIFT_SECRET only if absent. Never rotate this key as routine deployment: active codes and private viewing capabilities derive from it. The existing RESEND_API_KEY must authorize hello@mimipip.com. The shared store's existing OPENAI_API_KEY is used only via its private fixed writing route. Secrets stay server-side. No real provider calls are part of the tests.

## Financial invariants

A gift is activated only after server-to-server payment and order verification match captured INR value, provider order and unrefunded payment. One purchase produces one code, balance and email outbox row, even when browser and cron race. Codes have 96 bits of HMAC-derived entropy and are stored as hashes. The email/print viewing capability is separate and 256 bits.

A single SQL statement plus triggers reserves balance atomically. Gift + new cash equals the full order value; the OS receives gross line totals, actual new cash, and the gift tender separately. Full gift redemption needs no invented Razorpay payment. Unused balance stays on the card. A presented part-gift checkout left unpaid for 90 minutes, or whose cart or address changed, gives its balance back to the card, but only after Razorpay shows no payment of any kind on its order; the order is kept as `expired`, and money that lands on it later is moved to `review` (listed as `lateCaptures` on the operations endpoint) and never becomes an order. An unpresented creating checkout is deleted and releases its reservation. Such interrupted checkouts recover after a five-minute grace period, on the next sweep or gift quote/create. Conditional deletion races safely with publication; a late worker cannot expose a deleted order. Fully gifted settlement is atomic with reservation, so a stopped invocation cannot strand its balance. Do not release a reservation by hand: the sweep does it on the rule above. Gift cards cannot settle a cart containing a design service. The email payload, which carries the code in clear, is cleared once the provider accepts it. The deploy creates `MIMIPIP_GIFT_SECRET` only when the secret list definitely lacks it and fails if the list cannot be read, because rotating it would orphan every issued code.

`GET /api/gift-card/operations`, authenticated by the existing x-zyvorah-token service credential, reports recent purchases, email exceptions and open reservations without exposing codes or viewing keys. D1 holds the purchase payment references, original value, balances and redemption references. Existing product invoice generation retains the full sale value; this change does not invent tax treatment or bank/GST details.

## Delivery and recovery

The purchaser's browser session retains its token and frozen gift details, so reloads resume the same payment. After activation, Send another gift archives the printable receipt in recent gifts before clearing the current attempt; pending purchases cannot be discarded this way. Cron independently reconciles pending purchases, rotating by last check to avoid starvation. The transactional outbox sends from MimiPip <hello@mimipip.com>. It includes the card image in the email body, readable text/code, personal note and a protected printable card link. A lease and fixed Resend idempotency key/payload protect retries; uncertain delivery older than 23 hours holds for review rather than risking duplicate mail. Provider acceptance is not proof of inbox delivery.

Private print/image responses are no-store/noindex with no-referrer. Static instances of the existing Fredoka/Nunito fonts avoid next/og's variable-font parsing failure. Marathi uses the bundled Devanagari font. Source artwork is unchanged. The printable HTML supports browser Print / Save as PDF.

## Message suggestions

The optional button requests three editable notes through GPT-6.1 Sol, reasoning low, store:false. Only occasion, names and the current note reach the model. The provider route fixes model, prompt and output schema; no arbitrary tools or provider proxy are exposed. Server limits are 10 requests per IP-derived bucket/hour and 200/day. Usage reports through the existing group AI meter as MimiPip. A failure preserves the user's draft.

## Validation

Local mocked tests cover exact captured value, wrong currency/refunds, duplicate activation, atomic competing redemptions, retained balance, immutable redeemed tenders, reservation release boundaries, full/mixed checkout settlement, protected views and email leases/retry windows. Actual next/og pixel inspection covers all three styles, Marathi, long names and pending-code suppression. No real payment, voucher or email has been created by these tests. The personal recipient gift remains held for email-proof review.

## Database

`drizzle/0006_gift_cards.sql` was applied to D1 `mimipip-orders` once on 11 November 2026 and recorded in `d1_migrations` with 0004 and 0005, which were already in place. The deploy workflow does not run D1 migrations: its token has no D1 access, and `docs/CHECKOUT.md` keeps schema changes out of the deploy. Never run 0006 again; its `ALTER TABLE` would fail.

## Live key only (11 November 2026)

A Razorpay test key's payments read as `captured` exactly like real ones, but no money moves. So nothing of value comes of a payment unless the key behind `STORE_PAY` is live (`src/brand/commerce/gateway-mode.ts`, which reads only the key's public id and lets only its mode out):
- `/api/checkout/readiness` and `/api/gift-card/readiness` report `gateway: live | test | unknown`. Checkout and gift purchasing are open only on `live`.
- A product payment captured on a test key is set to `review` (`os_error = gateway_not_live`) and never sent to the OS for printing.
- A gift payment captured on a test key sets the gift to `review` and never creates a card. It stays held if the key later turns live.
- No gift email leaves while the key is not live.
- An unreadable key decides nothing: the next pass asks again.
- The deploy's live check requires both doors open on a live key and both closed otherwise, and warns when not live.

To take real money, the zyvorah-store Worker's `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` must be Magnitude Brands' live pair. That is a credential set in Cloudflare, never in this repository.
