-- Função para criar categorias padrão de chamados
CREATE OR REPLACE FUNCTION public.seed_default_ticket_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Inserir categorias padrão de chamados para o novo tenant
    INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
    VALUES
        (NEW.id, 'tickets', 'Admissional', 1),
        (NEW.id, 'tickets', 'Demissional', 2),
        (NEW.id, 'tickets', 'Hardware', 3),
        (NEW.id, 'tickets', 'Software', 4),
        (NEW.id, 'tickets', 'Rede', 5),
        (NEW.id, 'tickets', 'Acesso/Permissões', 6);
    
    RETURN NEW;
END;
$$;

-- Trigger para executar após criar tenant
CREATE TRIGGER trigger_seed_default_categories
AFTER INSERT ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.seed_default_ticket_categories();

-- Inserir categorias para tenants existentes (one-time migration)
INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
SELECT 
    t.id,
    'tickets',
    category.name,
    category.sort_order
FROM public.tenants t
CROSS JOIN (
    VALUES 
        ('Admissional', 1),
        ('Demissional', 2),
        ('Hardware', 3),
        ('Software', 4),
        ('Rede', 5),
        ('Acesso/Permissões', 6)
) AS category(name, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM public.ti_categories tc 
    WHERE tc.tenant_id = t.id AND tc.module = 'tickets'
);