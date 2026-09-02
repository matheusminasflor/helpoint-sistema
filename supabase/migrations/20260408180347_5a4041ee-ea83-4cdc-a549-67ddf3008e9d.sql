
-- Add department to tenant_invites
ALTER TABLE public.tenant_invites
ADD COLUMN department text;

-- Add permissions jsonb to user_module_access
ALTER TABLE public.user_module_access
ADD COLUMN permissions jsonb NOT NULL DEFAULT '{}';
