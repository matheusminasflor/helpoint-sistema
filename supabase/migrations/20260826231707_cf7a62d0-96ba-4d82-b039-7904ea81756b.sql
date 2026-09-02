CREATE TYPE public.fin_entry_kind AS ENUM ('payable','receivable');
CREATE TYPE public.fin_entry_status AS ENUM ('pending','paid','overdue','cancelled');

CREATE TABLE public.fin_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.get_user_tenant_id(),
  kind public.fin_entry_kind NOT NULL,
  file_name text NOT NULL,
  format text NOT NULL DEFAULT 'generic',
  competence date,
  row_count integer NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_imports TO authenticated;
GRANT ALL ON public.fin_imports TO service_role;
ALTER TABLE public.fin_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_imports_select" ON public.fin_imports FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "fin_imports_insert" ON public.fin_imports FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "fin_imports_update" ON public.fin_imports FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "fin_imports_delete" ON public.fin_imports FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant_id());

CREATE TABLE public.fin_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.get_user_tenant_id(),
  kind public.fin_entry_kind NOT NULL,
  description text NOT NULL,
  category text,
  counterparty text,
  document_number text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  settled_at date,
  status public.fin_entry_status NOT NULL DEFAULT 'pending',
  payment_method text,
  cost_center text,
  competence date NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  import_id uuid REFERENCES public.fin_imports(id) ON DELETE SET NULL,
  external_id text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_entries TO authenticated;
GRANT ALL ON public.fin_entries TO service_role;
ALTER TABLE public.fin_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_entries_select" ON public.fin_entries FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id());
CREATE POLICY "fin_entries_insert" ON public.fin_entries FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "fin_entries_update" ON public.fin_entries FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant_id()) WITH CHECK (tenant_id = public.get_user_tenant_id());
CREATE POLICY "fin_entries_delete" ON public.fin_entries FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant_id());

CREATE INDEX idx_fin_entries_tenant_kind_due ON public.fin_entries (tenant_id, kind, due_date);
CREATE INDEX idx_fin_entries_tenant_competence ON public.fin_entries (tenant_id, competence);
CREATE INDEX idx_fin_entries_status ON public.fin_entries (tenant_id, status);
CREATE INDEX idx_fin_imports_tenant ON public.fin_imports (tenant_id, kind, competence);

CREATE TRIGGER fin_entries_set_updated_at BEFORE UPDATE ON public.fin_entries FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER fin_imports_set_updated_at BEFORE UPDATE ON public.fin_imports FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER fin_entries_audit AFTER INSERT OR UPDATE OR DELETE ON public.fin_entries FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();