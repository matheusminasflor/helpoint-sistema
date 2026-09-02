
ALTER TABLE public.tenant_invites
  ADD COLUMN IF NOT EXISTS access_profile_id uuid REFERENCES public.access_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_profile_overrides jsonb;
