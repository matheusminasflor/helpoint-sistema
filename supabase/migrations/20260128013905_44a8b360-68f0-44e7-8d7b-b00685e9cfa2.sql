-- Add visibility columns to pops table
ALTER TABLE public.pops
ADD COLUMN visibility_type TEXT NOT NULL DEFAULT 'all';

ALTER TABLE public.pops
ADD COLUMN visibility_departments TEXT[] DEFAULT '{}';

-- Add check constraint for visibility_type
ALTER TABLE public.pops
ADD CONSTRAINT pops_visibility_type_check 
CHECK (visibility_type IN ('all', 'departments', 'viewers_only'));

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view POPs in their tenant" ON public.pops;

-- Create new SELECT policy with visibility logic
CREATE POLICY "Users can view visible POPs"
  ON public.pops FOR SELECT
  USING (
    tenant_id = get_user_tenant_id()
    AND (
      -- Supervisors and above can see all POPs
      is_supervisor_or_higher(auth.uid())
      -- Other users pass through visibility filter
      OR (
        is_active = true
        AND (
          -- Type 'all': everyone can see
          visibility_type = 'all'
          -- Type 'viewers_only': only viewers
          OR (visibility_type = 'viewers_only' AND has_role(auth.uid(), 'viewer'))
          -- Type 'departments': user must be in one of the departments
          OR (visibility_type = 'departments' AND (
            (SELECT department FROM public.profiles WHERE id = auth.uid()) = ANY(visibility_departments)
          ))
        )
      )
    )
  );