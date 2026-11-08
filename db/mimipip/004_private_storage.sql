-- Additive private storage on the existing Magnitude backend.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES
 ('mimipip-board-images','mimipip-board-images',false,10485760,ARRAY['image/jpeg','image/png','image/webp']),
 ('mimipip-order-previews','mimipip-order-previews',false,10485760,ARRAY['image/jpeg','image/png','image/webp']),
 ('mimipip-order-copies','mimipip-order-copies',false,20971520,ARRAY['application/pdf']),
 ('mimipip-print-files','mimipip-print-files',false,52428800,NULL)
ON CONFLICT(id) DO NOTHING;
DROP POLICY IF EXISTS mimipip_board_owner ON storage.objects;
CREATE POLICY mimipip_board_owner ON storage.objects FOR ALL TO authenticated
USING (bucket_id='mimipip-board-images' AND mimipip.is_email_verified() AND (storage.foldername(name))[1] IN (SELECT id::text FROM mimipip.customers WHERE auth_user_id=(SELECT auth.uid())))
WITH CHECK (bucket_id='mimipip-board-images' AND mimipip.is_email_verified() AND (storage.foldername(name))[1] IN (SELECT id::text FROM mimipip.customers WHERE auth_user_id=(SELECT auth.uid())));
