
CREATE OR REPLACE FUNCTION public.sac_auto_status_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cur text;
BEGIN
  IF NEW.is_internal = true THEN RETURN NEW; END IF;
  SELECT status INTO _cur FROM public.sac_tickets WHERE id = NEW.ticket_id;
  IF _cur IN ('resolved','closed') THEN RETURN NEW; END IF;
  IF NEW.author_type = 'staff' THEN
    UPDATE public.sac_tickets SET status = 'awaiting_customer'
      WHERE id = NEW.ticket_id AND status <> 'awaiting_customer';
  ELSIF NEW.author_type = 'customer' THEN
    UPDATE public.sac_tickets SET status = 'in_analysis'
      WHERE id = NEW.ticket_id AND status <> 'in_analysis';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sac_auto_status_on_reply ON public.sac_ticket_comments;
CREATE TRIGGER trg_sac_auto_status_on_reply
AFTER INSERT ON public.sac_ticket_comments
FOR EACH ROW EXECUTE FUNCTION public.sac_auto_status_on_reply();
