CREATE OR REPLACE FUNCTION mimipip.cart_replace_item(
 p_session_token text,p_item_id uuid,p_product_handle text,p_material_slug text,
 p_width_cm numeric,p_height_cm numeric,p_area_sqft numeric,p_unit_price numeric,
 p_quantity integer,p_line_total numeric,p_crop_data jsonb DEFAULT NULL,p_preview_url text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO mimipip,mimipip_private,extensions,pg_temp AS $$
DECLARE old_item uuid; new_item uuid;
BEGIN
 SELECT i.id INTO old_item FROM mimipip.cart_items i
 JOIN mimipip.carts c ON c.id=i.cart_id JOIN mimipip.products p ON p.id=i.product_id
 WHERE i.id=p_item_id AND c.session_token=p_session_token AND c.status='open'
 AND p.handle=p_product_handle FOR UPDATE OF i;
 IF old_item IS NULL THEN RAISE EXCEPTION 'Cart item no longer available for editing'; END IF;
 new_item:=mimipip.cart_add_item(p_session_token,p_product_handle,p_material_slug,p_width_cm,p_height_cm,p_area_sqft,p_unit_price,p_quantity,p_line_total,p_crop_data,p_preview_url);
 DELETE FROM mimipip.cart_items WHERE id=old_item;
 RETURN new_item;
END $$;
REVOKE ALL ON FUNCTION mimipip.cart_replace_item(text,uuid,text,text,numeric,numeric,numeric,numeric,integer,numeric,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mimipip.cart_replace_item(text,uuid,text,text,numeric,numeric,numeric,numeric,integer,numeric,jsonb,text) TO anon,authenticated,service_role;
