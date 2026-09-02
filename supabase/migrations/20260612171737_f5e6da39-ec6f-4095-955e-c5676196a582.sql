
-- Fase E: laudo técnico por produto

ALTER TABLE public.sac_technical_reports
  ADD COLUMN IF NOT EXISTS sac_ticket_product_id uuid REFERENCES public.sac_ticket_products(id) ON DELETE CASCADE;

-- Remover unique antigo (1 laudo por ticket) e permitir 1 laudo por produto
ALTER TABLE public.sac_technical_reports DROP CONSTRAINT IF EXISTS sac_technical_reports_ticket_id_key;

-- Único laudo por (ticket, produto). Permite múltiplos quando product_id é NULL? Para compat,
-- garantimos no máximo 1 laudo legado (sem product_id) por ticket.
CREATE UNIQUE INDEX IF NOT EXISTS sac_technical_reports_ticket_product_uidx
  ON public.sac_technical_reports (ticket_id, sac_ticket_product_id)
  WHERE sac_ticket_product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sac_technical_reports_ticket_legacy_uidx
  ON public.sac_technical_reports (ticket_id)
  WHERE sac_ticket_product_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sac_reports_product ON public.sac_technical_reports(sac_ticket_product_id);

-- Atualizar trigger: se há produtos, exigir 1 laudo completed por produto
CREATE OR REPLACE FUNCTION public.enforce_sac_report_before_closing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _product_count INTEGER;
  _completed_count INTEGER;
BEGIN
  IF NEW.status IN ('resolved','closed') AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT COUNT(*) INTO _product_count
    FROM public.sac_ticket_products WHERE ticket_id = NEW.id;

    IF _product_count > 0 THEN
      SELECT COUNT(DISTINCT r.sac_ticket_product_id)
        INTO _completed_count
      FROM public.sac_technical_reports r
      WHERE r.ticket_id = NEW.id
        AND r.status = 'completed'
        AND r.sac_ticket_product_id IN (
          SELECT id FROM public.sac_ticket_products WHERE ticket_id = NEW.id
        );

      IF _completed_count < _product_count THEN
        RAISE EXCEPTION 'Laudo Técnico obrigatório: conclua o laudo de cada produto (% de % concluídos) antes de marcar o SAC como %.',
          _completed_count, _product_count, NEW.status;
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM public.sac_technical_reports
        WHERE ticket_id = NEW.id AND status = 'completed'
      ) THEN
        RAISE EXCEPTION 'Laudo Técnico obrigatório: conclua o laudo antes de marcar o SAC como %.', NEW.status;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
