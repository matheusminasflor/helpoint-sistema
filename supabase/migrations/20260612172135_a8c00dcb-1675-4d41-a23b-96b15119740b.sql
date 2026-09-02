
DROP POLICY IF EXISTS "tenant_branding_public_read" ON storage.objects;
CREATE POLICY "tenant_branding_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant-branding');

DROP POLICY IF EXISTS "tenant_branding_admin_insert" ON storage.objects;
CREATE POLICY "tenant_branding_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-branding'
    AND public.is_admin_or_higher(auth.uid())
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

DROP POLICY IF EXISTS "tenant_branding_admin_update" ON storage.objects;
CREATE POLICY "tenant_branding_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-branding'
    AND public.is_admin_or_higher(auth.uid())
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

DROP POLICY IF EXISTS "tenant_branding_admin_delete" ON storage.objects;
CREATE POLICY "tenant_branding_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-branding'
    AND public.is_admin_or_higher(auth.uid())
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );
