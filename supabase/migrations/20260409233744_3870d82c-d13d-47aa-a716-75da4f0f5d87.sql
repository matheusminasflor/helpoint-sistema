
CREATE OR REPLACE FUNCTION public.enforce_linked_maintenance_before_closing()
RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('resolved', 'closed') AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF EXISTS (
      SELECT 1 FROM public.asset_maintenances
      WHERE ticket_id = NEW.id
      AND status NOT IN ('completed', 'cancelled')
    ) THEN
      RAISE EXCEPTION 'Não é possível encerrar: existe manutenção vinculada ainda em andamento.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER trg_enforce_maintenance_before_closing
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_linked_maintenance_before_closing();
