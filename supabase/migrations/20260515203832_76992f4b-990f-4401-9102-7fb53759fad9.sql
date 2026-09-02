
-- Helper functions FIRST
CREATE OR REPLACE FUNCTION public.is_member_or_higher_role()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'member')
  )
$$;

-- Add 'customer' role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'customer';

-- ============================================
-- customer_profiles
-- ============================================
CREATE TABLE public.customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  document text,
  phone text,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_profiles_user ON public.customer_profiles(user_id);
CREATE INDEX idx_customer_profiles_tenant ON public.customer_profiles(tenant_id);
CREATE INDEX idx_customer_profiles_email ON public.customer_profiles(email);

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_customer_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.customer_profiles WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_customer(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.customer_profiles WHERE user_id = _user_id)
$$;

CREATE POLICY "Customers can view their own profile"
  ON public.customer_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Customers can update their own profile"
  ON public.customer_profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Internal team can view customers of their tenant"
  ON public.customer_profiles FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() AND public.is_manager_or_higher(auth.uid()));

CREATE TRIGGER trg_customer_profiles_updated_at
  BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- sac_categories
-- ============================================
CREATE TABLE public.sac_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text DEFAULT '#00c875',
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sac_categories_tenant ON public.sac_categories(tenant_id);
ALTER TABLE public.sac_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active SAC categories"
  ON public.sac_categories FOR SELECT USING (is_active = true);

CREATE POLICY "Internal team can manage SAC categories"
  ON public.sac_categories FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin_or_higher(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin_or_higher(auth.uid()));

CREATE TRIGGER trg_sac_categories_updated_at
  BEFORE UPDATE ON public.sac_categories
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- sac_form_fields
-- ============================================
CREATE TABLE public.sac_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  placeholder text,
  help_text text,
  is_required boolean DEFAULT false,
  is_active boolean DEFAULT true,
  is_system boolean DEFAULT false,
  options jsonb DEFAULT '[]'::jsonb,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, field_key)
);
CREATE INDEX idx_sac_form_fields_tenant ON public.sac_form_fields(tenant_id);
ALTER TABLE public.sac_form_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active SAC form fields"
  ON public.sac_form_fields FOR SELECT USING (is_active = true);

CREATE POLICY "Internal team can manage SAC form fields"
  ON public.sac_form_fields FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin_or_higher(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin_or_higher(auth.uid()));

CREATE TRIGGER trg_sac_form_fields_updated_at
  BEFORE UPDATE ON public.sac_form_fields
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- sac_tickets
-- ============================================
CREATE SEQUENCE IF NOT EXISTS public.sac_tickets_number_seq;

CREATE TABLE public.sac_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_number int NOT NULL DEFAULT nextval('public.sac_tickets_number_seq'),
  customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_email text NOT NULL,
  customer_name text NOT NULL,
  customer_document text,
  customer_phone text,
  product_name text,
  product_batch text,
  quantity numeric,
  purchase_date date,
  order_number text,
  subject text,
  description text NOT NULL,
  category_id uuid REFERENCES public.sac_categories(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES public.profiles(id),
  sla_due_at timestamptz,
  due_date timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution_notes text,
  satisfaction_rating int CHECK (satisfaction_rating BETWEEN 1 AND 5),
  dynamic_fields jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sac_tickets_tenant ON public.sac_tickets(tenant_id);
CREATE INDEX idx_sac_tickets_customer ON public.sac_tickets(customer_user_id);
CREATE INDEX idx_sac_tickets_status ON public.sac_tickets(tenant_id, status);
CREATE INDEX idx_sac_tickets_assigned ON public.sac_tickets(assigned_to);

ALTER TABLE public.sac_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers see their own SAC tickets"
  ON public.sac_tickets FOR SELECT USING (customer_user_id = auth.uid());

CREATE POLICY "Customers can create their own SAC tickets"
  ON public.sac_tickets FOR INSERT
  WITH CHECK (customer_user_id = auth.uid() AND tenant_id = public.get_customer_tenant_id());

CREATE POLICY "Internal team views SAC tickets of their tenant"
  ON public.sac_tickets FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role());

CREATE POLICY "Internal team manages SAC tickets of their tenant"
  ON public.sac_tickets FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role());

CREATE POLICY "Internal team can insert SAC tickets"
  ON public.sac_tickets FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role());

CREATE POLICY "Admins can delete SAC tickets"
  ON public.sac_tickets FOR DELETE
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin_or_higher(auth.uid()));

CREATE TRIGGER trg_sac_tickets_updated_at
  BEFORE UPDATE ON public.sac_tickets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_sac_tickets_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.sac_tickets
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ============================================
-- sac_ticket_comments
-- ============================================
CREATE TABLE public.sac_ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.sac_tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_type text NOT NULL DEFAULT 'customer',
  author_name text,
  content text NOT NULL,
  is_internal boolean DEFAULT false,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sac_comments_ticket ON public.sac_ticket_comments(ticket_id);
ALTER TABLE public.sac_ticket_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers see public comments on their tickets"
  ON public.sac_ticket_comments FOR SELECT
  USING (
    is_internal = false
    AND EXISTS (SELECT 1 FROM public.sac_tickets t WHERE t.id = ticket_id AND t.customer_user_id = auth.uid())
  );

CREATE POLICY "Customers can comment on their tickets"
  ON public.sac_ticket_comments FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND author_type = 'customer'
    AND is_internal = false
    AND EXISTS (SELECT 1 FROM public.sac_tickets t WHERE t.id = ticket_id AND t.customer_user_id = auth.uid())
  );

