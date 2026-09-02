DROP FUNCTION IF EXISTS public.create_ticket_checklists_for_ticket();

CREATE OR REPLACE FUNCTION public.create_ticket_checklists_for_ticket(_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket RECORD;
  _binding RECORD;
  _ticket_checklist_id uuid;
BEGIN
  SELECT id, tenant_id, category_id
    INTO _ticket
  FROM public.tickets
  WHERE id = _ticket_id;

  IF _ticket.id IS NULL OR _ticket.category_id IS NULL THEN
    RETURN;
  END IF;

  FOR _binding IN
    SELECT b.id, b.template_id, b.priority
    FROM public.checklist_template_bindings b
    JOIN public.checklist_templates t ON t.id = b.template_id
    WHERE b.tenant_id = _ticket.tenant_id
      AND t.tenant_id = _ticket.tenant_id
      AND t.is_active = true
      AND t.module = 'tickets'
      AND b.target_type = 'category'
      AND b.target_id = _ticket.category_id
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