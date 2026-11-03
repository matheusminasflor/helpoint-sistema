-- O COLETOR DA META, todo dia às 06h de Brasília (09h UTC): a edge function `mkt-meta-coletar` busca os números da
-- semana em andamento (e, na segunda, fecha a que acabou) para os Indicadores do Marketing. Mesmo padrão do
-- `check-alerts-hourly` (20261028020000): URL e chave de serviço no Vault, 60 s de prazo (o padrão de 5 s do pg_net
-- não cabe: são várias chamadas à Meta por conta).
--
-- Conferir depois: select status_code, timed_out, error_msg, created from net._http_response order by created desc limit 5;
--                  select coletado_em, ultimo_erro from public.mkt_meta_ligacao;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'mkt-meta-coletar') then
    perform cron.unschedule('mkt-meta-coletar');
  end if;
end $$;

select cron.schedule(
  'mkt-meta-coletar',
  '0 9 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url') || '/mkt-meta-coletar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key')
    ),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 60000
  ) as request_id;
  $job$
);
