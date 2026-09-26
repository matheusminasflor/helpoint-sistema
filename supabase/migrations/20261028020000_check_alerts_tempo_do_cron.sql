-- `check-alerts` morria de timeout toda hora, e nada dizia
--
-- Achado ao conferir a issue 01 (leva B, 2026-09-25). As duas issues de
-- segurança das funções do cron (`check-alerts` e `mkt-publish-due` sem
-- autenticação) **já estavam corrigidas** no código: as duas estão com
-- `verify_jwt = true` no `config.toml`, as duas chamam `requireServiceRole`, e os
-- três jobs de cron mandam a chave `service_role` lida do Vault. O par que a
-- issue 01 alertava para não quebrar pela metade está inteiro.
--
-- MAS, ao conferir se o par FUNCIONA, apareceu outra coisa:
--
--   net._http_response, últimas 6 horas do test-helpoint
--   ──────────────────────────────────────────────────────────────────────
--   432 respostas  status 200   (automation-worker de minuto, mkt-publish-due
--                                de 5 em 5 minutos — os dois saudáveis)
--     6 respostas  status NULL  timed_out = true, "Timeout of 5000 ms reached"
--                                todas no minuto 0 de cada hora
--
-- Minuto 0 de cada hora é o `check-alerts-hourly`, e são SEIS HORAS SEGUIDAS —
-- 21:00, 22:00, 23:00, 00:00, 01:00, 02:00. Ou seja: toda execução do
-- `check-alerts` estoura o tempo de espera do cron. Nenhuma tem resposta.
--
-- POR QUE NINGUÉM VIU. `cron.job_run_details` diz **`succeeded`** nas 455
-- execuções, porque o que ele mede é o `select net.http_post(...)` ter
-- enfileirado o pedido — não a função ter respondido. A resposta (ou a falta
-- dela) mora em `net._http_response`, que é uma tabela que ninguém abre. É a
-- mesma forma de defeito que a issue 01 descreve para os lembretes: não faz
-- barulho nenhum.
--
-- A CAUSA é o padrão do `pg_net`: `net.http_post` tem
-- `timeout_milliseconds = 5000`. Os três jobs foram escritos sem esse argumento
-- (migration 20260907010000 e 20260912020000), então os três herdaram 5
-- segundos. Para o worker de automação e para o publicador de posts, 5 segundos
-- bastam — os 432 status 200 provam. Para o `check-alerts` não: são 543 linhas
-- que varrem contratos, licenças e chamados de **todos os tenants** numa
-- passada.
--
-- O QUE ESTE ARQUIVO MUDA: um argumento, num job. `timeout_milliseconds` de
-- 5.000 para 60.000 no `check-alerts-hourly`. Nada mais — a URL, a chave, o
-- corpo e o horário são os mesmos da migration 20260907010000, copiados.
--
-- O QUE ISTO **NÃO** RESOLVE, e fica dito: eu não sei se a função termina em 60
-- segundos, porque não consigo executá-la daqui (ela exige a chave
-- `service_role`, que não passa por conversa). O que o aumento garante é que o
-- resultado passa a ser observável: se ela responder, aparece o 200; se ainda
-- estourar, o erro em `net._http_response` passa a dizer 60 segundos, e aí a
-- conclusão é diferente — a função precisa processar por página, um tenant por
-- vez, em vez de tudo numa chamada. Um timeout de 5 segundos não distinguia
-- "demora um pouco" de "não termina nunca".
--
-- O `mkt-publish-due` e o `automation-worker` ficam como estão: eles respondem
-- dentro do prazo, e mexer no que funciona para "ficar simétrico" é como se
-- esconde a próxima diferença de verdade.
--
-- COMO CONFERIR DEPOIS DE APLICAR (na hora cheia seguinte):
--
--   select status_code, timed_out, error_msg, created
--   from net._http_response order by created desc limit 5;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'check-alerts-hourly') then
    perform cron.unschedule('check-alerts-hourly');
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
    body := jsonb_build_object('source', 'cron'),
    -- A ÚNICA diferença em relação à migration 20260907010000. O padrão do
    -- pg_net são 5 segundos, e esta função não cabe nele: seis execuções
    -- seguidas estouraram em 5.001 ms sem nunca responder.
    timeout_milliseconds := 60000
  ) as request_id;
  $job$
);
