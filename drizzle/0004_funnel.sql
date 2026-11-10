-- The shop's funnel, counted on our own server: one row per IST day, event, design and country.
-- Events: product_view, add_to_cart, checkout_started, paid. Read by the OS at GET /api/checkout/funnel.
CREATE TABLE IF NOT EXISTS mimipip_funnel (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  slug TEXT NOT NULL,
  country TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, slug, country)
);
