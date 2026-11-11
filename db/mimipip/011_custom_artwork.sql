CREATE TABLE mimipip.custom_artworks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user text NOT NULL,
 cart_owner_hash text NOT NULL CHECK(cart_owner_hash ~ '^[a-f0-9]{64}$'),
 image_ref text NOT NULL,
 width integer NOT NULL CHECK(width>0), height integer NOT NULL CHECK(height>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mimipip.custom_artworks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mimipip.custom_artworks FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON mimipip.custom_artworks TO service_role;
CREATE INDEX custom_artwork_owner ON mimipip.custom_artworks(cart_owner_hash,id);
INSERT INTO mimipip.products(handle,title,description,status,vendor,category,price_tier,flat_verified)
VALUES ('custom-wallpaper','Your Own Image','Your artwork, sized to your wall.','draft','Mimi Pip','wallpaper','standard',true)
ON CONFLICT(handle) DO NOTHING;
INSERT INTO mimipip.product_materials(product_id,material_id,price_per_sqft,available)
SELECT p.id,m.id,200,true FROM mimipip.products p CROSS JOIN mimipip.materials m
WHERE p.handle='custom-wallpaper' AND m.slug='self-adhesive-vinyl'
ON CONFLICT(product_id,material_id) DO UPDATE SET price_per_sqft=200,available=true;
UPDATE mimipip.products SET status='active' WHERE handle='custom-wallpaper';
