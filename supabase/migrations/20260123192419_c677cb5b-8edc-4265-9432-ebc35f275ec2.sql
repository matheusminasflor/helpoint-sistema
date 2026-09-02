-- Tabela de POPs (Procedimentos Operacionais Padrão)
CREATE TABLE public.pops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  keywords TEXT[] DEFAULT '{}',
  related_pattern_id UUID,
  views_count INTEGER DEFAULT 0,
  solved_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de padrões detectados
CREATE TABLE public.ticket_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  pattern_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  occurrence_count INTEGER DEFAULT 1,
  sample_ticket_ids UUID[] DEFAULT '{}',
  suggested_pop_id UUID,
  keywords TEXT[] DEFAULT '{}',
  is_reviewed BOOLEAN DEFAULT false,
  last_occurrence TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de interações com POPs
CREATE TABLE public.pop_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  pop_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('viewed', 'solved', 'proceeded')),
  ticket_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Foreign keys
ALTER TABLE public.pops ADD CONSTRAINT pops_related_pattern_fkey 
  FOREIGN KEY (related_pattern_id) REFERENCES public.ticket_patterns(id) ON DELETE SET NULL;

ALTER TABLE public.ticket_patterns ADD CONSTRAINT ticket_patterns_suggested_pop_fkey 
  FOREIGN KEY (suggested_pop_id) REFERENCES public.pops(id) ON DELETE SET NULL;

ALTER TABLE public.pop_interactions ADD CONSTRAINT pop_interactions_pop_fkey 
  FOREIGN KEY (pop_id) REFERENCES public.pops(id) ON DELETE CASCADE;

ALTER TABLE public.pop_interactions ADD CONSTRAINT pop_interactions_ticket_fkey 
  FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.pops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pop_interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies para POPs
CREATE POLICY "Users can view POPs in their tenant" ON public.pops
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Supervisors can create POPs" ON public.pops
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can update POPs" ON public.pops
  FOR UPDATE USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Directors can delete POPs" ON public.pops
  FOR DELETE USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));

-- RLS Policies para ticket_patterns
CREATE POLICY "Supervisors can view patterns in their tenant" ON public.ticket_patterns
  FOR SELECT USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can create patterns" ON public.ticket_patterns
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can update patterns" ON public.ticket_patterns
  FOR UPDATE USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Directors can delete patterns" ON public.ticket_patterns
  FOR DELETE USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));

-- RLS Policies para pop_interactions
CREATE POLICY "Users can view their own interactions" ON public.pop_interactions
  FOR SELECT USING (tenant_id = get_user_tenant_id() AND (user_id = auth.uid() OR is_supervisor_or_higher(auth.uid())));

CREATE POLICY "Users can create interactions" ON public.pop_interactions
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

-- Triggers para updated_at
CREATE TRIGGER update_pops_updated_at
  BEFORE UPDATE ON public.pops
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_ticket_patterns_updated_at
  BEFORE UPDATE ON public.ticket_patterns
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger para injetar tenant_id
CREATE TRIGGER inject_tenant_pops
  BEFORE INSERT ON public.pops
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER inject_tenant_patterns
  BEFORE INSERT ON public.ticket_patterns
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER inject_tenant_pop_interactions
  BEFORE INSERT ON public.pop_interactions
  FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();