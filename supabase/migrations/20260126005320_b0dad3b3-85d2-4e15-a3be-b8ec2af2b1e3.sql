-- Create pop_versions table for article version history
CREATE TABLE public.pop_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  pop_id UUID NOT NULL REFERENCES public.pops(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  subcategory TEXT,
  keywords TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  change_summary TEXT
);

-- Index for fast lookups by pop_id
CREATE INDEX idx_pop_versions_pop_id ON public.pop_versions(pop_id);
CREATE INDEX idx_pop_versions_tenant_id ON public.pop_versions(tenant_id);

-- Enable RLS
ALTER TABLE public.pop_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view versions in their tenant"
  ON public.pop_versions FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Supervisors can create versions"
  ON public.pop_versions FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Directors can delete versions"
  ON public.pop_versions FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));