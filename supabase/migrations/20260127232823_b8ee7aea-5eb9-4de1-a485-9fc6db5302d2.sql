
-- ============================================
-- MIGRATION: Sistema de Roles Globais e Planos
-- ============================================

-- 1. Dropar funções com CASCADE (remove policies dependentes automaticamente)
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role(uuid) CASCADE;

-- 2. Criar novo enum
CREATE TYPE app_role_new AS ENUM ('owner', 'admin', 'manager', 'member', 'viewer');

-- 3. Adicionar colunas temporárias
ALTER TABLE user_roles ADD COLUMN role_new app_role_new;
ALTER TABLE tenant_invites ADD COLUMN role_new app_role_new;

-- 4. Migrar dados
UPDATE user_roles SET role_new = 
  CASE role::text
    WHEN 'admin' THEN 'owner'::app_role_new
    WHEN 'diretor' THEN 'admin'::app_role_new
    WHEN 'supervisor' THEN 'manager'::app_role_new
    WHEN 'tecnico' THEN 'member'::app_role_new
    WHEN 'colaborador' THEN 'viewer'::app_role_new
  END;

UPDATE tenant_invites SET role_new = 
  CASE role::text
    WHEN 'admin' THEN 'owner'::app_role_new
    WHEN 'diretor' THEN 'admin'::app_role_new
    WHEN 'supervisor' THEN 'manager'::app_role_new
    WHEN 'tecnico' THEN 'member'::app_role_new
    WHEN 'colaborador' THEN 'viewer'::app_role_new
  END
WHERE role IS NOT NULL;

-- 5. Ajustar constraints
ALTER TABLE user_roles ALTER COLUMN role_new SET NOT NULL;
ALTER TABLE user_roles ALTER COLUMN role_new SET DEFAULT 'member'::app_role_new;
ALTER TABLE tenant_invites ALTER COLUMN role_new SET DEFAULT 'member'::app_role_new;

-- 6. Remover colunas antigas e renomear
ALTER TABLE user_roles DROP COLUMN role;
ALTER TABLE user_roles RENAME COLUMN role_new TO role;

ALTER TABLE tenant_invites DROP COLUMN role;
ALTER TABLE tenant_invites RENAME COLUMN role_new TO role;

-- 7. Remover enum antigo e renomear novo
DROP TYPE app_role;
ALTER TYPE app_role_new RENAME TO app_role;

-- ============================================
-- 8. Recriar funções com novo enum
-- ============================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role
    WHEN 'owner' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'manager' THEN 3
    WHEN 'member' THEN 4
    WHEN 'viewer' THEN 5
  END
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_higher(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_higher(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin', 'manager')
  )
$$;

-- Atualizar funções existentes para compatibilidade
CREATE OR REPLACE FUNCTION public.is_supervisor_or_higher(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin', 'manager')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_diretor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin')
  )
$$;

-- ============================================
-- 9. Recriar policies que foram dropadas pelo CASCADE
-- ============================================

-- Tickets
CREATE POLICY "Users can view their own tickets"
  ON public.tickets FOR SELECT
  USING (
    tenant_id = get_user_tenant_id() AND (
      requester_id = auth.uid() OR
      assigned_to = auth.uid() OR
      has_role(auth.uid(), 'member'::app_role) OR
      is_supervisor_or_higher(auth.uid())
    )
  );

CREATE POLICY "Technicians can update tickets"
  ON public.tickets FOR UPDATE
  USING (
    tenant_id = get_user_tenant_id() AND (
      requester_id = auth.uid() OR
      assigned_to = auth.uid() OR
      has_role(auth.uid(), 'member'::app_role) OR
      is_supervisor_or_higher(auth.uid())
    )
  )
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Ticket comments
CREATE POLICY "Users can view comments on accessible tickets"
  ON public.ticket_comments FOR SELECT
  USING (
    tenant_id = get_user_tenant_id() AND (
      (NOT is_internal AND EXISTS (
        SELECT 1 FROM tickets t WHERE t.id = ticket_comments.ticket_id AND t.requester_id = auth.uid()
      )) OR
      has_role(auth.uid(), 'member'::app_role) OR
      is_supervisor_or_higher(auth.uid())
    )
  );

-- Maintenances
CREATE POLICY "Technicians can create maintenances"
  ON public.asset_maintenances FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant_id() AND (
      has_role(auth.uid(), 'member'::app_role) OR
      is_supervisor_or_higher(auth.uid())
    )
  );

CREATE POLICY "Technicians can update maintenances"
  ON public.asset_maintenances FOR UPDATE
  USING (
    tenant_id = get_user_tenant_id() AND (
      has_role(auth.uid(), 'member'::app_role) OR
      is_supervisor_or_higher(auth.uid())
    )
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id() AND (
      has_role(auth.uid(), 'member'::app_role) OR
      is_supervisor_or_higher(auth.uid())
    )
  );

