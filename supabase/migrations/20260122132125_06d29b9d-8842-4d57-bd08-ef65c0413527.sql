-- Invite-based registration: create tenant_invites and remove open profile signup insert policy

-- 1) Create invites table
CREATE TABLE IF NOT EXISTS public.tenant_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'colaborador'::app_role,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_invites_tenant_email_active_idx
ON public.tenant_invites (tenant_id, lower(email))
WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS tenant_invites_token_lookup_idx
ON public.tenant_invites (id);

ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;

-- Supervisors+ can manage invites in their tenant
DROP POLICY IF EXISTS "Supervisors can manage invites" ON public.tenant_invites;
CREATE POLICY "Supervisors can manage invites"
ON public.tenant_invites
FOR ALL
TO authenticated
USING (
  tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
)
WITH CHECK (
  tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

-- 2) Remove open signup profile insert policy (will be handled by backend invite acceptance)
DROP POLICY IF EXISTS "Allow insert during signup" ON public.profiles;

-- (Keep UPDATE/SELECT policies as previously defined)
