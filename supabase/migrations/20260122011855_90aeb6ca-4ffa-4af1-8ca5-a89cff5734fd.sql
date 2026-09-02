-- Tabela para gerenciar categorias dinâmicas dos módulos TI
CREATE TABLE public.ti_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('inventory', 'contracts', 'licenses', 'maintenances')),
  name text NOT NULL,
  parent_id uuid REFERENCES public.ti_categories(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Índice único para categorias raiz (parent_id IS NULL)
CREATE UNIQUE INDEX idx_ti_categories_unique_root 
ON public.ti_categories(tenant_id, module, name) 
WHERE parent_id IS NULL;

-- Índice único para subcategorias (parent_id IS NOT NULL)
CREATE UNIQUE INDEX idx_ti_categories_unique_child 
ON public.ti_categories(tenant_id, module, name, parent_id) 
WHERE parent_id IS NOT NULL;

-- Índices para performance
CREATE INDEX idx_ti_categories_tenant_module ON public.ti_categories(tenant_id, module);
CREATE INDEX idx_ti_categories_parent ON public.ti_categories(parent_id);

-- Trigger para updated_at
CREATE TRIGGER update_ti_categories_updated_at
  BEFORE UPDATE ON public.ti_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger para injetar tenant_id automaticamente
CREATE TRIGGER inject_ti_categories_tenant_id
  BEFORE INSERT ON public.ti_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.inject_tenant_id();

-- Enable RLS
ALTER TABLE public.ti_categories ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view categories in their tenant"
ON public.ti_categories FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Supervisors can create categories"
ON public.ti_categories FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Supervisors can update categories"
ON public.ti_categories FOR UPDATE
USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()))
WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

CREATE POLICY "Directors can delete categories"
ON public.ti_categories FOR DELETE
USING (tenant_id = get_user_tenant_id() AND is_diretor(auth.uid()));