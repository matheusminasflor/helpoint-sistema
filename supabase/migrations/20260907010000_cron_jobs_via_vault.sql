-- Os dois jobs de cron do sistema, definidos por migration pela primeira vez.
--
-- POR QUE ESTA MIGRATION EXISTE
-- ─────────────────────────────
-- `check-alerts-hourly` e `mkt-publish-due-5min` nasceram em duas migrations
-- de maio apontando para o projeto antigo do Lovable, com a chave dele escrita
-- no arquivo. Em 2026-09-03 foram reescritos à mão no test-helpoint (URL do
-- projeto certo, chave lida do vault) — e nenhuma migration registrava isso.
-- Uma base nova, inclusive a produção no dia do lançamento, nasceria com os
-- robôs chamando o projeto errado. O job `banco` do CI achou antes de doer.
--
-- O QUE MUDA EM RELAÇÃO AO QUE ESTÁ NO TESTE
-- ──────────────────────────────────────────
-- Nada de comportamento. Só uma coisa de forma: o endereço das funções também
-- passa a vir do vault (`functions_base_url`), em vez de escrito aqui. Se
-- ficasse escrito, a produção nasceria chamando as funções do TESTE. O
-- `docs/ambientes.md` já previa esse segredo; ele é semeado por projeto, uma
-- vez, pelo SQL Editor (instruções lá).
--
-- Sem os dois segredos no vault, `cron.schedule` continua funcionando — o
-- comando só é avaliado na hora de rodar. O job então falha em silêncio até
-- alguém semear. É o comportamento de um projeto recém-criado, e é o esperado.

-- ───────────────────────────────────────────────────────────────────────────
-- Extensões, idempotentes: no test-helpoint já existem (ligadas pelo painel);
-- numa base do zero nascem aqui. `pg_cron` só aceita ser criada em pg_catalog.
-- ───────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

-- ───────────────────────────────────────────────────────────────────────────
-- Os jobs. `cron.schedule(name, ...)` com nome existente ATUALIZA o job
-- (pg_cron >= 1.4), então rodar isto de novo é seguro — mas o unschedule
-- explícito antes deixa o resultado igual em qualquer versão.
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'check-alerts-hourly') then
    perform cron.unschedule('check-alerts-hourly');
  end if;
  if exists (select 1 from cron.job where jobname = 'mkt-publish-due-5min') then
    perform cron.unschedule('mkt-publish-due-5min');
  end if;
end $$;

select cron.schedule(
  'check-alerts-hourly',
  '0 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/check-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')
    ),
    body := jsonb_build_object('source', 'cron')
  ) as request_id;
  $job$
);

select cron.schedule(
  'mkt-publish-due-5min',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/mkt-publish-due',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')
    ),
    body := jsonb_build_object('source', 'cron')
  ) as request_id;
  $job$
);
