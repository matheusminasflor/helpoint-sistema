
-- 1. Add sync_tickets_to_kanban column
ALTER TABLE public.kanban_boards ADD COLUMN IF NOT EXISTS sync_tickets_to_kanban boolean NOT NULL DEFAULT false;

-- 2. Create function to ensure department kanban boards exist
CREATE OR REPLACE FUNCTION public.ensure_department_kanban_boards(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _dept text;
  _board_id uuid;
  _departments text[] := ARRAY['ti', 'marketing', 'comercial', 'rh', 'financeiro', 'juridico', 'operacoes', 'administrativo'];
  _dept_names text[];
  _dept_name text;
  _helpdesk_depts text[] := ARRAY['ti', 'marketing'];
BEGIN
  _dept_names := ARRAY['TI', 'Marketing', 'Comercial', 'RH', 'Financeiro', 'Jurídico', 'Operações', 'Administrativo'];

  FOR i IN 1..array_length(_departments, 1) LOOP
    _dept := _departments[i];
    _dept_name := _dept_names[i];

    -- Check if board already exists
    SELECT id INTO _board_id
    FROM public.kanban_boards
    WHERE tenant_id = p_tenant_id AND department = _dept AND is_active = true
    LIMIT 1;

    IF _board_id IS NULL THEN
      INSERT INTO public.kanban_boards (tenant_id, department, name, is_active)
      VALUES (p_tenant_id, _dept, 'Projetos ' || _dept_name, true)
      RETURNING id INTO _board_id;

      IF _dept = ANY(_helpdesk_depts) THEN
        -- Helpdesk columns for TI and Marketing
        INSERT INTO public.kanban_columns (tenant_id, board_id, name, color, sort_order, is_done_column) VALUES
          (p_tenant_id, _board_id, 'Chamados',      '#6B7280', 0, false),
          (p_tenant_id, _board_id, 'Pendentes',      '#EAB308', 1, false),
          (p_tenant_id, _board_id, 'Em Andamento',   '#3B82F6', 2, false),
          (p_tenant_id, _board_id, 'Vencidos',       '#EF4444', 3, false),
          (p_tenant_id, _board_id, 'Concluídos',     '#22C55E', 4, true);
      ELSE
        -- Standard columns for other departments
        INSERT INTO public.kanban_columns (tenant_id, board_id, name, color, sort_order, is_done_column) VALUES
          (p_tenant_id, _board_id, 'A Fazer',        '#6B7280', 0, false),
          (p_tenant_id, _board_id, 'Em Andamento',   '#3B82F6', 1, false),
          (p_tenant_id, _board_id, 'Bloqueado',      '#EF4444', 2, false),
          (p_tenant_id, _board_id, 'Concluído',      '#22C55E', 3, true);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- 3. Backfill: create boards for all existing tenants
DO $$
DECLARE
  _tenant RECORD;
BEGIN
  FOR _tenant IN SELECT id FROM public.tenants LOOP
    PERFORM public.ensure_department_kanban_boards(_tenant.id);
  END LOOP;
END;
$$;

-- 4. Also auto-create boards when new tenant is created (trigger on tenants)
CREATE OR REPLACE FUNCTION public.auto_create_kanban_boards_for_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.ensure_department_kanban_boards(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_kanban_boards ON public.tenants;
CREATE TRIGGER trg_auto_kanban_boards
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_kanban_boards_for_tenant();

-- 5. Trigger: sync ticket to kanban on ticket creation
CREATE OR REPLACE FUNCTION public.sync_ticket_to_kanban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _department text;
  _board_id uuid;
  _column_id uuid;
  _next_order int;
  _priority text;
BEGIN
  -- Map module to department
  IF NEW.module = 'tickets' THEN
    _department := 'ti';
  ELSIF NEW.module = 'marketing' THEN
    _department := 'marketing';
  ELSE
    RETURN NEW;
  END IF;

  -- Find the board with sync enabled
  SELECT id INTO _board_id
  FROM public.kanban_boards
  WHERE tenant_id = NEW.tenant_id
    AND department = _department
    AND is_active = true
    AND sync_tickets_to_kanban = true
  LIMIT 1;

  IF _board_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find the "Chamados" column (sort_order = 0)
  SELECT id INTO _column_id
  FROM public.kanban_columns
  WHERE board_id = _board_id AND sort_order = 0
  LIMIT 1;

  IF _column_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get next sort order
  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO _next_order
  FROM public.kanban_cards
  WHERE column_id = _column_id;

  -- Map priority
  _priority := COALESCE(NEW.priority, 'medium');

  -- Create card
  INSERT INTO public.kanban_cards (
    tenant_id, board_id, column_id, title, description,
    priority, source_type, source_id, created_by, sort_order
  ) VALUES (
    NEW.tenant_id, _board_id, _column_id,
    COALESCE(NEW.title, 'Chamado #' || NEW.ticket_number),
    'Chamado criado automaticamente via helpdesk',
    _priority, 'ticket', NEW.id::text,
    NEW.created_by, _next_order
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ticket_to_kanban ON public.tickets;
CREATE TRIGGER trg_sync_ticket_to_kanban
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ticket_to_kanban();
