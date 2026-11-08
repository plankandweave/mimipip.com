-- Mimi-only original name-cloud fee: once per configured line. Quotes included.
-- Apply after isolated schema creation and before enabling cart APIs.
-- INR gross base price only. US conversion/checkout remains D1/STORE_PAY authority.
CREATE OR REPLACE FUNCTION mimipip.enforce_mimi_wallpaper_base_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, mimipip, pg_temp
AS $mimi$
DECLARE v_area numeric; v_category text; v_install numeric := 0; v_name numeric := 0; v_text text;
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
  IF COALESCE(NEW.crop_data->'personalization'->>'fee','0')::numeric <> 0
    OR COALESCE(NEW.crop_data->'exclusivity'->>'requested','false')::boolean THEN
    RAISE EXCEPTION 'Paid personalisation and exclusivity require a separately approved quote.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM mimipip.product_materials
    WHERE product_id=NEW.product_id AND material_id=NEW.material_id
      AND available AND price_per_sqft=236) THEN
    RAISE EXCEPTION 'This wallpaper surface is not available at the current Mimi Pip price.' USING ERRCODE='23514';
  END IF;
  v_area := GREATEST(20::numeric, NEW.width_cm * NEW.height_cm / 929.0304::numeric);
  IF COALESCE(NEW.crop_data->'installation','null'::jsonb) <> 'null'::jsonb THEN
    IF round(NEW.width_cm * NEW.height_cm / 929.0304::numeric,3) < 80
      OR COALESCE(NEW.crop_data->'installation'->>'ratePerSqft','0')::numeric <> 35
      OR COALESCE(NEW.crop_data->'installation'->>'total','0')::numeric <= 0 THEN
      RAISE EXCEPTION 'Check installation selection and minimum 80 sq ft wall area.' USING ERRCODE='23514';
    END IF;
    v_install := round(round(NEW.width_cm * NEW.height_cm / 929.0304::numeric,3) * 35 * NEW.quantity * 1.18);
    NEW.crop_data := jsonb_set(NEW.crop_data,'{installation}',jsonb_build_object('ratePerSqft',35,'total',v_install));
  END IF;
  IF COALESCE(NEW.crop_data->'textOverlay','null'::jsonb) <> 'null'::jsonb THEN
    v_text := btrim(NEW.crop_data->'textOverlay'->>'text');
    IF COALESCE(NEW.crop_data->'textOverlay'->>'kind','') NOT IN ('cloud','quote') OR COALESCE(length(v_text),0) = 0
      OR COALESCE(NEW.crop_data->'approval'->>'approvedAt','') = '' THEN
      RAISE EXCEPTION 'Approve the lettering preview first.' USING ERRCODE='23514';
    END IF;
    IF NEW.crop_data->'textOverlay'->>'kind' = 'cloud' THEN
      IF length(v_text) > 24 OR position(chr(10) in v_text) > 0 THEN
        RAISE EXCEPTION 'Use a name of up to 24 characters on one line.' USING ERRCODE='23514';
      END IF;
      v_name := 500;
      NEW.crop_data := jsonb_set(NEW.crop_data,'{personalisation}',jsonb_build_object('childName',v_text,'fee',500));
    ELSE
      NEW.crop_data := jsonb_set(NEW.crop_data,'{personalisation}','null'::jsonb);
    END IF;
  ELSIF COALESCE(NEW.crop_data->'personalisation','null'::jsonb) <> 'null'::jsonb THEN
    RAISE EXCEPTION 'Approve the name cloud preview first.' USING ERRCODE='23514';
  END IF;
  NEW.area_sqft := round(v_area,3);
  NEW.unit_price_per_sqft := 236;
  NEW.line_total := round(v_area * 236,2) * NEW.quantity + v_install + v_name;
  -- Preserve all native crop data. No minimum width, crop or opening adjustment.
  RETURN NEW;
END;
$mimi$;
