# MimiPip welcome email

The existing `RESEND_API_KEY` on `mimipip-com` sends from the already verified `hello@mimipip.com`. No new service/account is required. Only first-time opt-ins inserted after migration 0005 queue a welcome; historical subscribers and repeated signup requests do not.

Before the first deployment, apply `drizzle/0005_welcome_email.sql` to `mimipip-orders` using the existing authenticated Cloudflare operator connection. It is additive and idempotent. The GitHub deploy token intentionally has no D1 import permission; do not expand its scope to run this migration. Website code continues to deploy only via GitHub.

The worker sends after signup using waitUntil and retries every five minutes. D1 stores the exact provider payload, provider id, acceptance time, attempts and status. Provider acceptance is not claimed as inbox delivery. Resend idempotency keys expire after 24 hours, so ambiguous attempts stop at 23 hours and become `review`, preventing a late duplicate. Permanent provider rejections are held for review. Unsubscribed pending rows are cancelled. Do not manually requeue an ambiguous send without checking its provider record.

Inspect queue health without listing subscriber addresses:

```sql
SELECT state,COUNT(*) FROM mimipip_welcome_email GROUP BY state;
```

For `review`, inspect `last_error` and the provider record privately. Never log credentials or subscriber content. A genuine new signup receives the welcome, not an automatic campaign subscription at Resend; consent remains in MimiPip D1. Future marketing campaigns must honor `unsubscribed_at`.

The HTML and plain text link to the existing scanner-safe unsubscribe page. A GET does not unsubscribe; the customer confirms with Stop emails. Verify using Resend's delivered test address only, not a real customer or owner mailbox.
