-- PROPOSED additive Mimi-only price authority. No shared schema changes.
-- Apply after isolated schema creation and before enabling cart APIs.
-- INR gross base price only. US conversion/checkout remains D1/STORE_PAY authority.
CREATE OR REPLACE FUNCTION mimipip.enforce_mimi_wallpaper_base_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, mimipip, pg_temp
AS $mimi$
DECLARE v_area numeric; v_category text;
BEGIN
  SELECT category INTO v_category FROM mimipip.products WHERE id=NEW.product_id;
  IF v_category IS DISTINCT FROM 'wallpaper' THEN RETURN NEW; END IF;
  IF NEW.width_cm IS NULL OR NEW.height_cm IS NULL
    OR NEW.width_cm::text IN ('NaN','Infinity','-Infinity')
    OR NEW.height_cm::text IN ('NaN','Infinity','-Infinity')
    OR NEW.width_cm < 10 OR NEW.height_cm < 10 OR NEW.width_cm > 3000 OR NEW.height_cm > 3000 THEN
    RAISE EXCEPTION 'Enter valid wall dimensions.' USING ERRCODE='23514';
  END IF;
  IF NEW.quantity IS NULL OR NEW.quantity NOT BETWEEN 1 AND 99 THEN
    RAISE EXCEPTION 'Wallpaper quantity must be between 1 and 99.' USING ERRCODE='23514';
  END IF;
  IF COALESCE(NEW.crop_data->'installation'->>'total','0')::numeric <> 0
    OR COALESCE(NEW.crop_data->'personalisation'->>'fee','0')::numeric <> 0
    OR COALESCE(NEW.crop_data->'personalization'->>'fee','0')::numeric <> 0
    OR COALESCE(NEW.crop_data->'exclusivity'->>'requested','false')::boolean THEN
    RAISE EXCEPTION 'Paid installation, personalisation and exclusivity require a separately approved quote.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM mimipip.product_materials
    WHERE product_id=NEW.product_id AND material_id=NEW.material_id
      AND available AND price_per_sqft=236) THEN
    RAISE EXCEPTION 'This wallpaper surface is not available at the current Mimi Pip price.' USING ERRCODE='23514';
  END IF;
  v_area := GREATEST(20::numeric, NEW.width_cm * NEW.height_cm / 929.0304::numeric);
  NEW.area_sqft := round(v_area,3);
  NEW.unit_price_per_sqft := 236;
  NEW.line_total := round(v_area * 236,2) * NEW.quantity;
  -- Preserve all native crop data. No minimum width, crop or opening adjustment.
  RETURN NEW;
END;
$mimi$;
ALTER FUNCTION mimipip.enforce_mimi_wallpaper_base_price() OWNER TO postgres;
REVOKE ALL ON FUNCTION mimipip.enforce_mimi_wallpaper_base_price() FROM PUBLIC, anon, authenticated;
-- Run after legacy native triggers so their whole-rupee calculation cannot win.
DROP TRIGGER IF EXISTS zz_mimi_wallpaper_base_price ON mimipip.cart_items;
CREATE TRIGGER zz_mimi_wallpaper_base_price BEFORE INSERT OR UPDATE ON mimipip.cart_items
FOR EACH ROW EXECUTE FUNCTION mimipip.enforce_mimi_wallpaper_base_price();
