
-- =============================================
-- 1. Update seed function to include TI subcategories + MKT categories
-- =============================================
CREATE OR REPLACE FUNCTION public.seed_default_ti_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_id uuid;
BEGIN
    -- ========== TI: TICKETS ==========
    -- Hardware (with subcategories)
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
    VALUES (NEW.id, 'tickets', 'Hardware', 1)
    RETURNING id INTO v_parent_id;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (NEW.id, 'tickets', 'Notebook', v_parent_id, 1),
      (NEW.id, 'tickets', 'Desktop', v_parent_id, 2),
      (NEW.id, 'tickets', 'Monitor', v_parent_id, 3),
      (NEW.id, 'tickets', 'Impressora', v_parent_id, 4),
      (NEW.id, 'tickets', 'Periféricos', v_parent_id, 5);

    -- Software (with subcategories)
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
    VALUES (NEW.id, 'tickets', 'Software', 2)
    RETURNING id INTO v_parent_id;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (NEW.id, 'tickets', 'Sistema ERP', v_parent_id, 1),
      (NEW.id, 'tickets', 'Office 365', v_parent_id, 2),
      (NEW.id, 'tickets', 'Email', v_parent_id, 3),
      (NEW.id, 'tickets', 'Navegador', v_parent_id, 4),
      (NEW.id, 'tickets', 'Outros', v_parent_id, 5);

    -- Rede (with subcategories)
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
    VALUES (NEW.id, 'tickets', 'Rede', 3)
    RETURNING id INTO v_parent_id;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (NEW.id, 'tickets', 'Wi-Fi', v_parent_id, 1),
      (NEW.id, 'tickets', 'Cabeamento', v_parent_id, 2),
      (NEW.id, 'tickets', 'VPN', v_parent_id, 3),
      (NEW.id, 'tickets', 'Firewall', v_parent_id, 4),
      (NEW.id, 'tickets', 'DNS', v_parent_id, 5);

    -- Acesso/Permissões (with subcategories)
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
    VALUES (NEW.id, 'tickets', 'Acesso/Permissões', 4)
    RETURNING id INTO v_parent_id;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (NEW.id, 'tickets', 'Conta AD', v_parent_id, 1),
      (NEW.id, 'tickets', 'Sistemas Internos', v_parent_id, 2),
      (NEW.id, 'tickets', 'Email', v_parent_id, 3),
      (NEW.id, 'tickets', 'Pasta Compartilhada', v_parent_id, 4);

    -- ========== TI: OTHER MODULES (unchanged) ==========
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order) VALUES
      (NEW.id, 'inventory', 'Hardware', 1),
      (NEW.id, 'inventory', 'Software', 2),
      (NEW.id, 'inventory', 'Periféricos', 3),
      (NEW.id, 'inventory', 'Rede', 4),
      (NEW.id, 'inventory', 'Móveis/Equipamentos', 5),
      (NEW.id, 'contracts', 'Suporte', 1),
      (NEW.id, 'contracts', 'Manutenção', 2),
      (NEW.id, 'contracts', 'SaaS/Cloud', 3),
      (NEW.id, 'contracts', 'Telecomunicações', 4),
      (NEW.id, 'contracts', 'Locação', 5),
      (NEW.id, 'licenses', 'Sistema Operacional', 1),
      (NEW.id, 'licenses', 'Produtividade', 2),
      (NEW.id, 'licenses', 'Segurança', 3),
      (NEW.id, 'licenses', 'Desenvolvimento', 4),
      (NEW.id, 'licenses', 'Outros', 5),
      (NEW.id, 'maintenances', 'Preventiva', 1),
      (NEW.id, 'maintenances', 'Corretiva', 2),
      (NEW.id, 'maintenances', 'Preditiva', 3),
      (NEW.id, 'maintenances', 'Instalação', 4),
      (NEW.id, 'maintenances', 'Desinstalação', 5);

    -- ========== MKT: MARKETING CATEGORIES ==========
    -- Criação de Arte
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
    VALUES (NEW.id, 'marketing', 'Criação de Arte', 1)
    RETURNING id INTO v_parent_id;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (NEW.id, 'marketing', 'Banner', v_parent_id, 1),
      (NEW.id, 'marketing', 'Post Social', v_parent_id, 2),
      (NEW.id, 'marketing', 'Material Impresso', v_parent_id, 3),
      (NEW.id, 'marketing', 'Vídeo', v_parent_id, 4);

    -- Evento
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
    VALUES (NEW.id, 'marketing', 'Evento', 2)
    RETURNING id INTO v_parent_id;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (NEW.id, 'marketing', 'Organização', v_parent_id, 1),
      (NEW.id, 'marketing', 'Logística', v_parent_id, 2),
      (NEW.id, 'marketing', 'Contratação', v_parent_id, 3);

    -- Redes Sociais
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
    VALUES (NEW.id, 'marketing', 'Redes Sociais', 3)
    RETURNING id INTO v_parent_id;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (NEW.id, 'marketing', 'Publicação', v_parent_id, 1),
      (NEW.id, 'marketing', 'Resposta/SAC', v_parent_id, 2),
      (NEW.id, 'marketing', 'Relatório', v_parent_id, 3);

    -- Branding
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
    VALUES (NEW.id, 'marketing', 'Branding', 4)
    RETURNING id INTO v_parent_id;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (NEW.id, 'marketing', 'Identidade Visual', v_parent_id, 1),
      (NEW.id, 'marketing', 'Apresentação', v_parent_id, 2),
      (NEW.id, 'marketing', 'Embalagem', v_parent_id, 3);

    -- Assessoria de Imprensa
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
    VALUES (NEW.id, 'marketing', 'Assessoria de Imprensa', 5)
    RETURNING id INTO v_parent_id;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (NEW.id, 'marketing', 'Release', v_parent_id, 1),
      (NEW.id, 'marketing', 'Entrevista', v_parent_id, 2);

    -- Outros
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
    VALUES (NEW.id, 'marketing', 'Outros', 6);

    RETURN NEW;
