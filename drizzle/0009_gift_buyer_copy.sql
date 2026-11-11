-- The buyer's copy of every gift email (owner, 11 Nov 2026: "a copy of the email should always go to the sender
-- of the gift as well … build that in such that it's always that way"). One row per gift, its own provider
-- idempotency key, written once the recipient's email has been accepted.
CREATE TABLE mimipip_gift_copy (
 gift_id TEXT PRIMARY KEY REFERENCES mimipip_gift_orders(id),
 to_email TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','review')),
 payload TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL,
 first_attempt_at INTEGER, provider_id TEXT, accepted_at INTEGER, last_error TEXT
);
