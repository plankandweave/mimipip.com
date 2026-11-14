# Mimi Pip registries

Baby Registry and Gift Registry share one implementation. Gift Registry offers Birthday, A new room, Family celebration and Just because. Birthday is displayed as Birthday Registry to guests. No separate registry is created for prizes or return gifts.

## Customer flow

- `/registry` explains the two choices and accepts a full sharing link or 128-bit registry code.
- `/registry/manage` requires the existing server-verified, confirmed retail account. Owners create/edit/close registries, set a private recipient address, save configured catalogue products, mark favourites and read confirmed gift messages.
- Product configurators and both cart representations provide Add to registry. The server revalidates the same selection used by checkout. Bespoke/custom-upload services and installation are not eligible in this release.
- `/registry/[code]` is unlisted, noindex, no-store and no-referrer. Guests can filter the list and buy a single requested unit with a personal message, without an account. Each gift has its own checkout and recovery token. Link and downloadable QR sharing are explicit; no messages are sent automatically.
- Requested quantities are capped at 99. An owner can have 20 registries and each registry up to 100 gift selections.

## Payments and privacy

The existing payment service and fulfilment remain authoritative. A registry checkout derives the product configuration, country, recipient and delivery address on the server; guest-supplied product prices/addresses are ignored. Gift-card tender and group contributions are not supported for registry checkout in this release. A private recipient address is retained for fulfilment but is never returned in the public registry, guest payment-create or guest payment-status response. Donor contact and message live in the private order fulfilment metadata and appear only to the registry owner.

A D1 BEFORE INSERT trigger reserves one requested unit atomically across guests. Creating/pending/review orders count as held; only paid orders count as purchased. Retries reuse the payment token. A held/purchased item cannot be removed. Changing registry details does not rewrite existing orders. Closing a registry prevents new payments while existing payments still reconcile.

After 90 minutes the regular payment sweep releases an abandoned pending reservation only when the gateway positively returns an empty payments array. Unknown results, gateway errors and any attempted payment retain the reservation. Late captures on expired orders go to review, never fulfilment. An interrupted creating order with no published provider order is removed after five minutes. Conditional deletion cannot remove a pending order; a late provider response cannot expose a payment window after its local record was removed.

A registry code is a bearer sharing link. There is no public name search or search-engine discovery of individual lists. No child portrait, birth date, or address is exposed by default. Owners choose the public celebration date, title and message.

## Release

Built on `plankandweave/mimipip.com`, normal GitHub main deployment only. `src/brand/registry/schema.ts` installs its tables/indexes/triggers idempotently on registry API access. `drizzle/0010_registries.sql` mirrors that schema for the record. No Supabase schema change, new provider, paid generation, voucher activation, live order or live email is needed for implementation checks.

Local SQLite tests cover ownership, canonical selection, address redaction, concurrent guests, idempotent purchase reconciliation, closure, pending release and late payment. Browser previews using a sample birthday registry are fixtures, not real accounts or orders. Production owner sign-in/create, D1 initialization and a real paid gift still require release validation.

## Later additions

Group funding needs explicit unused-credit/refund rules. Other future additions: optional public name search, registry gift-card destination, portrait upload, and donor email receipts. This version reuses normal fulfilment to the recipient and gives the donor an on-screen order reference; it does not promise a donor email receipt.
