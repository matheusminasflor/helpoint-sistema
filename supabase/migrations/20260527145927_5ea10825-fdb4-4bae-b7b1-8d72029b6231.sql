
-- Update default seeder to also create RH categories for new tenants
CREATE OR REPLACE FUNCTION public.seed_default_ti_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- QUALIDADE
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order) VALUES
    (NEW.id,'qualidade','Não-conformidade',1),
    (NEW.id,'qualidade','Reclamação de cliente',2),
    (NEW.id,'qualidade','Auditoria',3),
    (NEW.id,'qualidade','Ação corretiva',4),
    (NEW.id,'qualidade','Controle de documentos',5),
    (NEW.id,'qualidade','Outros',99);

  -- RH (novo)
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
  VALUES (NEW.id, 'rh', 'Admissão / Desligamento', 1) RETURNING id INTO v_parent_id;
  INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
    (NEW.id,'rh','Documentos',v_parent_id,1),
    (NEW.id,'rh','Exame admissional',v_parent_id,2),
    (NEW.id,'rh','Rescisão',v_parent_id,3);

  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
  VALUES (NEW.id, 'rh', 'Férias e Folgas', 2) RETURNING id INTO v_parent_id;
  INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
    (NEW.id,'rh','Solicitação de férias',v_parent_id,1),
    (NEW.id,'rh','Abono',v_parent_id,2),
    (NEW.id,'rh','Banco de horas',v_parent_id,3);

  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
  VALUES (NEW.id, 'rh', 'Folha e Benefícios', 3) RETURNING id INTO v_parent_id;
  INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
    (NEW.id,'rh','Holerite',v_parent_id,1),
    (NEW.id,'rh','Vale-transporte',v_parent_id,2),
    (NEW.id,'rh','Vale-refeição',v_parent_id,3),
    (NEW.id,'rh','Plano de saúde',v_parent_id,4);

  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
  VALUES (NEW.id, 'rh', 'Atestados e Afastamentos', 4) RETURNING id INTO v_parent_id;
  INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
    (NEW.id,'rh','Atestado médico',v_parent_id,1),
    (NEW.id,'rh','INSS',v_parent_id,2),
    (NEW.id,'rh','Licenças',v_parent_id,3);

  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
  VALUES (NEW.id, 'rh', 'Relacionamento', 5) RETURNING id INTO v_parent_id;
  INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
    (NEW.id,'rh','Dúvida trabalhista',v_parent_id,1),
    (NEW.id,'rh','Feedback',v_parent_id,2),
    (NEW.id,'rh','Reclamação confidencial',v_parent_id,3);

  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order) VALUES
    (NEW.id,'rh','Outros',99);

  RETURN NEW;
END;
$function$;

-- Backfill: insert RH default categories for existing tenants that don't have any RH category
DO $$
DECLARE
  t RECORD;
  v_parent uuid;
BEGIN
  FOR t IN
    SELECT id FROM public.tenants
    WHERE NOT EXISTS (SELECT 1 FROM public.ti_categories c WHERE c.tenant_id = tenants.id AND c.module = 'rh')
  LOOP
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
      VALUES (t.id, 'rh', 'Admissão / Desligamento', 1) RETURNING id INTO v_parent;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (t.id,'rh','Documentos',v_parent,1),
      (t.id,'rh','Exame admissional',v_parent,2),
      (t.id,'rh','Rescisão',v_parent,3);

    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
      VALUES (t.id, 'rh', 'Férias e Folgas', 2) RETURNING id INTO v_parent;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (t.id,'rh','Solicitação de férias',v_parent,1),
      (t.id,'rh','Abono',v_parent,2),
      (t.id,'rh','Banco de horas',v_parent,3);

    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
      VALUES (t.id, 'rh', 'Folha e Benefícios', 3) RETURNING id INTO v_parent;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (t.id,'rh','Holerite',v_parent,1),
      (t.id,'rh','Vale-transporte',v_parent,2),
      (t.id,'rh','Vale-refeição',v_parent,3),
      (t.id,'rh','Plano de saúde',v_parent,4);

    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
      VALUES (t.id, 'rh', 'Atestados e Afastamentos', 4) RETURNING id INTO v_parent;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (t.id,'rh','Atestado médico',v_parent,1),
      (t.id,'rh','INSS',v_parent,2),
      (t.id,'rh','Licenças',v_parent,3);

    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
      VALUES (t.id, 'rh', 'Relacionamento', 5) RETURNING id INTO v_parent;
    INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, sort_order) VALUES
      (t.id,'rh','Dúvida trabalhista',v_parent,1),
      (t.id,'rh','Feedback',v_parent,2),
      (t.id,'rh','Reclamação confidencial',v_parent,3);

    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order) VALUES
      (t.id,'rh','Outros',99);
  END LOOP;
END $$;
