# MimiPip India checkout — Peach Pop

Product: hopscotch-peach-pop, 75 × 260 cm, ₹3,999 GST-inclusive, quantity 1.
Owner packing rule (1 November 2026): outer tube diameter 83 mm, axial length shortest product side + 20 mm. Peach Pop parcel: 77 × 8.3 × 8.3 cm. This is an owner-specified packing rule, not a weighing record.

Production credentials are Sites secrets. No values belong in source or browser code. D1 DB stores MimiPip orders separately from Zyvorah. Only the scoped Razorpay order/payment transport is enabled. Legacy mutations remain blocked.

## Required before accepting a payment

- Actual finished-stock quantity and physical QC release, with stable batch identifier.
- Packed gross weight and pickup warehouse/PIN confirmation.
- Genuine portal Delhivery quote to destination PIN 411008, GST-inclusive shipping amount, reference and validity. Do not use portal fallback prices as Delhivery quotes without clearly identifying their source.
- Configure the verified facts as protected PEACH_POP_FULFILMENT_JSON: stock (integer), qcReleased (true), weightKg, pickupPin, warehouse, batch, quote: {destinationPin, shippingPaise, reference, expiresAt (epoch ms), carrier: "Delhivery"}.
- Configure a dedicated RAZORPAY_WEBHOOK_SECRET and the merchant webhook URL https://mimipip.com/api/india-checkout/webhook for payment.captured. Verify signed delivery before release. Browser return and explicit status checking also reconcile captured payments via Razorpay.
- Verify India payment capture settings and actual dispatch/notification operating process.

Do not populate missing commercial facts with examples or estimates. No production fulfilment JSON is configured at this release; creation remains blocked.

## Flow

/products/hopscotch-peach-pop → /india-checkout. Server owns ₹399900-paise price, quantity and allowed destination. Customer supplies name, email, Indian mobile and address. A private browser session token identifies the order; only its SHA256 is stored. The same token reuses the same order. Atomic conditional insertion reserves stock against a confirmed batch. Pending and ambiguous orders keep reservations until manually reconciled: do not recycle stock merely because the browser closes. Provider creation timeouts require operator reconciliation against receipt/notes before releasing or retrying.

Signed callback plus independently fetched captured payment and paid provider order are required for confirmation. Signature verification is constant-time Web Crypto. Status recovery re-fetches Razorpay records without trusting browser success. Captured amount, currency, payment ownership and refund amount are checked. Webhook duplicates are idempotent. Confirmation shows a saved MP reference and delivery details; no automatic dispatch or email claim is made.

## Validation

node --import tsx --test src/brand/commerce/checkout.test.ts uses SQLite and a simulated provider, never production payments. Covers missing fulfilment, expired quote, server totals, forged request/quantity/PIN/signature, stock reservation, repeat creation, captured-only confirmation, recovery and signed webhook duplicates.

A live paid order is NOT verified by these tests. Real payment also requires a complete customer address and user-completed payment authentication.