CREATE POLICY "Internal team views all comments of their tenant tickets"
  ON public.sac_ticket_comments FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role());

CREATE POLICY "Internal team can comment"
  ON public.sac_ticket_comments FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role());

-- ============================================
-- sac_ticket_attachments
-- ============================================
CREATE TABLE public.sac_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.sac_tickets(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size int,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sac_attachments_ticket ON public.sac_ticket_attachments(ticket_id);
ALTER TABLE public.sac_ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers see attachments of their own tickets"
  ON public.sac_ticket_attachments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.sac_tickets t WHERE t.id = ticket_id AND t.customer_user_id = auth.uid()));

CREATE POLICY "Customers can upload attachments to their tickets"
  ON public.sac_ticket_attachments FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.sac_tickets t WHERE t.id = ticket_id AND t.customer_user_id = auth.uid())
  );

CREATE POLICY "Internal team views attachments of their tenant"
  ON public.sac_ticket_attachments FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role());

CREATE POLICY "Internal team can upload attachments"
  ON public.sac_ticket_attachments FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_member_or_higher_role());

-- ============================================
-- Storage bucket
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('sac-attachments', 'sac-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload SAC attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sac-attachments');

CREATE POLICY "Anon can upload SAC attachments via public form"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'sac-attachments');

CREATE POLICY "Owners and staff can read SAC attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'sac-attachments'
    AND (owner = auth.uid() OR public.is_member_or_higher_role())
  );

-- ============================================
-- Seed defaults trigger + backfill
-- ============================================
CREATE OR REPLACE FUNCTION public.seed_default_sac_data()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.sac_categories (tenant_id, name, color, sort_order) VALUES
    (NEW.id, 'Defeito de fabricação', '#e2445c', 1),
    (NEW.id, 'Avaria no transporte', '#fdab3d', 2),
    (NEW.id, 'Troca / Devolução', '#0073ea', 3),
    (NEW.id, 'Dúvida sobre produto', '#a25ddc', 4),
    (NEW.id, 'Elogio', '#00c875', 5),
    (NEW.id, 'Sugestão', '#7e8599', 6),
    (NEW.id, 'Outros', '#7e8599', 99);

  INSERT INTO public.sac_form_fields (tenant_id, field_key, label, field_type, is_required, is_system, sort_order) VALUES
    (NEW.id, 'customer_name',     'Nome completo',       'text',        true,  true,  1),
    (NEW.id, 'customer_document', 'CPF ou CNPJ',         'document',    true,  true,  2),
    (NEW.id, 'customer_phone',    'Telefone de contato', 'phone',       true,  true,  3),
    (NEW.id, 'customer_email',    'E-mail',              'email',       true,  true,  4),
    (NEW.id, 'product_name',      'Nome do produto',     'text',        true,  true,  5),
    (NEW.id, 'product_batch',     'Lote do produto',     'text',        false, true,  6),
    (NEW.id, 'quantity',          'Quantidade',          'number',      false, true,  7),
    (NEW.id, 'purchase_date',     'Data da compra',      'date',        false, true,  8),
    (NEW.id, 'order_number',      'Número do pedido',    'text',        false, true,  9),
    (NEW.id, 'category_id',       'Tipo de solicitação', 'select',      true,  true, 10),
    (NEW.id, 'description',       'Descreva o problema ou solicitação', 'textarea', true, true, 11),
    (NEW.id, 'attachments',       'Fotos do produto', 'attachments', false, true, 12);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_default_sac_data
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_sac_data();

-- Backfill existing tenants
DO $$
DECLARE _t RECORD;
BEGIN
  FOR _t IN SELECT id FROM public.tenants LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sac_categories WHERE tenant_id = _t.id) THEN
      INSERT INTO public.sac_categories (tenant_id, name, color, sort_order) VALUES
        (_t.id, 'Defeito de fabricação', '#e2445c', 1),
        (_t.id, 'Avaria no transporte', '#fdab3d', 2),
        (_t.id, 'Troca / Devolução', '#0073ea', 3),
        (_t.id, 'Dúvida sobre produto', '#a25ddc', 4),
        (_t.id, 'Elogio', '#00c875', 5),
        (_t.id, 'Sugestão', '#7e8599', 6),
        (_t.id, 'Outros', '#7e8599', 99);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sac_form_fields WHERE tenant_id = _t.id) THEN
      INSERT INTO public.sac_form_fields (tenant_id, field_key, label, field_type, is_required, is_system, sort_order) VALUES
        (_t.id, 'customer_name',     'Nome completo',       'text',        true,  true,  1),
        (_t.id, 'customer_document', 'CPF ou CNPJ',         'document',    true,  true,  2),
        (_t.id, 'customer_phone',    'Telefone de contato', 'phone',       true,  true,  3),
        (_t.id, 'customer_email',    'E-mail',              'email',       true,  true,  4),
        (_t.id, 'product_name',      'Nome do produto',     'text',        true,  true,  5),
        (_t.id, 'product_batch',     'Lote do produto',     'text',        false, true,  6),
        (_t.id, 'quantity',          'Quantidade',          'number',      false, true,  7),
        (_t.id, 'purchase_date',     'Data da compra',      'date',        false, true,  8),
        (_t.id, 'order_number',      'Número do pedido',    'text',        false, true,  9),
        (_t.id, 'category_id',       'Tipo de solicitação', 'select',      true,  true, 10),
        (_t.id, 'description',       'Descreva o problema ou solicitação', 'textarea', true, true, 11),
        (_t.id, 'attachments',       'Fotos do produto', 'attachments', false, true, 12);
    END IF;
  END LOOP;
END $$;
