-- Restrict audit log visibility to supervisors and above

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Replace permissive tenant-wide SELECT policy
DROP POLICY IF EXISTS "Users can view audit logs of their tenant" ON public.audit_logs;

CREATE POLICY "Supervisors can view audit logs"
ON public.audit_logs
FOR SELECT
USING (
  tenant_id = get_user_tenant_id()
  AND is_supervisor_or_higher(auth.uid())
);

-- Keep INSERT policy for total auditing (idempotent)
-- (No changes needed; audit_trigger_fn writes with auth.uid())
