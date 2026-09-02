CREATE OR REPLACE FUNCTION public.seed_default_financeiro_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.ti_categories (tenant_id, module, name, sort_order) VALUES
    (NEW.id, 'financeiro', 'Compras', 1),
    (NEW.id, 'financeiro', 'Reembolso', 2);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS seed_financeiro_categories_on_tenant ON public.tenants;
CREATE TRIGGER seed_financeiro_categories_on_tenant
AFTER INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.seed_default_financeiro_categories();