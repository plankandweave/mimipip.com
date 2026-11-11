-- Owner-approved INR 200 per sq ft includes GST. Preserve all validation and grants.
CREATE OR REPLACE FUNCTION mimipip.curated_collection_rate_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if new.kind::text = 'curated'
     and (new.category_scope is null or new.category_scope = 'wallpaper') then
    update mimipip.product_materials pm set price_per_sqft = 200
    where pm.price_per_sqft < 200 and exists (
      select 1 from mimipip.products p join mimipip.product_tags pt
      on pt.product_id = p.id
      where p.id = pm.product_id and p.category = 'wallpaper'
      and pt.tag = any(case when cardinality(new.rule_tags) > 0
                      then new.rule_tags else array[new.rule_tag] end));
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION mimipip.curated_material_rate_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare minimum_rate numeric := 200;
begin
 if exists(select 1 from mimipip.products p where p.id=new.product_id and p.handle in (
 'beyond-the-blue-willow-canal','beyond-the-blue-willow-canal-repeat','beyond-the-blue-windmill-meadows','beyond-the-blue-windmill-meadows-repeat','beyond-the-blue-lakeside-chateau','beyond-the-blue-lakeside-chateau-repeat','beyond-the-blue-woodland-stream','beyond-the-blue-woodland-stream-repeat','beyond-the-blue-orchard-pavilion','beyond-the-blue-orchard-pavilion-repeat','beyond-the-blue-harbour-sails','beyond-the-blue-harbour-sails-repeat','beyond-the-blue-heron-wetlands','beyond-the-blue-heron-wetlands-repeat','beyond-the-blue-tulip-country','beyond-the-blue-tulip-country-repeat','beyond-the-blue-mountain-lake','beyond-the-blue-mountain-lake-repeat','beyond-the-blue-italian-terrace','beyond-the-blue-italian-terrace-repeat','beyond-the-blue-moonlit-river','beyond-the-blue-moonlit-river-repeat')) then minimum_rate := 200; end if;
 if (new.price_per_sqft is null or new.price_per_sqft < minimum_rate) and mimipip.is_curated_wallpaper(new.product_id) then new.price_per_sqft := minimum_rate; end if;
 return new;
end; $function$
;

CREATE OR REPLACE FUNCTION mimipip.curated_product_rate_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if mimipip.is_curated_wallpaper(new.id) then
    update mimipip.product_materials set price_per_sqft = 200
    where product_id = new.id and price_per_sqft < 200;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION mimipip.curated_tag_rate_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if mimipip.is_curated_wallpaper(new.product_id) then
    update mimipip.product_materials set price_per_sqft = 200
    where product_id = new.product_id and price_per_sqft < 200;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION mimipip.enforce_mimi_wallpaper_base_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'mimipip', 'pg_temp'
AS $function$
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
      AND available AND price_per_sqft=200) THEN
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
  NEW.unit_price_per_sqft := 200;
  NEW.line_total := round(v_area * 200,2) * NEW.quantity + v_install + v_name;
  -- Preserve all native crop data. No minimum width, crop or opening adjustment.
  RETURN NEW;
END;
$function$
;

UPDATE mimipip.product_materials pm SET price_per_sqft=200 FROM mimipip.products p WHERE p.id=pm.product_id AND p.category='wallpaper' AND pm.price_per_sqft=236;
UPDATE mimipip.materials SET default_price_per_sqft=200 WHERE slug IN ('smooth-matt','linen-touch','self-adhesive-vinyl') AND default_price_per_sqft=236;

