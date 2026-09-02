
-- Add new field types to the enum
ALTER TYPE public.form_field_type ADD VALUE IF NOT EXISTS 'delivery_datetime';
ALTER TYPE public.form_field_type ADD VALUE IF NOT EXISTS 'assignee_select';

-- Add due_date column to tickets
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS due_date timestamptz;

-- Replace sync_ticket_to_kanban to include due_date
CREATE OR REPLACE FUNCTION public.sync_ticket_to_kanban()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Create card with due_date from ticket
  INSERT INTO public.kanban_cards (
    tenant_id, board_id, column_id, title, description,
    priority, source_type, source_id, created_by, sort_order, due_date
  ) VALUES (
    NEW.tenant_id, _board_id, _column_id,
    COALESCE(NEW.title, 'Chamado #' || NEW.ticket_number),
    'Chamado criado automaticamente via helpdesk',
    _priority, 'ticket', NEW.id::text,
    NEW.created_by, _next_order,
    COALESCE(NEW.due_date, NEW.sla_due_at)
  );

  RETURN NEW;
END;
$function$;

-- Update calculate_sla_due_at to respect custom due_date
-- If due_date is set and is later than standard SLA, use it as sla_due_at
CREATE OR REPLACE FUNCTION public.calculate_sla_due_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _resolution_time INTEGER;
  _standard_sla timestamptz;
BEGIN
  -- If sla_due_at was manually set, don't override
  IF NEW.sla_due_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT resolution_time INTO _resolution_time
  FROM public.sla_policies
  WHERE tenant_id = NEW.tenant_id
    AND priority = NEW.priority
    AND is_active = true
  LIMIT 1;

  IF _resolution_time IS NOT NULL THEN
    _standard_sla := COALESCE(NEW.created_at, now()) + (_resolution_time || ' minutes')::interval;
    
    -- If custom due_date exists and is later than standard SLA, use due_date
    IF NEW.due_date IS NOT NULL AND NEW.due_date > _standard_sla THEN
      NEW.sla_due_at := NEW.due_date;
    ELSE
      NEW.sla_due_at := _standard_sla;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
