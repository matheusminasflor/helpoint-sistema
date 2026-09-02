
-- 1. Fix ticket-attachments SELECT policy
DROP POLICY IF EXISTS "Authenticated users can read ticket attachments" ON storage.objects;

CREATE POLICY "Users can read own ticket attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ticket-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2. Remove duplicate permissive pop-media policies (the ownership-scoped ones we created remain)
DROP POLICY IF EXISTS "Authenticated users can delete from pop-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update pop-media" ON storage.objects;

-- 3. Fix facility-maps-backgrounds DELETE/UPDATE
DROP POLICY IF EXISTS "Authenticated users can delete facility map backgrounds" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update facility map backgrounds" ON storage.objects;

CREATE POLICY "Users can delete own facility map backgrounds"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'facility-maps-backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own facility map backgrounds"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'facility-maps-backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);
