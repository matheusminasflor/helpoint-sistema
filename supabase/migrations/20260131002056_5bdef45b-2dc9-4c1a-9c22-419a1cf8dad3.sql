-- Create storage bucket for facility map background images
INSERT INTO storage.buckets (id, name, public)
VALUES ('facility-maps-backgrounds', 'facility-maps-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files to this bucket
CREATE POLICY "Users can upload map backgrounds"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'facility-maps-backgrounds' 
  AND auth.uid() IS NOT NULL
);

-- Allow authenticated users to read files from this bucket
CREATE POLICY "Users can view map backgrounds"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'facility-maps-backgrounds');

-- Allow authenticated users to update their files
CREATE POLICY "Users can update map backgrounds"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'facility-maps-backgrounds')
WITH CHECK (bucket_id = 'facility-maps-backgrounds');

-- Allow authenticated users to delete their files
CREATE POLICY "Users can delete map backgrounds"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'facility-maps-backgrounds');