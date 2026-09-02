
-- 1. Popular SLA policies para tenants existentes
INSERT INTO sla_policies (tenant_id, name, priority, first_response_time, resolution_time)
SELECT t.id, 'SLA Crítico', 'critical', 60, 240
FROM tenants t WHERE NOT EXISTS (
  SELECT 1 FROM sla_policies sp WHERE sp.tenant_id = t.id AND sp.priority = 'critical'
);

INSERT INTO sla_policies (tenant_id, name, priority, first_response_time, resolution_time)
SELECT t.id, 'SLA Alto', 'high', 120, 480
FROM tenants t WHERE NOT EXISTS (
  SELECT 1 FROM sla_policies sp WHERE sp.tenant_id = t.id AND sp.priority = 'high'
);

INSERT INTO sla_policies (tenant_id, name, priority, first_response_time, resolution_time)
SELECT t.id, 'SLA Médio', 'medium', 240, 1440
FROM tenants t WHERE NOT EXISTS (
  SELECT 1 FROM sla_policies sp WHERE sp.tenant_id = t.id AND sp.priority = 'medium'
);

INSERT INTO sla_policies (tenant_id, name, priority, first_response_time, resolution_time)
SELECT t.id, 'SLA Baixo', 'low', 480, 2880
FROM tenants t WHERE NOT EXISTS (
  SELECT 1 FROM sla_policies sp WHERE sp.tenant_id = t.id AND sp.priority = 'low'
);

-- 2. Função para seed de SLA em novos tenants
CREATE OR REPLACE FUNCTION public.seed_default_sla_policies()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.sla_policies (tenant_id, name, priority, first_response_time, resolution_time)
  VALUES
    (NEW.id, 'SLA Crítico', 'critical', 60, 240),
    (NEW.id, 'SLA Alto', 'high', 120, 480),
    (NEW.id, 'SLA Médio', 'medium', 240, 1440),
    (NEW.id, 'SLA Baixo', 'low', 480, 2880);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para novos tenants
DROP TRIGGER IF EXISTS trigger_seed_sla_policies ON public.tenants;
CREATE TRIGGER trigger_seed_sla_policies
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_sla_policies();

-- 3. Função para calcular sla_due_at automaticamente
CREATE OR REPLACE FUNCTION public.calculate_sla_due_at()
RETURNS TRIGGER AS $$
DECLARE
  _resolution_time INTEGER;
BEGIN
  SELECT resolution_time INTO _resolution_time
  FROM public.sla_policies
  WHERE tenant_id = NEW.tenant_id
    AND priority = NEW.priority
    AND is_active = true
  LIMIT 1;

  IF _resolution_time IS NOT NULL AND NEW.sla_due_at IS NULL THEN
    NEW.sla_due_at := COALESCE(NEW.created_at, now()) + (_resolution_time || ' minutes')::interval;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger BEFORE INSERT em tickets
DROP TRIGGER IF EXISTS trigger_calculate_sla_due_at ON public.tickets;
CREATE TRIGGER trigger_calculate_sla_due_at
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_sla_due_at();
