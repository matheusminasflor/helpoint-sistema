-- Adicionar 'tickets' ao módulo de categorias (remover constraint antiga e adicionar nova)
ALTER TABLE public.ti_categories 
DROP CONSTRAINT IF EXISTS ti_categories_module_check;

-- Enum para tipos de campo de formulário
CREATE TYPE form_field_type AS ENUM (
  'text', 'textarea', 'email', 'phone', 
  'select', 'checkbox', 'radio', 'date', 'file'
);

-- Tabela de campos do formulário
CREATE TABLE public.ticket_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  category_id uuid NOT NULL REFERENCES public.ti_categories(id) ON DELETE CASCADE,
  label text NOT NULL,
  field_type form_field_type NOT NULL DEFAULT 'text',
  options jsonb DEFAULT '[]',
  is_required boolean NOT NULL DEFAULT false,
  placeholder text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela de respostas dos formulários
CREATE TABLE public.ticket_form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.ticket_form_fields(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, field_id)
);

-- Habilitar RLS
ALTER TABLE public.ticket_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_form_responses ENABLE ROW LEVEL SECURITY;

-- Políticas para campos de formulário
CREATE POLICY "Users can view form fields in their tenant"
ON public.ticket_form_fields FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Supervisors can manage form fields"
ON public.ticket_form_fields FOR ALL
USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()))
WITH CHECK (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));

-- Políticas para respostas
CREATE POLICY "Users can view responses in their tenant"
ON public.ticket_form_responses FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can create responses"
ON public.ticket_form_responses FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id());

-- Trigger para updated_at
CREATE TRIGGER handle_updated_at_ticket_form_fields
BEFORE UPDATE ON public.ticket_form_fields
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger para injetar tenant_id
CREATE TRIGGER inject_tenant_id_ticket_form_fields
BEFORE INSERT ON public.ticket_form_fields
FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();

CREATE TRIGGER inject_tenant_id_ticket_form_responses
BEFORE INSERT ON public.ticket_form_responses
FOR EACH ROW EXECUTE FUNCTION public.inject_tenant_id();