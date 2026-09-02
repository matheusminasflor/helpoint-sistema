
-- 1) Corrigir trigger de criação de chamado de RH (faltava requester_id que é NOT NULL)
CREATE OR REPLACE FUNCTION public.create_rh_ticket_from_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _category_id uuid;
  _ticket_id uuid;
  _title text;
  _description text;
  _category_search text;
BEGIN
  IF TG_TABLE_NAME = 'rh_vacation_requests' THEN
    _category_search := CASE NEW.type
      WHEN 'ferias' THEN 'Solicitação de férias'
      WHEN 'abono' THEN 'Abono'
      WHEN 'banco_horas' THEN 'Banco de horas'
    END;
    _title := 'Solicitação de ' || _category_search || ' — ' ||
              to_char(NEW.start_date, 'DD/MM') || ' a ' || to_char(NEW.end_date, 'DD/MM/YYYY');
    _description := format(
      E'Tipo: %s\nPeríodo: %s a %s (%s dias)\nObservações: %s',
      _category_search,
      to_char(NEW.start_date, 'DD/MM/YYYY'),
      to_char(NEW.end_date, 'DD/MM/YYYY'),
      NEW.days_requested,
      COALESCE(NEW.notes, '—')
    );
  ELSIF TG_TABLE_NAME = 'rh_medical_certificates' THEN
    _category_search := 'Atestado médico';
    _title := 'Atestado médico — ' || NEW.days_off || ' dia(s) a partir de ' || to_char(NEW.issue_date, 'DD/MM/YYYY');
    _description := format(
      E'Data do atestado: %s\nDias de afastamento: %s\nMédico: %s\nCRM: %s\nCID: %s',
      to_char(NEW.issue_date, 'DD/MM/YYYY'),
      NEW.days_off,
      COALESCE(NEW.doctor_name, '—'),
      COALESCE(NEW.doctor_crm, '—'),
      COALESCE(NEW.cid_code, '—')
    );
  ELSE
    RETURN NEW;
  END IF;

  SELECT id INTO _category_id
  FROM public.ti_categories
  WHERE tenant_id = NEW.tenant_id
    AND module = 'rh'
    AND name = _category_search
  LIMIT 1;

  INSERT INTO public.tickets (
    tenant_id, module, title, description, category_id,
    priority, status, created_by, requester_id
  ) VALUES (
    NEW.tenant_id, 'rh', _title, _description, _category_id,
    'medium', 'open', NEW.user_id, NEW.user_id
  )
  RETURNING id INTO _ticket_id;

  NEW.ticket_id := _ticket_id;
  RETURN NEW;
END;
$function$;

-- 2) Campos de tracking de envio do convite
ALTER TABLE public.tenant_invites
  ADD COLUMN IF NOT EXISTS send_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS send_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_send_error text,
  ADD COLUMN IF NOT EXISTS department text;

-- (department pode já existir; ADD IF NOT EXISTS é safe)

-- 3) Expandir licenças para domínios/URLs
ALTER TABLE public.software_licenses
  ADD COLUMN IF NOT EXISTS item_category text NOT NULL DEFAULT 'software',
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS public_url text,
  ADD COLUMN IF NOT EXISTS admin_url text,
  ADD COLUMN IF NOT EXISTS internal_owner text,
  ADD COLUMN IF NOT EXISTS technical_notes text;
