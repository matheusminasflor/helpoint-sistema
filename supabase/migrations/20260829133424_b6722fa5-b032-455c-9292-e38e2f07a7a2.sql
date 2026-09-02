DO $$
DECLARE
  t RECORD;
  m TEXT;
  names TEXT[];
  n TEXT;
  i INT;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    FOREACH m IN ARRAY ARRAY['rh','qualidade','marketing'] LOOP
      IF NOT EXISTS (SELECT 1 FROM public.ti_categories c WHERE c.tenant_id = t.id AND c.module = m) THEN
        names := CASE m
          WHEN 'rh' THEN ARRAY['Férias','Atestado','Reembolso','Dúvida/Solicitação']
          WHEN 'qualidade' THEN ARRAY['Reclamação','Sugestão','Dúvida']
          ELSE ARRAY['Solicitação de Arte','Evento','Campanha','Outros']
        END;
        i := 0;
        FOREACH n IN ARRAY names LOOP
          INSERT INTO public.ti_categories (tenant_id, module, name, parent_id, is_active, sort_order)
          VALUES (t.id, m, n, NULL, true, i);
          i := i + 1;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
END $$;