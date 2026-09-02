-- Compliance checklist templates for ticket workflows
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  module TEXT NOT NULL DEFAULT 'tickets',
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT checklist_templates_module_check CHECK (module IN ('tickets'))
);

CREATE TABLE IF NOT EXISTS public.checklist_template_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL DEFAULT 'category',
  target_id UUID NOT NULL REFERENCES public.ti_categories(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT checklist_template_bindings_target_type_check CHECK (target_type IN ('category', 'form'))
);

CREATE TABLE IF NOT EXISTS public.checklist_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  responsible_sector TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ticket_checklists_status_check CHECK (status IN ('active', 'completed', 'skipped')),
  CONSTRAINT ticket_checklists_ticket_template_unique UNIQUE (ticket_id, template_id)
);

CREATE TABLE IF NOT EXISTS public.ticket_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  ticket_checklist_id UUID NOT NULL REFERENCES public.ticket_checklists(id) ON DELETE CASCADE,
  template_item_id UUID REFERENCES public.checklist_template_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  responsible_sector TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_tenant_module ON public.checklist_templates (tenant_id, module, is_active);
CREATE INDEX IF NOT EXISTS idx_checklist_template_bindings_template ON public.checklist_template_bindings (template_id, target_type, target_id, priority);
CREATE INDEX IF NOT EXISTS idx_checklist_template_items_template ON public.checklist_template_items (template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ticket_checklists_ticket ON public.ticket_checklists (ticket_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_ticket_checklist_items_checklist ON public.ticket_checklist_items (ticket_checklist_id, sort_order);

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sync_ticket_checklist_status(_ticket_checklist_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pending_required_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO _pending_required_count
  FROM public.ticket_checklist_items
  WHERE ticket_checklist_id = _ticket_checklist_id
    AND is_required = true
    AND is_completed = false;

  UPDATE public.ticket_checklists
  SET status = CASE WHEN _pending_required_count = 0 THEN 'completed' ELSE 'active' END,
      updated_at = now()
  WHERE id = _ticket_checklist_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_ticket_checklist_item_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_completed = true AND (OLD.is_completed IS DISTINCT FROM true) THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    NEW.completed_by := COALESCE(NEW.completed_by, auth.uid());
  ELSIF NEW.is_completed = false THEN
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.after_ticket_checklist_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_ticket_checklist_status(COALESCE(NEW.ticket_checklist_id, OLD.ticket_checklist_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_ticket_checklists_for_ticket(_ticket_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket RECORD;
  _binding RECORD;
  _ticket_checklist_id UUID;
BEGIN
  SELECT id, tenant_id, category
    INTO _ticket
  FROM public.tickets
  WHERE id = _ticket_id;

  IF _ticket.id IS NULL OR _ticket.category IS NULL THEN
    RETURN;
  END IF;

  FOR _binding IN
    SELECT b.id, b.template_id, b.priority
    FROM public.checklist_template_bindings b
    JOIN public.checklist_templates t ON t.id = b.template_id
    JOIN public.ti_categories c ON c.id = b.target_id
    WHERE b.tenant_id = _ticket.tenant_id
      AND t.tenant_id = _ticket.tenant_id
      AND t.is_active = true
      AND b.target_type = 'category'
      AND c.module = 'tickets'
      AND c.name = _ticket.category
    ORDER BY b.priority DESC, b.created_at ASC
  LOOP
    INSERT INTO public.ticket_checklists (tenant_id, ticket_id, template_id, status)
    VALUES (_ticket.tenant_id, _ticket.id, _binding.template_id, 'active')
    ON CONFLICT (ticket_id, template_id) DO NOTHING
    RETURNING id INTO _ticket_checklist_id;

    IF _ticket_checklist_id IS NOT NULL THEN
      INSERT INTO public.ticket_checklist_items (
        tenant_id,
        ticket_checklist_id,
        template_item_id,
        description,
        is_required,
        responsible_sector,
        sort_order
      )
      SELECT
        _ticket.tenant_id,
        _ticket_checklist_id,
        i.id,
        i.description,
        i.is_required,
        i.responsible_sector,
        i.sort_order
      FROM public.checklist_template_items i
      WHERE i.template_id = _binding.template_id
        AND i.is_active = true
      ORDER BY i.sort_order ASC, i.created_at ASC;

      PERFORM public.sync_ticket_checklist_status(_ticket_checklist_id);
    END IF;

    _ticket_checklist_id := NULL;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_ticket_checklist_before_closing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pending_required_count INTEGER;
BEGIN
  IF NEW.status IN ('resolved', 'closed')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT COUNT(*)
      INTO _pending_required_count
    FROM public.ticket_checklists tc
    JOIN public.ticket_checklist_items tci ON tci.ticket_checklist_id = tc.id
    WHERE tc.ticket_id = NEW.id
      AND tc.tenant_id = NEW.tenant_id
      AND tci.is_required = true
      AND tci.is_completed = false;

    IF _pending_required_count > 0 THEN
      RAISE EXCEPTION 'Não é possível encerrar: existem itens pendentes no Checklist de Conformidade.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_ticket_checklists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_ticket_checklists_for_ticket(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_checklist_items_before_update ON public.ticket_checklist_items;
CREATE TRIGGER trg_ticket_checklist_items_before_update
BEFORE UPDATE ON public.ticket_checklist_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_ticket_checklist_item_update();

DROP TRIGGER IF EXISTS trg_ticket_checklist_items_after_change ON public.ticket_checklist_items;
CREATE TRIGGER trg_ticket_checklist_items_after_change
AFTER INSERT OR UPDATE OR DELETE ON public.ticket_checklist_items
FOR EACH ROW
EXECUTE FUNCTION public.after_ticket_checklist_item_change();

DROP TRIGGER IF EXISTS trg_tickets_create_checklists ON public.tickets;
CREATE TRIGGER trg_tickets_create_checklists
AFTER INSERT ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_ticket_checklists();

DROP TRIGGER IF EXISTS trg_tickets_enforce_checklist_before_closing ON public.tickets;
CREATE TRIGGER trg_tickets_enforce_checklist_before_closing
BEFORE UPDATE ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.enforce_ticket_checklist_before_closing();

DROP TRIGGER IF EXISTS trg_checklist_templates_updated_at ON public.checklist_templates;
CREATE TRIGGER trg_checklist_templates_updated_at
BEFORE UPDATE ON public.checklist_templates
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_checklist_template_bindings_updated_at ON public.checklist_template_bindings;
CREATE TRIGGER trg_checklist_template_bindings_updated_at
BEFORE UPDATE ON public.checklist_template_bindings
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_checklist_template_items_updated_at ON public.checklist_template_items;
CREATE TRIGGER trg_checklist_template_items_updated_at
BEFORE UPDATE ON public.checklist_template_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_ticket_checklists_updated_at ON public.ticket_checklists;
CREATE TRIGGER trg_ticket_checklists_updated_at
BEFORE UPDATE ON public.ticket_checklists
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_ticket_checklist_items_updated_at ON public.ticket_checklist_items;
CREATE TRIGGER trg_ticket_checklist_items_updated_at
BEFORE UPDATE ON public.ticket_checklist_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_checklist_templates_audit ON public.checklist_templates;
CREATE TRIGGER trg_checklist_templates_audit
AFTER INSERT OR UPDATE OR DELETE ON public.checklist_templates
FOR EACH ROW
EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_checklist_template_bindings_audit ON public.checklist_template_bindings;
CREATE TRIGGER trg_checklist_template_bindings_audit
AFTER INSERT OR UPDATE OR DELETE ON public.checklist_template_bindings
FOR EACH ROW
EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_checklist_template_items_audit ON public.checklist_template_items;
CREATE TRIGGER trg_checklist_template_items_audit
AFTER INSERT OR UPDATE OR DELETE ON public.checklist_template_items
FOR EACH ROW
EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_ticket_checklists_audit ON public.ticket_checklists;
CREATE TRIGGER trg_ticket_checklists_audit
AFTER INSERT OR UPDATE OR DELETE ON public.ticket_checklists
FOR EACH ROW
EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_ticket_checklist_items_audit ON public.ticket_checklist_items;
CREATE TRIGGER trg_ticket_checklist_items_audit
AFTER INSERT OR UPDATE OR DELETE ON public.ticket_checklist_items
FOR EACH ROW
EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_checklist_templates_tenant ON public.checklist_templates;
CREATE TRIGGER trg_checklist_templates_tenant
BEFORE INSERT ON public.checklist_templates
FOR EACH ROW
EXECUTE FUNCTION public.inject_tenant_id();

DROP TRIGGER IF EXISTS trg_checklist_template_bindings_tenant ON public.checklist_template_bindings;
CREATE TRIGGER trg_checklist_template_bindings_tenant
BEFORE INSERT ON public.checklist_template_bindings
FOR EACH ROW
EXECUTE FUNCTION public.inject_tenant_id();

DROP TRIGGER IF EXISTS trg_checklist_template_items_tenant ON public.checklist_template_items;
CREATE TRIGGER trg_checklist_template_items_tenant
BEFORE INSERT ON public.checklist_template_items
FOR EACH ROW
EXECUTE FUNCTION public.inject_tenant_id();

DROP TRIGGER IF EXISTS trg_ticket_checklists_tenant ON public.ticket_checklists;
CREATE TRIGGER trg_ticket_checklists_tenant
BEFORE INSERT ON public.ticket_checklists
FOR EACH ROW
EXECUTE FUNCTION public.inject_tenant_id();

DROP TRIGGER IF EXISTS trg_ticket_checklist_items_tenant ON public.ticket_checklist_items;
CREATE TRIGGER trg_ticket_checklist_items_tenant
BEFORE INSERT ON public.ticket_checklist_items
FOR EACH ROW
EXECUTE FUNCTION public.inject_tenant_id();

DROP POLICY IF EXISTS "Admins manage checklist templates" ON public.checklist_templates;
CREATE POLICY "Admins manage checklist templates"
ON public.checklist_templates
FOR ALL
USING ((tenant_id = get_user_tenant_id()) AND is_supervisor_or_higher(auth.uid()))
WITH CHECK ((tenant_id = get_user_tenant_id()) AND is_supervisor_or_higher(auth.uid()));

DROP POLICY IF EXISTS "Admins manage checklist bindings" ON public.checklist_template_bindings;
CREATE POLICY "Admins manage checklist bindings"
ON public.checklist_template_bindings
FOR ALL
USING ((tenant_id = get_user_tenant_id()) AND is_supervisor_or_higher(auth.uid()))
WITH CHECK ((tenant_id = get_user_tenant_id()) AND is_supervisor_or_higher(auth.uid()));

DROP POLICY IF EXISTS "Admins manage checklist template items" ON public.checklist_template_items;
CREATE POLICY "Admins manage checklist template items"
ON public.checklist_template_items
FOR ALL
USING ((tenant_id = get_user_tenant_id()) AND is_supervisor_or_higher(auth.uid()))
WITH CHECK ((tenant_id = get_user_tenant_id()) AND is_supervisor_or_higher(auth.uid()));

DROP POLICY IF EXISTS "Users view ticket checklists" ON public.ticket_checklists;
CREATE POLICY "Users view ticket checklists"
ON public.ticket_checklists
FOR SELECT
USING (
  (tenant_id = get_user_tenant_id())
  AND EXISTS (
    SELECT 1
    FROM public.tickets t
    WHERE t.id = ticket_id
      AND ((t.requester_id = auth.uid()) OR (t.assigned_to = auth.uid()) OR has_role(auth.uid(), 'member'::app_role) OR is_supervisor_or_higher(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Technicians create ticket checklists" ON public.ticket_checklists;
CREATE POLICY "Technicians create ticket checklists"
ON public.ticket_checklists
FOR INSERT
WITH CHECK (
  (tenant_id = get_user_tenant_id())
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_id
      AND t.tenant_id = ticket_checklists.tenant_id
      AND ((t.requester_id = auth.uid()) OR (t.assigned_to = auth.uid()) OR has_role(auth.uid(), 'member'::app_role) OR is_supervisor_or_higher(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Technicians update ticket checklists" ON public.ticket_checklists;
CREATE POLICY "Technicians update ticket checklists"
ON public.ticket_checklists
FOR UPDATE
USING (
  (tenant_id = get_user_tenant_id())
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_id
      AND t.tenant_id = ticket_checklists.tenant_id
      AND ((t.assigned_to = auth.uid()) OR has_role(auth.uid(), 'member'::app_role) OR is_supervisor_or_higher(auth.uid()))
  )
)
WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "Users view ticket checklist items" ON public.ticket_checklist_items;
CREATE POLICY "Users view ticket checklist items"
ON public.ticket_checklist_items
FOR SELECT
USING (
  (tenant_id = get_user_tenant_id())
  AND EXISTS (
    SELECT 1
    FROM public.ticket_checklists tc
    JOIN public.tickets t ON t.id = tc.ticket_id
    WHERE tc.id = ticket_checklist_id
      AND tc.tenant_id = ticket_checklist_items.tenant_id
      AND ((t.requester_id = auth.uid()) OR (t.assigned_to = auth.uid()) OR has_role(auth.uid(), 'member'::app_role) OR is_supervisor_or_higher(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Technicians create ticket checklist items" ON public.ticket_checklist_items;
CREATE POLICY "Technicians create ticket checklist items"
ON public.ticket_checklist_items
FOR INSERT
WITH CHECK (
  (tenant_id = get_user_tenant_id())
  AND EXISTS (
    SELECT 1
    FROM public.ticket_checklists tc
    JOIN public.tickets t ON t.id = tc.ticket_id
    WHERE tc.id = ticket_checklist_id
      AND tc.tenant_id = ticket_checklist_items.tenant_id
      AND ((t.assigned_to = auth.uid()) OR has_role(auth.uid(), 'member'::app_role) OR is_supervisor_or_higher(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Technicians update ticket checklist items" ON public.ticket_checklist_items;
CREATE POLICY "Technicians update ticket checklist items"
ON public.ticket_checklist_items
FOR UPDATE
USING (
  (tenant_id = get_user_tenant_id())
  AND EXISTS (
    SELECT 1
    FROM public.ticket_checklists tc
    JOIN public.tickets t ON t.id = tc.ticket_id
    WHERE tc.id = ticket_checklist_id
      AND tc.tenant_id = ticket_checklist_items.tenant_id
      AND ((t.assigned_to = auth.uid()) OR has_role(auth.uid(), 'member'::app_role) OR is_supervisor_or_higher(auth.uid()))
  )
)
WITH CHECK (tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "Supervisors delete ticket checklist items" ON public.ticket_checklist_items;
CREATE POLICY "Supervisors delete ticket checklist items"
ON public.ticket_checklist_items
FOR DELETE
USING ((tenant_id = get_user_tenant_id()) AND is_supervisor_or_higher(auth.uid()));