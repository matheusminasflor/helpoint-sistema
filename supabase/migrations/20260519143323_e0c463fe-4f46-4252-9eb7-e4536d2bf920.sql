ALTER TABLE public.mkt_ugc_content
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE OR REPLACE FUNCTION public.notify_ugc_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _notif_type text;
  _title text;
  _msg text;
BEGIN
  IF NEW.approval_status = OLD.approval_status OR NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status = 'approved' THEN
    _notif_type := 'ticket_created';
    _title := '✅ UGC aprovado: ' || NEW.title;
    _msg := 'Seu conteúdo foi aprovado e está liberado para uso.';
  ELSIF NEW.approval_status = 'rejected' THEN
    _notif_type := 'ticket_created';
    _title := '❌ UGC reprovado: ' || NEW.title;
    _msg := COALESCE('Motivo: ' || NEW.rejection_reason, 'Seu conteúdo foi reprovado pela equipe.');
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    tenant_id, user_id, type, reference_type, reference_id, title, message
  ) VALUES (
    NEW.tenant_id, NEW.created_by, _notif_type::notification_type,
    'ugc', NEW.id, _title, _msg
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ugc_notify_status ON public.mkt_ugc_content;
CREATE TRIGGER trg_ugc_notify_status
AFTER UPDATE OF approval_status ON public.mkt_ugc_content
FOR EACH ROW EXECUTE FUNCTION public.notify_ugc_status_change();