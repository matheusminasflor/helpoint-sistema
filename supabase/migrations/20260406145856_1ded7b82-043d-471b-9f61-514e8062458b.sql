
-- Fix ticket-attachments INSERT policy
DROP POLICY IF EXISTS "Authenticated users can upload ticket attachments" ON storage.objects;

CREATE POLICY "Users can upload own ticket attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ticket-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