END;
$function$;

-- =============================================
-- 2. Populate subcategories for EXISTING tenants (TI)
-- =============================================
DO $$
DECLARE
  t RECORD;
  v_parent_id uuid;
BEGIN
  FOR t IN SELECT DISTINCT tenant_id FROM public.ti_categories WHERE module = 'tickets' LOOP
    -- Add subcategories for Hardware
    SELECT id INTO v_parent_id FROM public.ti_categories 
      WHERE tenant_id = t.tenant_id AND module = 'tickets' AND name = 'Hardware' AND parent_id IS NULL;
    IF v_parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ti_categories WHERE parent_id = v_parent_id) THEN
      INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
        (t.tenant_id, 'tickets', 'Notebook', v_parent_id, 1),
        (t.tenant_id, 'tickets', 'Desktop', v_parent_id, 2),
        (t.tenant_id, 'tickets', 'Monitor', v_parent_id, 3),
        (t.tenant_id, 'tickets', 'Impressora', v_parent_id, 4),
        (t.tenant_id, 'tickets', 'Periféricos', v_parent_id, 5);
    END IF;

    -- Add subcategories for Software
    SELECT id INTO v_parent_id FROM public.ti_categories 
      WHERE tenant_id = t.tenant_id AND module = 'tickets' AND name = 'Software' AND parent_id IS NULL;
    IF v_parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ti_categories WHERE parent_id = v_parent_id) THEN
      INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
        (t.tenant_id, 'tickets', 'Sistema ERP', v_parent_id, 1),
        (t.tenant_id, 'tickets', 'Office 365', v_parent_id, 2),
        (t.tenant_id, 'tickets', 'Email', v_parent_id, 3),
        (t.tenant_id, 'tickets', 'Navegador', v_parent_id, 4),
        (t.tenant_id, 'tickets', 'Outros', v_parent_id, 5);
    END IF;

    -- Add subcategories for Rede
    SELECT id INTO v_parent_id FROM public.ti_categories 
      WHERE tenant_id = t.tenant_id AND module = 'tickets' AND name = 'Rede' AND parent_id IS NULL;
    IF v_parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ti_categories WHERE parent_id = v_parent_id) THEN
      INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
        (t.tenant_id, 'tickets', 'Wi-Fi', v_parent_id, 1),
        (t.tenant_id, 'tickets', 'Cabeamento', v_parent_id, 2),
        (t.tenant_id, 'tickets', 'VPN', v_parent_id, 3),
        (t.tenant_id, 'tickets', 'Firewall', v_parent_id, 4),
        (t.tenant_id, 'tickets', 'DNS', v_parent_id, 5);
    END IF;

    -- Add subcategories for Acesso/Permissões
    SELECT id INTO v_parent_id FROM public.ti_categories 
      WHERE tenant_id = t.tenant_id AND module = 'tickets' AND name = 'Acesso/Permissões' AND parent_id IS NULL;
    IF v_parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ti_categories WHERE parent_id = v_parent_id) THEN
      INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
        (t.tenant_id, 'tickets', 'Conta AD', v_parent_id, 1),
        (t.tenant_id, 'tickets', 'Sistemas Internos', v_parent_id, 2),
        (t.tenant_id, 'tickets', 'Email', v_parent_id, 3),
        (t.tenant_id, 'tickets', 'Pasta Compartilhada', v_parent_id, 4);
    END IF;

    -- ========== MKT categories for existing tenants ==========
    IF NOT EXISTS (SELECT 1 FROM public.ti_categories WHERE tenant_id = t.tenant_id AND module = 'marketing') THEN
      -- Criação de Arte
      INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
      VALUES (t.tenant_id, 'marketing', 'Criação de Arte', 1)
      RETURNING id INTO v_parent_id;
      INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
        (t.tenant_id, 'marketing', 'Banner', v_parent_id, 1),
        (t.tenant_id, 'marketing', 'Post Social', v_parent_id, 2),
        (t.tenant_id, 'marketing', 'Material Impresso', v_parent_id, 3),
        (t.tenant_id, 'marketing', 'Vídeo', v_parent_id, 4);

      -- Evento
      INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
      VALUES (t.tenant_id, 'marketing', 'Evento', 2)
      RETURNING id INTO v_parent_id;
      INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
        (t.tenant_id, 'marketing', 'Organização', v_parent_id, 1),
        (t.tenant_id, 'marketing', 'Logística', v_parent_id, 2),
        (t.tenant_id, 'marketing', 'Contratação', v_parent_id, 3);

      -- Redes Sociais
      INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
      VALUES (t.tenant_id, 'marketing', 'Redes Sociais', 3)
      RETURNING id INTO v_parent_id;
      INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
        (t.tenant_id, 'marketing', 'Publicação', v_parent_id, 1),
        (t.tenant_id, 'marketing', 'Resposta/SAC', v_parent_id, 2),
        (t.tenant_id, 'marketing', 'Relatório', v_parent_id, 3);

      -- Branding
      INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
      VALUES (t.tenant_id, 'marketing', 'Branding', 4)
      RETURNING id INTO v_parent_id;
      INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
        (t.tenant_id, 'marketing', 'Identidade Visual', v_parent_id, 1),
        (t.tenant_id, 'marketing', 'Apresentação', v_parent_id, 2),
        (t.tenant_id, 'marketing', 'Embalagem', v_parent_id, 3);

      -- Assessoria de Imprensa
      INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
      VALUES (t.tenant_id, 'marketing', 'Assessoria de Imprensa', 5)
      RETURNING id INTO v_parent_id;
      INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
        (t.tenant_id, 'marketing', 'Release', v_parent_id, 1),
        (t.tenant_id, 'marketing', 'Entrevista', v_parent_id, 2);

      -- Outros
      INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
      VALUES (t.tenant_id, 'marketing', 'Outros', 6);
    END IF;
  END LOOP;
END $$;
