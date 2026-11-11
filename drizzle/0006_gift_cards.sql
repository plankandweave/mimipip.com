ALTER TABLE mimipip_orders ADD gift_minor INTEGER NOT NULL DEFAULT 0 CHECK(gift_minor>=0 AND gift_minor<=amount);
CREATE TABLE mimipip_gift_orders (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('creating','pending','active','review')),
 amount INTEGER NOT NULL CHECK(amount>0), currency TEXT NOT NULL CHECK(currency='INR'),
 presentation TEXT NOT NULL, purchaser_email TEXT NOT NULL, recipient_email TEXT NOT NULL,
 valid_days INTEGER NOT NULL CHECK(valid_days>=0), provider_order_id TEXT UNIQUE, payment_id TEXT UNIQUE,
 created_at INTEGER NOT NULL, checked_at INTEGER NOT NULL DEFAULT 0, activated_at INTEGER, last_error TEXT
);
CREATE TABLE mimipip_gift_cards (
 id TEXT PRIMARY KEY REFERENCES mimipip_gift_orders(id), code_hash TEXT NOT NULL UNIQUE,
 initial_minor INTEGER NOT NULL CHECK(initial_minor>0), balance_minor INTEGER NOT NULL CHECK(balance_minor>=0 AND balance_minor<=initial_minor),
 currency TEXT NOT NULL CHECK(currency='INR'), status TEXT NOT NULL CHECK(status IN ('active','suspended')),
 activated_at INTEGER NOT NULL, expires_at INTEGER
);
CREATE TABLE mimipip_gift_tenders (
 order_id TEXT PRIMARY KEY REFERENCES mimipip_orders(id) ON DELETE CASCADE,
 gift_id TEXT NOT NULL REFERENCES mimipip_gift_cards(id), amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
 state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','redeemed')),
 created_at INTEGER NOT NULL, redeemed_at INTEGER
);
CREATE TRIGGER mimipip_gift_reserve_check BEFORE INSERT ON mimipip_gift_tenders BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM mimipip_gift_cards g JOIN mimipip_orders o ON o.id=NEW.order_id
  WHERE g.id=NEW.gift_id AND g.status='active' AND g.currency=o.currency AND o.status='creating'
  AND (g.expires_at IS NULL OR g.expires_at>NEW.created_at) AND g.balance_minor>=NEW.amount_minor
  AND NEW.amount_minor<=o.amount
 ) THEN RAISE(ABORT,'Gift balance is unavailable') END;
END;
CREATE TRIGGER mimipip_gift_reserve AFTER INSERT ON mimipip_gift_tenders BEGIN
 UPDATE mimipip_gift_cards SET balance_minor=balance_minor-NEW.amount_minor WHERE id=NEW.gift_id;
 UPDATE mimipip_orders SET gift_minor=NEW.amount_minor WHERE id=NEW.order_id;
 -- Full gift settlement commits with its balance debit, even if the request dies.
 UPDATE mimipip_orders SET status='paid',amount_inr=amount/100.0,updated_at=NEW.created_at WHERE id=NEW.order_id AND amount=NEW.amount_minor AND status='creating';
END;
CREATE TRIGGER mimipip_gift_tender_immutable BEFORE UPDATE OF gift_id,amount_minor,order_id ON mimipip_gift_tenders BEGIN
 SELECT RAISE(ABORT,'Gift tender is immutable');
END;
CREATE TRIGGER mimipip_gift_no_paid_delete BEFORE DELETE ON mimipip_gift_tenders WHEN OLD.state='redeemed' BEGIN
 SELECT RAISE(ABORT,'Redeemed gift tender cannot be deleted');
END;
CREATE TRIGGER mimipip_gift_release AFTER DELETE ON mimipip_gift_tenders WHEN OLD.state='reserved' BEGIN
 UPDATE mimipip_gift_cards SET balance_minor=balance_minor+OLD.amount_minor WHERE id=OLD.gift_id;
END;
CREATE TRIGGER mimipip_gift_paid AFTER UPDATE OF status ON mimipip_orders WHEN NEW.status='paid' AND OLD.status!='paid' BEGIN
 UPDATE mimipip_gift_tenders SET state='redeemed',redeemed_at=NEW.updated_at WHERE order_id=NEW.id;
END;
CREATE TABLE mimipip_gift_email (
 gift_id TEXT PRIMARY KEY REFERENCES mimipip_gift_orders(id), state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','review','held')),
 payload TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL,
 first_attempt_at INTEGER, provider_id TEXT, accepted_at INTEGER, last_error TEXT
);
CREATE TABLE mimipip_gift_limits (bucket TEXT NOT NULL, window INTEGER NOT NULL,hits INTEGER NOT NULL,PRIMARY KEY(bucket,window));
CREATE INDEX mimipip_gift_pending ON mimipip_gift_orders(status,created_at);
CREATE INDEX mimipip_gift_email_due ON mimipip_gift_email(state,next_attempt_at);
CREATE TRIGGER mimipip_gift_activate AFTER INSERT ON mimipip_gift_cards BEGIN
 UPDATE mimipip_gift_orders SET status='active',activated_at=NEW.activated_at,last_error=NULL WHERE id=NEW.id;
 INSERT INTO mimipip_gift_email(gift_id,next_attempt_at) VALUES(NEW.id,NEW.activated_at);
END;
