-- CRM-4b: a varredura do lead frio sai do `automation_tick`. 2026-09-13.
--
-- O CI #54 falhou ao montar o banco do zero: a costura que enfiava
-- `automation_tick_deal_idle()` dentro do `automation_tick` não achou a âncora.
-- A guarda fez o certo — parou em vez de aplicar pela metade —, mas a lição é
-- sobre o método: `pg_get_functiondef` devolve o texto **como foi escrito na
-- migration que definiu a função por último**, e esse texto não é o mesmo no
-- banco de teste e num banco montado do zero. Costurar função grande por texto
-- serve para mudar o que já está lá; **não** serve para pendurar coisa nova que
-- podia ter o próprio lugar.
--
-- O lugar próprio é um job de cron, criado na migration anterior
-- (`deal-idle-hourly`). Esta aqui desfaz a costura onde ela chegou a ser
-- aplicada — o `test-helpoint` — para que os dois bancos fiquem iguais.
--
-- É idempotente: num banco do zero não há costura, e o bloco não faz nada.
do $$
declare
  v_def  text := pg_get_functiondef('public.automation_tick()'::regprocedure);
  v_novo text := v_def;
begin
  if position('automation_tick_deal_idle' in v_def) = 0 then
    return;  -- banco do zero: nunca foi costurado
  end if;

  v_novo := regexp_replace(v_novo, '\s*\n\s*n_idle\s+int := 0;', '');
  v_novo := regexp_replace(v_novo, '\s*\n\s*n_idle := public\.automation_tick_deal_idle\(\);', '');
  v_novo := replace(v_novo, ', ''deal_idle'', n_idle', '');

  if position('automation_tick_deal_idle' in v_novo) > 0 or position('n_idle' in v_novo) > 0 then
    raise exception 'automation_tick: sobrou vestigio da costura — nao aplico pela metade';
  end if;

  execute v_novo;
end $$;

-- E o job, para o caso de esta migration rodar num banco onde a anterior já
-- passou sem criá-lo (o `cron.schedule` é idempotente pelo nome).
select cron.schedule(
  'deal-idle-hourly',
  '7 * * * *',
  $cron$ select public.automation_tick_deal_idle(); $cron$
);
