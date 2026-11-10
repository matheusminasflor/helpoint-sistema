-- A leitura completa do Kommo (vendas, perdas, leads do ano) passa de 3 em 3 horas para de hora em hora (dono,
-- 2026-11-10): as vendas fechadas às 09h46 só apareceram às 12h20. A leitura leva menos de um minuto.
-- As conversas continuam a cada 10 minutos ('mkt-kommo-sem-resposta').
select cron.alter_job((select jobid from cron.job where jobname = 'mkt-kommo-coletar'), schedule := '20 * * * *');
