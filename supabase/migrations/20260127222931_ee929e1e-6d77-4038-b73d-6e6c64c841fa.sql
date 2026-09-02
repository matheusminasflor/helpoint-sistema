-- Policy to allow directors/admins to update their tenant settings
CREATE POLICY "Directors can update tenant settings" 
  ON public.tenants 
  FOR UPDATE
  USING (id = get_user_tenant_id() AND is_diretor(auth.uid()))
  WITH CHECK (id = get_user_tenant_id() AND is_diretor(auth.uid()));