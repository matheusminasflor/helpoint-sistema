
-- 1) SAC categories: restrict to authenticated users in the same tenant
DROP POLICY IF EXISTS "Anyone can read active SAC categories" ON public.sac_categories;
CREATE POLICY "Tenant users can read active SAC categories"
  ON public.sac_categories FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (
      tenant_id = public.get_user_tenant_id()
      OR tenant_id = public.get_customer_tenant_id()
    )
  );

-- 2) SAC form fields: same restriction
DROP POLICY IF EXISTS "Anyone can read active SAC form fields" ON public.sac_form_fields;
CREATE POLICY "Tenant users can read active SAC form fields"
  ON public.sac_form_fields FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (
      tenant_id = public.get_user_tenant_id()
      OR tenant_id = public.get_customer_tenant_id()
    )
  );

-- 3) Storage: sac-attachments — remove anon upload, enforce tenant-prefixed paths
DROP POLICY IF EXISTS "Anon can upload SAC attachments via public form" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload SAC attachments" ON storage.objects;
DROP POLICY IF EXISTS "Owners and tenant staff can read SAC attachments" ON storage.objects;

CREATE POLICY "SAC attachments upload (tenant-scoped)"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sac-attachments'
    AND (
      -- Staff uploading under their tenant folder
      (storage.foldername(name))[1] = (public.get_user_tenant_id())::text
      OR
      -- Customer uploading under their tenant + own user folder
      (
        (storage.foldername(name))[1] = (public.get_customer_tenant_id())::text
        AND (storage.foldername(name))[2] = 'customer'
        AND (storage.foldername(name))[3] = (auth.uid())::text
      )
    )
  );

CREATE POLICY "SAC attachments read (tenant-scoped)"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sac-attachments'
    AND (
      owner = auth.uid()
      -- Staff: same tenant
      OR (storage.foldername(name))[1] = (public.get_user_tenant_id())::text
      -- Customer: own files within their tenant
      OR (
        (storage.foldername(name))[1] = (public.get_customer_tenant_id())::text
        AND (storage.foldername(name))[2] = 'customer'
        AND (storage.foldername(name))[3] = (auth.uid())::text
      )
    )
  );
