-- A card's short reference (MIMI-XXXX-XXXX, owner 11 Nov 2026: "the shopping code can't be so big").
-- References come from HMAC(secret, id|n); code_n is the n that was free when the card was minted.
ALTER TABLE mimipip_gift_cards ADD code_n INTEGER NOT NULL DEFAULT 0 CHECK(code_n BETWEEN 0 AND 3);
