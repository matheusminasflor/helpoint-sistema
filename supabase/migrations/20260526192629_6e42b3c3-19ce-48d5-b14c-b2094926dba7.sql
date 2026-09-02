
-- ========================================================================
-- 1) DROP KANBAN COMPLETO (UI + dados + automações)
-- ========================================================================
DROP TRIGGER IF EXISTS sync_ticket_to_kanban_trigger ON public.tickets;
DROP FUNCTION IF EXISTS public.sync_ticket_to_kanban() CASCADE;
DROP FUNCTION IF EXISTS public.ensure_department_kanban_boards(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.auto_create_kanban_boards_for_tenant() CASCADE;
DROP FUNCTION IF EXISTS public.user_belongs_to_board_department(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.user_is_card_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.user_mentioned_in_card(uuid) CASCADE;

DROP TABLE IF EXISTS public.kanban_card_mentions CASCADE;
DROP TABLE IF EXISTS public.kanban_card_members CASCADE;
DROP TABLE IF EXISTS public.kanban_card_comments CASCADE;
DROP TABLE IF EXISTS public.kanban_card_attachments CASCADE;
DROP TABLE IF EXISTS public.kanban_checklist_items CASCADE;
DROP TABLE IF EXISTS public.kanban_checklists CASCADE;
DROP TABLE IF EXISTS public.kanban_routines CASCADE;
DROP TABLE IF EXISTS public.kanban_cards CASCADE;
DROP TABLE IF EXISTS public.kanban_columns CASCADE;
DROP TABLE IF EXISTS public.kanban_boards CASCADE;

-- ========================================================================
-- 2) DROP UGC
-- ========================================================================
DROP TABLE IF EXISTS public.mkt_ugc_content CASCADE;

-- ========================================================================
-- 3) RENOMEAR "Assistência" → "TI" (registros)
-- ========================================================================
UPDATE public.profiles SET department = 'ti' WHERE department IN ('assistencia','assistência');

-- ========================================================================
-- 4) MÓDULO QUALIDADE NO HELPDESK
-- ========================================================================
-- Permitir 'qualidade' como valor de tickets.module
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_module_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_module_check
  CHECK (module IN ('tickets','marketing','qualidade'));

-- 4a) Perfis de acesso de Qualidade (espelho de ti_access_profiles + ti_user_profiles)
CREATE TABLE IF NOT EXISTS public.qualidade_access_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qualidade_access_profiles TO authenticated;
GRANT ALL ON public.qualidade_access_profiles TO service_role;
ALTER TABLE public.qualidade_access_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage qualidade profiles" ON public.qualidade_access_profiles
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id() AND is_manager_or_higher(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_manager_or_higher(auth.uid()));
CREATE POLICY "Tenant members view qualidade profiles" ON public.qualidade_access_profiles
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());
CREATE TRIGGER inject_tenant_qualidade_access_profiles
  BEFORE INSERT ON public.qualidade_access_profiles FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();
CREATE TRIGGER update_qualidade_access_profiles_updated_at
  BEFORE UPDATE ON public.qualidade_access_profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TABLE IF NOT EXISTS public.qualidade_user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.qualidade_access_profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qualidade_user_profiles TO authenticated;
GRANT ALL ON public.qualidade_user_profiles TO service_role;
ALTER TABLE public.qualidade_user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage qualidade user profiles" ON public.qualidade_user_profiles
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id() AND is_manager_or_higher(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id() AND is_manager_or_higher(auth.uid()));
CREATE POLICY "Users view own qualidade profile" ON public.qualidade_user_profiles
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id() AND user_id = auth.uid());
CREATE TRIGGER inject_tenant_qualidade_user_profiles
  BEFORE INSERT ON public.qualidade_user_profiles FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();

-- 4b) Função de checagem de técnico de Qualidade
CREATE OR REPLACE FUNCTION public.is_qualidade_tech(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.qualidade_user_profiles WHERE user_id = _user_id
  ) OR is_supervisor_or_higher(_user_id)
$$;

