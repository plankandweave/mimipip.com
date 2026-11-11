# Mimi Pip gift-card release

## This release

Three supplied artwork styles are preserved without recolouring: Blue Daisy, Little Sunshine, Coral Ribbon. Occasion is an independent selection: baby shower, newborn and birthdays 1–12. Names use the site's rounded Fredoka display face. Amounts use Indian digit grouping and the rupee symbol; mimipip.com is on the card. The current customer interface is INR-only. US denominations and culturally appropriate wording are a separate future market configuration, not converted INR prices.

The page offers private, client-side previews and printable HTML. Recipient details are not sent to a server while previewing. The shared renderer supports a card inside an email body, printable output, safe text escaping, and optional image output for email-client font consistency. No personal gift proof is committed to the public repository.

## Verified integration boundaries

Mimi Pip's native checkout records physical orders in D1 and verifies captured Razorpay payment details server-side. Its STORE_PAY binding can create/read Razorpay orders and payments, verify signatures and forward physical orders to the OS. The existing native checkout has no gift-card tender or balance ledger. The inherited Zyvorah gift routes depend on separate Supabase RPCs and are not wired into the Mimi Pip native checkout. They remain unreachable. Existing welcome-email code uses the Mimi Pip sender and a durable delivery queue; that does not establish gift-card delivery readiness.

GET /api/gift-card/readiness returns open:false and currencies:[INR]. All other gift-card API operations return503 without creating provider orders, codes, emails or balances. No feature flag can bypass this boundary in this release.

## Required before sales or activation

- Establish validity and permitted custom-amount range; the supplied example date is not a policy decision.
- Implement isolated, high-entropy gift codes stored hashed; currency-specific balances with atomic reserve/redeem/release and idempotency per order.
- Connect gift tender to native checkout and correctly represent gift-funded versus cash-funded values in OS accounting, including fully gift-funded orders. Never record a synthetic Razorpay payment.
- Issue only after independently verifying captured payment, or through an authenticated, audited merchant-funded issuance action.
- Add durable recipient delivery with idempotent provider sends and protected card/print access. Verify sender-domain readiness and prevent duplicate delivery on retries.
- Validate concurrent redemption, capture reconciliation, failed/abandoned payment release, currency mismatch, refund policy and privacy boundaries before enabling purchases.

For the owner-requested personal gift, prepare a proof marked not sent/not activated. Do not email the recipient before the owner's requested proof review. Proofs must not imply a live shopping code or approved validity period.
