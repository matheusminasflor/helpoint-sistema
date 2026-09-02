
-- Seed default categories for existing tenants (inventory)
INSERT INTO ti_categories (tenant_id, module, name, sort_order)
SELECT t.id, 'inventory', cat.name, cat.ord
FROM tenants t
CROSS JOIN (VALUES ('Hardware',1),('Software',2),('Periféricos',3),('Rede',4),('Móveis/Equipamentos',5)) AS cat(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM ti_categories c WHERE c.tenant_id = t.id AND c.module = 'inventory');

-- Seed default categories for existing tenants (contracts)
INSERT INTO ti_categories (tenant_id, module, name, sort_order)
SELECT t.id, 'contracts', cat.name, cat.ord
FROM tenants t
CROSS JOIN (VALUES ('Suporte',1),('Manutenção',2),('SaaS/Cloud',3),('Telecomunicações',4),('Locação',5)) AS cat(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM ti_categories c WHERE c.tenant_id = t.id AND c.module = 'contracts');

-- Seed default categories for existing tenants (licenses)
INSERT INTO ti_categories (tenant_id, module, name, sort_order)
SELECT t.id, 'licenses', cat.name, cat.ord
FROM tenants t
CROSS JOIN (VALUES ('Sistema Operacional',1),('Produtividade',2),('Segurança',3),('Desenvolvimento',4),('Outros',5)) AS cat(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM ti_categories c WHERE c.tenant_id = t.id AND c.module = 'licenses');

-- Seed default categories for existing tenants (maintenances)
INSERT INTO ti_categories (tenant_id, module, name, sort_order)
SELECT t.id, 'maintenances', cat.name, cat.ord
FROM tenants t
CROSS JOIN (VALUES ('Preventiva',1),('Corretiva',2),('Preditiva',3),('Instalação',4),('Desinstalação',5)) AS cat(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM ti_categories c WHERE c.tenant_id = t.id AND c.module = 'maintenances');

-- Drop old trigger first
DROP TRIGGER IF EXISTS trigger_seed_default_categories ON public.tenants;
DROP TRIGGER IF EXISTS seed_ticket_categories_on_tenant ON public.tenants;
DROP TRIGGER IF EXISTS seed_ti_categories_on_tenant ON public.tenants;

-- Now safe to drop old function
DROP FUNCTION IF EXISTS public.seed_default_ticket_categories();

-- Create new unified function
CREATE OR REPLACE FUNCTION public.seed_default_ti_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
    VALUES
        (NEW.id, 'tickets', 'Admissional', 1),
        (NEW.id, 'tickets', 'Demissional', 2),
        (NEW.id, 'tickets', 'Hardware', 3),
        (NEW.id, 'tickets', 'Software', 4),
        (NEW.id, 'tickets', 'Rede', 5),
        (NEW.id, 'tickets', 'Acesso/Permissões', 6),
        (NEW.id, 'inventory', 'Hardware', 1),
        (NEW.id, 'inventory', 'Software', 2),
        (NEW.id, 'inventory', 'Periféricos', 3),
        (NEW.id, 'inventory', 'Rede', 4),
        (NEW.id, 'inventory', 'Móveis/Equipamentos', 5),
        (NEW.id, 'contracts', 'Suporte', 1),
        (NEW.id, 'contracts', 'Manutenção', 2),
        (NEW.id, 'contracts', 'SaaS/Cloud', 3),
        (NEW.id, 'contracts', 'Telecomunicações', 4),
        (NEW.id, 'contracts', 'Locação', 5),
        (NEW.id, 'licenses', 'Sistema Operacional', 1),
        (NEW.id, 'licenses', 'Produtividade', 2),
        (NEW.id, 'licenses', 'Segurança', 3),
        (NEW.id, 'licenses', 'Desenvolvimento', 4),
        (NEW.id, 'licenses', 'Outros', 5),
        (NEW.id, 'maintenances', 'Preventiva', 1),
        (NEW.id, 'maintenances', 'Corretiva', 2),
        (NEW.id, 'maintenances', 'Preditiva', 3),
        (NEW.id, 'maintenances', 'Instalação', 4),
        (NEW.id, 'maintenances', 'Desinstalação', 5);
    RETURN NEW;
END;
$function$;

-- Create new trigger
CREATE TRIGGER seed_ti_categories_on_tenant
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_ti_categories();
