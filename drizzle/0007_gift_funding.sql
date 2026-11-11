-- A gift card funded by a director instead of a card payment (owner, 11 November 2026).
-- One row per funded gift: who funded it, the books reference, and a watch on the
-- original Razorpay order, which cannot be cancelled: a payment that lands on it later
-- settles the director's receivable and never mints or emails a second time.
CREATE TABLE mimipip_gift_funding (
 gift_id TEXT PRIMARY KEY REFERENCES mimipip_gift_orders(id),
 funded_by TEXT NOT NULL CHECK(funded_by IN ('director:roheena')),
 reference TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
 provider_order_id TEXT,
 issued_at INTEGER NOT NULL,
 late_payment_id TEXT,
 checked_at INTEGER NOT NULL DEFAULT 0
);
