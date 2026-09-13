-- OKR-1, correções da auditoria. 2026-09-13.
--
-- Três achados, do mais grave ao menor.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A troca de modo estava morta: faltava o invólucro das Metas
-- ───────────────────────────────────────────────────────────────────────────
-- `tenant_set_config` foi revogada de `public, anon, authenticated` quando
-- nasceu (20260925030000): ela é peça **interna**, e quem a chama do navegador
-- é sempre um invólucro fino por módulo — `exp_set_config`, `crm_set_config` —
-- que é `security definer` e por isso atravessa o revoke.
--
-- A migration 20260929010000 acrescentou a chave `('metas','modo')` à lista de
-- configurações conhecidas e **não criou o invólucro**; como `create or replace
-- function` preserva a lista de permissões, o `authenticated` continuou de
-- fora. O resultado é que o dono clicava em "OKR com progresso", levava
-- `permission denied`, e a tela traduzia para "fale com um gestor" — para quem
-- já é o dono. O modo ficava preso em `indicadores` para sempre.
--
-- Quem acrescentar um escopo novo a `tenant_set_config` daqui em diante tem de
-- criar o invólucro junto. Está registrado em `docs/inventario-sistema.md`.
create or replace function public.metas_set_config(p_key text, p_value jsonb)
returns void
language sql
security definer
set search_path = public
as $$ select public.tenant_set_config('metas', p_key, p_value); $$;
revoke execute on function public.metas_set_config(text, jsonb) from public, anon;
grant execute on function public.metas_set_config(text, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. O valor da meta podia divergir das medições
-- ───────────────────────────────────────────────────────────────────────────
-- Mover uma medição de um indicador para outro (`update goal_checkins set
-- goal_id = …`) recalculava só o destino: a origem ficava exibindo o número
-- velho **sem nenhuma medição por trás** — o mesmo engano do `-800%` entrando
-- pela outra porta. Agora os dois lados são recalculados.
create or replace function public.goal_atualiza_valor()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_antigo uuid := old.goal_id;
  v_novo   uuid := new.goal_id;
begin
  -- Um `update` que troca o indicador mexe em dois; `insert` e `delete` só num.
  update public.goals g
     set current_value = (
           select c.value from public.goal_checkins c
            where c.goal_id = g.id order by c.period_date desc limit 1)
   where g.id in (v_antigo, v_novo);
  return null;
end;
$$;

-- E a porta da frente: o valor de hoje é consequência das medições, nunca algo
-- que alguém digita na linha da meta. A política de `update` de `goals` não
-- restringe colunas (o PostgreSQL não tem policy por coluna), então o guard é
-- aqui. `pg_trigger_depth() > 0` é a escrita do trigger acima — essa passa,
-- pela mesma razão da regra 8 do pgTAP: escrita de trigger é do sistema, não
-- do usuário.
create or replace function public.goal_valor_vem_da_medicao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'INSERT' then
    if new.current_value is not null then
      raise exception 'o valor de uma meta vem do número lançado, não da própria meta'
        using errcode = '42501';
    end if;
  elsif new.current_value is distinct from old.current_value then
    raise exception 'o valor de uma meta vem do número lançado, não da própria meta'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_goal_valor_vem_da_medicao
  before insert or update of current_value on public.goals
  for each row execute function public.goal_valor_vem_da_medicao();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. O `anon` continuava com SELECT em `goals`
-- ───────────────────────────────────────────────────────────────────────────
-- A tabela nasceu antes de a armadilha das default privileges ser conhecida, e
-- a migration anterior só trancou a tabela nova. Não vazava — a RLS pede um
-- perfil que o visitante não tem — mas o princípio vale para as duas.
revoke all on public.goals from anon;
