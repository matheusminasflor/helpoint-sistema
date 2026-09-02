ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS category_id uuid NULL;

ALTER TABLE public.tickets
DROP CONSTRAINT IF EXISTS tickets_category_id_fkey;

ALTER TABLE public.tickets
ADD CONSTRAINT tickets_category_id_fkey
FOREIGN KEY (category_id)
REFERENCES public.ti_categories(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_tenant_category_id
ON public.tickets (tenant_id, category_id);

CREATE OR REPLACE FUNCTION public.create_ticket_checklists_for_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _binding RECORD;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR _binding IN
    SELECT
      b.id,
      b.template_id,
      t.tenant_id,
      t.name AS template_name,
      t.description AS template_description
    FROM public.checklist_template_bindings b
    JOIN public.checklist_templates t ON t.id = b.template_id
    WHERE b.tenant_id = NEW.tenant_id
      AND t.tenant_id = NEW.tenant_id
      AND t.module = 'tickets'
      AND t.is_active = true
      AND b.target_id = NEW.category_id
    ORDER BY b.priority ASC, b.created_at ASC
  LOOP
    INSERT INTO public.ticket_checklists (
      tenant_id,
      ticket_id,
      template_id,
      title,
      description,
      status,
      progress_percentage
    )
    VALUES (
      NEW.tenant_id,
      NEW.id,
      _binding.template_id,
      _binding.template_name,
      _binding.template_description,
      'pending',
      0
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;