-- Ticket attachments
CREATE POLICY "Users can view attachments on accessible tickets"
  ON public.ticket_attachments FOR SELECT
  USING (
    tenant_id = get_user_tenant_id() AND (
      EXISTS (
        SELECT 1 FROM tickets t WHERE t.id = ticket_attachments.ticket_id AND (t.requester_id = auth.uid() OR t.assigned_to = auth.uid())
      ) OR
      has_role(auth.uid(), 'member'::app_role) OR
      is_supervisor_or_higher(auth.uid())
    )
  );

CREATE POLICY "Users can upload attachments to accessible tickets"
  ON public.ticket_attachments FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant_id() AND (
      EXISTS (
        SELECT 1 FROM tickets t WHERE t.id = ticket_attachments.ticket_id AND (t.requester_id = auth.uid() OR t.assigned_to = auth.uid())
      ) OR
      has_role(auth.uid(), 'member'::app_role) OR
      is_supervisor_or_higher(auth.uid())
    )
  );

-- ============================================
-- 10. Adicionar plan_config aos tenants
-- ============================================
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_config JSONB DEFAULT '{
  "plan": "free",
  "trial_ends_at": null,
  "max_users": 5,
  "available_modules": ["ti", "comercial", "marketing", "rh", "financeiro", "producao", "expedicao", "educacional", "qualidade"],
  "features": {
    "lyra_advanced": true,
    "advanced_reports": true,
    "export_data": true
  }
}'::jsonb;

-- ============================================
-- 11. Criar tabela user_module_access
-- ============================================
CREATE TABLE public.user_module_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, user_id, module)
);

ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER inject_tenant_id_user_module_access
  BEFORE INSERT ON public.user_module_access
  FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

-- ============================================
-- 12. Criar tabelas de Perfis TI
-- ============================================
CREATE TABLE public.ti_access_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  modules JSONB NOT NULL DEFAULT '{"chamados": true, "inventario": false, "contratos": false, "licencas": false, "manutencoes": false, "rede": false, "mapas": false, "pops": false, "dashboard": false, "configuracoes": false}'::jsonb,
  permissions JSONB NOT NULL DEFAULT '{"view": true, "create": true, "edit": false, "delete": false, "export": false, "assign": false, "close": false, "reopen": false}'::jsonb,
  ticket_restrictions JSONB NOT NULL DEFAULT '{"visibility": "all", "categories": [], "priorities": []}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ti_access_profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER inject_tenant_id_ti_access_profiles
  BEFORE INSERT ON public.ti_access_profiles
  FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

CREATE TRIGGER update_ti_access_profiles_updated_at
  BEFORE UPDATE ON public.ti_access_profiles
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TABLE public.ti_user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES ti_access_profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

ALTER TABLE public.ti_user_profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER inject_tenant_id_ti_user_profiles
  BEFORE INSERT ON public.ti_user_profiles
  FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

-- ============================================
-- 13. Políticas RLS para user_module_access
-- ============================================

CREATE POLICY "Users can view their own module access"
  ON public.user_module_access FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Admins can view all module access"
  ON public.user_module_access FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()));

CREATE POLICY "Admins can create module access"
  ON public.user_module_access FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()));

CREATE POLICY "Admins can update module access"
  ON public.user_module_access FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()));

CREATE POLICY "Admins can delete module access"
  ON public.user_module_access FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()));

-- ============================================
-- 14. Políticas RLS para ti_access_profiles
-- ============================================

CREATE POLICY "Users can view TI profiles in their tenant"
  ON public.ti_access_profiles FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Managers can create TI profiles"
  ON public.ti_access_profiles FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_manager_or_higher(auth.uid()));

CREATE POLICY "Managers can update TI profiles"
  ON public.ti_access_profiles FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND is_manager_or_higher(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_manager_or_higher(auth.uid()));

CREATE POLICY "Admins can delete TI profiles"
  ON public.ti_access_profiles FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_admin_or_higher(auth.uid()));

-- ============================================
-- 15. Políticas RLS para ti_user_profiles
-- ============================================

CREATE POLICY "Users can view their own TI profile"
  ON public.ti_user_profiles FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Managers can view all TI user profiles"
  ON public.ti_user_profiles FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND is_manager_or_higher(auth.uid()));

CREATE POLICY "Managers can create TI user profiles"
  ON public.ti_user_profiles FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_manager_or_higher(auth.uid()));

CREATE POLICY "Managers can update TI user profiles"
  ON public.ti_user_profiles FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND is_manager_or_higher(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_manager_or_higher(auth.uid()));

CREATE POLICY "Managers can delete TI user profiles"
  ON public.ti_user_profiles FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND is_manager_or_higher(auth.uid()));

-- ============================================
-- 16. Índices para performance
-- ============================================
CREATE INDEX idx_user_module_access_user_id ON public.user_module_access(user_id);
CREATE INDEX idx_user_module_access_tenant_module ON public.user_module_access(tenant_id, module);
CREATE INDEX idx_ti_access_profiles_tenant ON public.ti_access_profiles(tenant_id);
CREATE INDEX idx_ti_user_profiles_user ON public.ti_user_profiles(user_id);
CREATE INDEX idx_ti_user_profiles_profile ON public.ti_user_profiles(profile_id);