-- 4c) Categorias padrão de Qualidade (seed para tenants existentes + adicionar ao gatilho)
INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
SELECT t.id, 'qualidade', cat.name, cat.sort_order
FROM public.tenants t
CROSS JOIN (VALUES
  ('Não-conformidade', 1),
  ('Reclamação de cliente', 2),
  ('Auditoria', 3),
  ('Ação corretiva', 4),
  ('Controle de documentos', 5),
  ('Outros', 99)
) AS cat(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ti_categories
  WHERE tenant_id = t.id AND module = 'qualidade'
);

-- Atualizar a função seed_default_ti_categories para incluir bloco qualidade em novos tenants
CREATE OR REPLACE FUNCTION public.seed_default_ti_categories()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_parent_id uuid;
BEGIN
  -- TI: TICKETS
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
  VALUES (NEW.id, 'tickets', 'Hardware', 1) RETURNING id INTO v_parent_id;
  INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
    (NEW.id,'tickets','Notebook',v_parent_id,1),(NEW.id,'tickets','Desktop',v_parent_id,2),
    (NEW.id,'tickets','Monitor',v_parent_id,3),(NEW.id,'tickets','Impressora',v_parent_id,4),
    (NEW.id,'tickets','Periféricos',v_parent_id,5);
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
  VALUES (NEW.id, 'tickets', 'Software', 2) RETURNING id INTO v_parent_id;
  INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
    (NEW.id,'tickets','Sistema ERP',v_parent_id,1),(NEW.id,'tickets','Office 365',v_parent_id,2),
    (NEW.id,'tickets','Email',v_parent_id,3),(NEW.id,'tickets','Navegador',v_parent_id,4),
    (NEW.id,'tickets','Outros',v_parent_id,5);
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
  VALUES (NEW.id, 'tickets', 'Rede', 3) RETURNING id INTO v_parent_id;
  INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
    (NEW.id,'tickets','Wi-Fi',v_parent_id,1),(NEW.id,'tickets','Cabeamento',v_parent_id,2),
    (NEW.id,'tickets','VPN',v_parent_id,3),(NEW.id,'tickets','Firewall',v_parent_id,4),
    (NEW.id,'tickets','DNS',v_parent_id,5);
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
  VALUES (NEW.id, 'tickets', 'Acesso/Permissões', 4) RETURNING id INTO v_parent_id;
  INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
    (NEW.id,'tickets','Conta AD',v_parent_id,1),(NEW.id,'tickets','Sistemas Internos',v_parent_id,2),
    (NEW.id,'tickets','Email',v_parent_id,3),(NEW.id,'tickets','Pasta Compartilhada',v_parent_id,4);

  -- TI: outros módulos
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order) VALUES
    (NEW.id,'inventory','Hardware',1),(NEW.id,'inventory','Software',2),
    (NEW.id,'inventory','Periféricos',3),(NEW.id,'inventory','Rede',4),
    (NEW.id,'inventory','Móveis/Equipamentos',5),
    (NEW.id,'contracts','Suporte',1),(NEW.id,'contracts','Manutenção',2),
    (NEW.id,'contracts','SaaS/Cloud',3),(NEW.id,'contracts','Telecomunicações',4),
    (NEW.id,'contracts','Locação',5),
    (NEW.id,'licenses','Sistema Operacional',1),(NEW.id,'licenses','Produtividade',2),
    (NEW.id,'licenses','Segurança',3),(NEW.id,'licenses','Desenvolvimento',4),
    (NEW.id,'licenses','Outros',5),
    (NEW.id,'maintenances','Preventiva',1),(NEW.id,'maintenances','Corretiva',2),
    (NEW.id,'maintenances','Preditiva',3),(NEW.id,'maintenances','Instalação',4),
    (NEW.id,'maintenances','Desinstalação',5);

  -- MKT
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
  VALUES (NEW.id, 'marketing', 'Criação de Arte', 1) RETURNING id INTO v_parent_id;
  INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
    (NEW.id,'marketing','Banner',v_parent_id,1),(NEW.id,'marketing','Post Social',v_parent_id,2),
    (NEW.id,'marketing','Material Impresso',v_parent_id,3),(NEW.id,'marketing','Vídeo',v_parent_id,4);
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
  VALUES (NEW.id, 'marketing', 'Evento', 2) RETURNING id INTO v_parent_id;
  INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
    (NEW.id,'marketing','Organização',v_parent_id,1),(NEW.id,'marketing','Logística',v_parent_id,2),
    (NEW.id,'marketing','Contratação',v_parent_id,3);
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
  VALUES (NEW.id, 'marketing', 'Redes Sociais', 3) RETURNING id INTO v_parent_id;
  INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
    (NEW.id,'marketing','Publicação',v_parent_id,1),(NEW.id,'marketing','Resposta/SAC',v_parent_id,2),
    (NEW.id,'marketing','Relatório',v_parent_id,3);
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
  VALUES (NEW.id, 'marketing', 'Branding', 4) RETURNING id INTO v_parent_id;
  INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
    (NEW.id,'marketing','Identidade Visual',v_parent_id,1),(NEW.id,'marketing','Apresentação',v_parent_id,2),
    (NEW.id,'marketing','Embalagem',v_parent_id,3);
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order) VALUES
    (NEW.id,'marketing','Outros',6);

  -- QUALIDADE (novo)
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order) VALUES
    (NEW.id,'qualidade','Não-conformidade',1),
    (NEW.id,'qualidade','Reclamação de cliente',2),
    (NEW.id,'qualidade','Auditoria',3),
    (NEW.id,'qualidade','Ação corretiva',4),
    (NEW.id,'qualidade','Controle de documentos',5),
    (NEW.id,'qualidade','Outros',99);

  RETURN NEW;
