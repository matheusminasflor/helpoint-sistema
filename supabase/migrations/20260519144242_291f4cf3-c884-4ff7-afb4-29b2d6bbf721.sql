-- 1. Garantir que qualquer staff do tenant possa atualizar status do SAC,
--    mesmo sem registro em user_roles (caso comum em tenants novos).
DROP POLICY IF EXISTS "Internal team manages SAC tickets of their tenant" ON public.sac_tickets;

CREATE POLICY "Staff do tenant podem atualizar SAC"
ON public.sac_tickets
FOR UPDATE
USING (
  tenant_id = public.get_user_tenant_id()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tenant_id = sac_tickets.tenant_id)
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id()
);

-- 2. Mesma flexibilização para INSERT staff e para comments
DROP POLICY IF EXISTS "Internal team can insert SAC tickets" ON public.sac_tickets;
CREATE POLICY "Staff do tenant podem inserir SAC"
ON public.sac_tickets
FOR INSERT
WITH CHECK (
  tenant_id = public.get_user_tenant_id()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tenant_id = sac_tickets.tenant_id)
);

-- 3. Mensagem mais clara no trigger de finalização
CREATE OR REPLACE FUNCTION public.enforce_sac_report_before_closing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('resolved','closed') AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.sac_technical_reports
      WHERE ticket_id = NEW.id AND status = 'completed'
    ) THEN
      RAISE EXCEPTION 'Laudo Técnico obrigatório: conclua o laudo antes de marcar o SAC como % .', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;