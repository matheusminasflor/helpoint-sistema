-- AS PERMISSÕES QUE O PADRÃO ANTIGO DO SUPABASE DAVA SOZINHO. 2026-09-30.
--
-- O QUE ACONTECEU. Na primeira subida da produção (`helpoint-producao`), o dono entrou e caiu em
-- "Sua conta existe, mas ainda não foi ligada à empresa". O log mostrou o motivo: a leitura de
-- `customer_profiles` voltou **403** — sem permissão na TABELA, antes de qualquer regra de RLS.
--
-- A CAUSA. Projeto Supabase antigo (o `test-helpoint`, o banco local do CI) dá a `anon` e
-- `authenticated`, por padrão, todo privilégio em tabela, sequência e função nova do schema
-- `public`; a segurança fica inteira no RLS. Projeto novo (a produção, criada em 2026-08-29) vem com
-- o padrão novo: só `postgres` e `service_role` recebem algo sozinhos. Medido na produção: 36 de
-- 171 tabelas liam para quem está logado (as que alguma migration concedeu à mão) — as outras 135
-- dependiam do padrão antigo. Todas as 171 têm RLS ligado.
--
-- O QUE ESTA MIGRATION FAZ: devolve a `authenticated` o que o padrão antigo dava, MENOS o que o
-- sistema tirou de propósito — e o que foi tirado está escrito nas migrations:
--   * credenciais e segredos, que só `service_role` lê: `tenant_*_credentials`/`_connections`,
--     `mkt_social_account_secrets`, `crm_payment_events`;
--   * só leitura: `crm_lead_ads_raw`, `crm_messages`, `crm_whatsapp_templates` (quem grava é o
--     servidor);
--   * `tenants` sem INSERT/DELETE (ADR-010: ninguém cria empresa pelo sistema);
--   * as funções internas continuam fechadas (a lista do `anon_so_nas_portas_publicas.test.sql` e
--     os `revoke ... authenticated` das migrations) — aqui só abrem as nove que as telas chamam e
--     que no teste abriam por PUBLIC.
-- `anon` NÃO recebe nada em tabela: nenhuma tela sem login lê tabela direto (as portas públicas são
-- as cinco funções da lista), e dar a `anon` o que o RLS depois filtra seria abrir mão de uma trava.
--
-- E o padrão daqui para a frente: tabela, sequência e função nova criadas por `postgres` (quem roda
-- as migrations) nascem com a permissão de `authenticated`, como no teste e no CI — senão cada
-- tabela nova passaria em todo lugar e quebraria só na produção. Função interna nova continua
-- precisando do `revoke ... from public, anon, authenticated` na própria migration (lição 14).
--
-- Em banco com o padrão antigo (teste, CI) tudo aqui já vale: a migration não muda nada lá.

do $$
declare
  r record;
  v_so_servidor constant text[] := array[
    'crm_payment_events', 'mkt_social_account_secrets',
    'tenant_ai_credentials', 'tenant_bling_connections', 'tenant_correios_credentials',
    'tenant_focusnfe_connections', 'tenant_lead_ads_connections', 'tenant_payment_credentials',
    'tenant_whatsapp_connections'];
  v_so_leitura constant text[] := array['crm_lead_ads_raw', 'crm_messages', 'crm_whatsapp_templates'];
begin
  for r in
    select c.relname, c.relkind
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  loop
    continue when r.relname = any (v_so_servidor);
    if r.relkind in ('v', 'm') or r.relname = any (v_so_leitura) then
      execute format('grant select on public.%I to authenticated', r.relname);
    else
      execute format('grant select, insert, update, delete on public.%I to authenticated', r.relname);
    end if;
  end loop;
end $$;

revoke insert, delete on public.tenants from authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- As nove funções que as telas (Automações, CRM) e os gatilhos de chamado chamam como a pessoa
-- logada, e que no teste abriam por PUBLIC.
grant execute on function public.automation_cancel_run(uuid) to authenticated;
grant execute on function public.automation_manual_for(text) to authenticated;
grant execute on function public.automation_retry_run(uuid) to authenticated;
grant execute on function public.automation_run_manual(uuid, uuid) to authenticated;
grant execute on function public.automation_webhook_secret(uuid) to authenticated;
grant execute on function public.create_ticket_checklists_for_ticket(uuid) to authenticated;
grant execute on function public.crm_sales_metrics(date, date, uuid) to authenticated;
grant execute on function public.crm_undo_import(uuid) to authenticated;
grant execute on function public.sync_ticket_checklist_status(uuid) to authenticated;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated;