END;
$function$;

-- 4d) Políticas RLS de tickets para módulo qualidade
-- Recriar política de SELECT/UPDATE permissiva levando qualidade em conta
DROP POLICY IF EXISTS "Qualidade tech can manage qualidade tickets" ON public.tickets;
CREATE POLICY "Qualidade tech can manage qualidade tickets" ON public.tickets
  FOR ALL TO authenticated
  USING (
    tenant_id = get_user_tenant_id()
    AND module = 'qualidade'
    AND (is_qualidade_tech(auth.uid()) OR requester_id = auth.uid() OR created_by = auth.uid())
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND module = 'qualidade'
    AND (is_qualidade_tech(auth.uid()) OR requester_id = auth.uid() OR created_by = auth.uid())
  );

-- ========================================================================
-- 5) ARTISTAS — TABELA SEPARADA DE INFLUENCIADORES
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.mkt_artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  stage_name text,
  email text,
  phone text,
  genre text,                    -- gênero/estilo artístico
  contract_status text NOT NULL DEFAULT 'active',
  monthly_goal integer,          -- meta de entregas mensais
  cache_value numeric(12,2),     -- valor de cachê
  notes text,
  avatar_url text,
  tags text[] DEFAULT '{}'::text[],
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_artists TO authenticated;
GRANT ALL ON public.mkt_artists TO service_role;
ALTER TABLE public.mkt_artists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members view artists" ON public.mkt_artists
  FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
CREATE POLICY "Members manage artists" ON public.mkt_artists
  FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id() AND is_member_or_higher_role());
CREATE POLICY "Members update artists" ON public.mkt_artists
  FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id() AND is_member_or_higher_role());
CREATE POLICY "Supervisors delete artists" ON public.mkt_artists
  FOR DELETE TO authenticated USING (tenant_id = get_user_tenant_id() AND is_supervisor_or_higher(auth.uid()));
CREATE TRIGGER inject_tenant_mkt_artists BEFORE INSERT ON public.mkt_artists
  FOR EACH ROW EXECUTE FUNCTION inject_tenant_id();
CREATE TRIGGER update_mkt_artists_updated_at BEFORE UPDATE ON public.mkt_artists
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE INDEX idx_mkt_artists_tenant ON public.mkt_artists(tenant_id);
