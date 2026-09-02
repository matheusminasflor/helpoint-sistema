
-- Canal único de notificações (consumido depois por e-mail e WhatsApp)
CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_type text NOT NULL,
  channel text NOT NULL DEFAULT 'email',          -- 'email' | 'whatsapp' | 'internal'
  recipient_email text,
  recipient_phone text,
  recipient_user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',         -- 'pending' | 'sent' | 'failed' | 'skipped'
  idempotency_key text UNIQUE,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_events_status ON public.notification_events(status, channel, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_events_tenant ON public.notification_events(tenant_id);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant reads own notification events" ON public.notification_events;
CREATE POLICY "tenant reads own notification events" ON public.notification_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id() AND public.is_admin_or_higher(auth.uid()));

-- inserts somente via SECURITY DEFINER trigger / RPC; nada de insert direto pelo cliente
DROP POLICY IF EXISTS "no direct insert" ON public.notification_events;

-- Trigger: novo comentário do staff (não interno) → emite 'sac_reply'
CREATE OR REPLACE FUNCTION public.emit_sac_reply_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket RECORD;
  _tenant_name text;
BEGIN
  IF NEW.is_internal = true OR NEW.author_type <> 'staff' THEN
    RETURN NEW;
  END IF;
  SELECT t.*, tn.name AS tenant_name
    INTO _ticket
  FROM public.sac_tickets t
  JOIN public.tenants tn ON tn.id = t.tenant_id
  WHERE t.id = NEW.ticket_id;
  IF _ticket.id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.notification_events (
    tenant_id, event_type, channel, recipient_email, recipient_user_id,
    payload, idempotency_key
  ) VALUES (
    _ticket.tenant_id,
    'sac.reply',
    'email',
    _ticket.customer_email,
    _ticket.customer_user_id,
    jsonb_build_object(
      'tenantName', _ticket.tenant_name,
      'customerName', _ticket.customer_name,
      'protocol', 'SAC-' || lpad(_ticket.ticket_number::text, 5, '0'),
      'subject', COALESCE(_ticket.subject, _ticket.product_name),
      'preview', left(NEW.content, 240),
      'ticketUrl', '/sac/meus-chamados/' || _ticket.id
    ),
    'sac-reply-' || NEW.id
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_sac_reply ON public.sac_ticket_comments;
CREATE TRIGGER trg_emit_sac_reply
AFTER INSERT ON public.sac_ticket_comments
FOR EACH ROW EXECUTE FUNCTION public.emit_sac_reply_event();

-- Trigger: mudança para resolved → emite 'sac_resolved'
CREATE OR REPLACE FUNCTION public.emit_sac_resolved_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_name text;
BEGIN
  IF NEW.status <> 'resolved' OR OLD.status = 'resolved' THEN
    RETURN NEW;
  END IF;
  SELECT name INTO _tenant_name FROM public.tenants WHERE id = NEW.tenant_id;

  INSERT INTO public.notification_events (
    tenant_id, event_type, channel, recipient_email, recipient_user_id,
    payload, idempotency_key
  ) VALUES (
    NEW.tenant_id,
    'sac.resolved',
    'email',
    NEW.customer_email,
    NEW.customer_user_id,
    jsonb_build_object(
      'tenantName', _tenant_name,
      'customerName', NEW.customer_name,
      'protocol', 'SAC-' || lpad(NEW.ticket_number::text, 5, '0'),
      'subject', COALESCE(NEW.subject, NEW.product_name),
      'resolutionSummary', COALESCE(NEW.resolution_summary, ''),
      'ticketUrl', '/sac/meus-chamados/' || NEW.id
    ),
    'sac-resolved-' || NEW.id
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_sac_resolved ON public.sac_tickets;
CREATE TRIGGER trg_emit_sac_resolved
AFTER UPDATE OF status ON public.sac_tickets
FOR EACH ROW EXECUTE FUNCTION public.emit_sac_resolved_event();
