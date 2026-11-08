-- Preserve the original storefront event contract inside Mimi Pip only.
CREATE OR REPLACE FUNCTION mimipip.log_site_event(
 p_token uuid,p_event text,p_handle text DEFAULT NULL,p_meta jsonb DEFAULT NULL,
 p_is_bot boolean DEFAULT NULL,p_ua_family text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO mimipip,mimipip_private,extensions,pg_temp AS $$
BEGIN
 IF p_token IS NULL OR p_event NOT IN ('view','visualize','save','sample','cart','chat','session','save_prompt','save_identify','case_study_download','film_play','film_sound','film_half','film_complete','film_cta') THEN RETURN; END IF;
 IF pg_column_size(p_meta)>65536 THEN RETURN; END IF;
 INSERT INTO mimipip.site_events(token,event,product_handle,meta,is_bot,ua_family)
 VALUES(p_token,p_event,left(p_handle,200),p_meta,p_is_bot,left(p_ua_family,40));
END;
$$;
REVOKE ALL ON FUNCTION mimipip.log_site_event(uuid,text,text,jsonb,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mimipip.log_site_event(uuid,text,text,jsonb,boolean,text) TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
