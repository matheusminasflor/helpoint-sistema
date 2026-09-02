INSERT INTO public.ti_categories (tenant_id, module, name, sort_order)
SELECT t.id, 'financeiro', v.name, v.sort_order
FROM public.tenants t
CROSS JOIN (VALUES ('Compras', 1), ('Reembolso', 2)) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ti_categories c
  WHERE c.tenant_id = t.id AND c.module = 'financeiro'
);