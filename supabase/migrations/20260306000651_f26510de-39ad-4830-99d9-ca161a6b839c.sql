
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-recordings', 'voice-recordings', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload voice recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'voice-recordings');

CREATE POLICY "Anyone can read voice recordings"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'voice-recordings');

CREATE POLICY "Users can delete their own voice recordings"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'voice-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);
