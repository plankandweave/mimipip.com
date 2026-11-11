-- Mimi Pip website wallpaper uses one self-adhesive material at ₹200/sq ft.
-- Preserve historical material rows for paid orders, but stop offering them.
BEGIN;

UPDATE mimipip.materials
SET install_type = 'self_adhesive'
WHERE slug = 'self-adhesive-vinyl';

INSERT INTO mimipip.product_materials (product_id, material_id, price_per_sqft, available)
SELECT DISTINCT pm.product_id, adhesive.id, 200, true
FROM mimipip.product_materials pm
JOIN mimipip.products p ON p.id = pm.product_id
CROSS JOIN mimipip.materials adhesive
WHERE p.category = 'wallpaper' AND p.status = 'active'
  AND p.handle <> 'bespoke-customisation'
  AND pm.available
  AND adhesive.slug = 'self-adhesive-vinyl'
ON CONFLICT (product_id, material_id)
DO UPDATE SET price_per_sqft = 200, available = true;

UPDATE mimipip.product_materials pm
SET available = false
FROM mimipip.products p, mimipip.materials m
WHERE pm.product_id = p.id AND pm.material_id = m.id
  AND p.category = 'wallpaper' AND p.status = 'active'
  AND m.slug <> 'self-adhesive-vinyl';

-- The existing cart trigger already uses the approved ₹200 rate. Keep its
-- installation and personalisation checks intact.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('mimipip.enforce_mimi_wallpaper_base_price()'::regprocedure)
  INTO definition;
  IF definition IS NULL OR definition NOT LIKE '%price_per_sqft=200%'
     OR definition NOT LIKE '%NEW.unit_price_per_sqft := 200%'
     OR definition NOT LIKE '%v_area * 200%' THEN
    RAISE EXCEPTION 'Wallpaper pricing trigger differs from the reviewed version';
  END IF;
END;
$migration$;

COMMIT;
