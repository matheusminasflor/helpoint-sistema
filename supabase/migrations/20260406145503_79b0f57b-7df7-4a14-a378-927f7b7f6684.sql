
-- 1. Fix user_roles cross-tenant privilege escalation
DROP POLICY IF EXISTS "Directors can manage roles" ON public.user_roles;

CREATE POLICY "Directors can manage roles within tenant"
ON public.user_roles FOR ALL TO authenticated
USING (
  is_diretor(auth.uid()) AND
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = user_roles.user_id AND profiles.tenant_id = get_user_tenant_id())
)
WITH CHECK (
  is_diretor(auth.uid()) AND
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = user_roles.user_id AND profiles.tenant_id = get_user_tenant_id())
);

-- 2. Fix audit_logs INSERT forgery
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

CREATE POLICY "System can insert audit logs"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

-- 3. Make voice-recordings bucket private
UPDATE storage.buckets SET public = false WHERE id = 'voice-recordings';

-- Fix voice-recordings SELECT policy
DROP POLICY IF EXISTS "Anyone can read voice recordings" ON storage.objects;

CREATE POLICY "Users can read own voice recordings"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'voice-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 4. Fix mkt-media DELETE/UPDATE policies
DROP POLICY IF EXISTS "Authenticated users can delete mkt media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update mkt media" ON storage.objects;

CREATE POLICY "Users can delete own mkt media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'mkt-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own mkt media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'mkt-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 5. Fix pop-media DELETE/UPDATE policies
DROP POLICY IF EXISTS "Authenticated users can delete pop media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update pop media" ON storage.objects;

CREATE POLICY "Users can delete own pop media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'pop-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own pop media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'pop-media' AND (storage.foldername(name))[1] = auth.uid()::text);
