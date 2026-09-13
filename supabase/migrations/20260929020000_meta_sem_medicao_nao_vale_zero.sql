-- OKR-1, correção: indicador ainda não medido não vale zero. 2026-09-13.
--
-- Encontrado na navegação real, no minuto seguinte à primeira tela: um
-- indicador recém-criado — "chamados no prazo, de 80% para 90%" — apareceu com
-- **-800%** e farol vermelho. A conta estava certa e a premissa errada:
-- `current_value` nascia `0` por padrão, e zero é um número como outro
-- qualquer. (0 - 80) / (90 - 80) = -8.
--
-- "Ainda não medi" não é "medi e deu zero". A diferença importa justamente no
-- indicador que parte de um patamar alto, que é a maioria dos que interessam:
-- pontualidade, satisfação, margem. Agora o valor começa nulo, o progresso sai
-- nulo junto, e a tela mostra "—" com o farol apagado até o primeiro
-- lançamento — que é a verdade.
alter table public.goals alter column current_value drop not null;
alter table public.goals alter column current_value drop default;

-- Nenhuma medição = nenhum valor. O `coalesce(..., 0)` daqui era a outra
-- metade do mesmo engano: apagar a última medição devolvia a meta para zero em
-- vez de devolvê-la para "não medida".
create or replace function public.goal_atualiza_valor()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_goal uuid := coalesce(new.goal_id, old.goal_id);
begin
  update public.goals g
     set current_value = (
           select c.value from public.goal_checkins c
            where c.goal_id = v_goal order by c.period_date desc limit 1)
   where g.id = v_goal;
  return null;
end;
$$;

-- A coluna gerada precisa ser refeita para propagar o nulo: aritmética com
-- nulo já dá nulo, mas a expressão antiga está compilada com a coluna como
-- NOT NULL e o Postgres não a reavalia sozinho.
alter table public.goals drop column progress;
alter table public.goals
  add column progress numeric
  generated always as (
    case
      when current_value is null then null
      when direction = 'down'
        then case when (coalesce(baseline, 0) - target_value) = 0 then null
                  else (coalesce(baseline, 0) - current_value)
                       / (coalesce(baseline, 0) - target_value) end
      else case when (target_value - coalesce(baseline, 0)) = 0 then null
                else (current_value - coalesce(baseline, 0))
                     / (target_value - coalesce(baseline, 0)) end
    end
  ) stored;

-- As metas que já nasceram com o zero de fábrica e nunca foram medidas voltam
-- a ser o que sempre foram: não medidas.
update public.goals g
   set current_value = null
 where g.current_value = 0
   and not exists (select 1 from public.goal_checkins c where c.goal_id = g.id);
