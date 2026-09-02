CREATE POLICY "fin purchases read own tenant" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fin-purchases' AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text);

CREATE POLICY "fin purchases insert own tenant" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fin-purchases' AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text);

CREATE POLICY "fin purchases update own tenant" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fin-purchases' AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text)
  WITH CHECK (bucket_id = 'fin-purchases' AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text);

CREATE POLICY "fin purchases delete own tenant" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fin-purchases' AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text);