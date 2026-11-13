-- O Kommo bloqueia o IP da conta acima de 7 solicitações por segundo (bloqueio em 12/11/2026). Regra do dono: no
-- máximo 6/s. Cada leitura do mkt-kommo-coletar faz no máximo 3/s; para nunca haver mais de 2 leituras ao mesmo
-- tempo, a leitura completa sai do minuto :20, que coincidia com a das conversas ('*/10'), e vai para o :25.
select cron.alter_job((select jobid from cron.job where jobname = 'mkt-kommo-coletar'), schedule := '25 * * * *');
