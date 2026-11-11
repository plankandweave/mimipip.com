-- Queue only future first-time opt-ins. Existing subscribers are not backfilled.
CREATE TABLE IF NOT EXISTS mimipip_welcome_email (
  signup_id INTEGER PRIMARY KEY REFERENCES mimipip_signups(id),
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  first_attempt_at INTEGER,
  payload TEXT,
  provider_id TEXT,
  accepted_at INTEGER,
  last_error TEXT
);
CREATE TRIGGER IF NOT EXISTS mimipip_queue_welcome AFTER INSERT ON mimipip_signups
BEGIN
  INSERT INTO mimipip_welcome_email(signup_id) VALUES (NEW.id);
END;
CREATE INDEX IF NOT EXISTS mimipip_welcome_due ON mimipip_welcome_email(state,next_attempt_at);
