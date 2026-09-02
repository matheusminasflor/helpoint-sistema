CREATE OR REPLACE FUNCTION public.is_allowed_upload_ext(_bucket text, _name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, storage
AS $$
  SELECT CASE
    WHEN _bucket IN ('tenant-branding','avatars','facility-maps-backgrounds')
      THEN lower(storage.extension(_name)) IN ('jpg','jpeg','png','webp','gif')
    WHEN _bucket IN ('mkt-media','pop-media')
      THEN lower(storage.extension(_name)) IN ('jpg','jpeg','png','webp','gif','mp4','mov','webm','pdf')
    WHEN _bucket IN ('rh-documents','sac-attachments','fin-purchases','ticket-attachments')
      THEN lower(storage.extension(_name)) IN ('jpg','jpeg','png','webp','gif','pdf','doc','docx','xls','xlsx','csv','txt','zip')
    WHEN _bucket = 'voice-recordings'
      THEN lower(storage.extension(_name)) IN ('webm','mp3','m4a','wav','ogg','mp4')
    ELSE true
  END
$$;

DROP POLICY IF EXISTS "safe_upload_extensions" ON storage.objects;
CREATE POLICY "safe_upload_extensions"
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (public.is_allowed_upload_ext(bucket_id, name));

DROP POLICY IF EXISTS "safe_update_extensions" ON storage.objects;
CREATE POLICY "safe_update_extensions"
ON storage.objects
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (public.is_allowed_upload_ext(bucket_id, name));