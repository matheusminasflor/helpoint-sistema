-- OKR-1: Metas — objetivo, o que se mede embaixo dele, e a medição ao longo do
-- tempo. 2026-09-13.
--
-- `goals` já existia desde o começo do sistema, com RLS completa e **nenhuma
-- tela**: zero linhas, ninguém nunca usou. Nem trigger de empresa ela tinha.
-- Esta migration a transforma no que o dono pediu e dá a ela o mesmo tratamento
-- que as outras tabelas do sistema recebem.
--
-- A decisão do dono (2026-09-13) foi "as duas formas, a empresa escolhe":
--
--   • OKR trimestral      — Objetivo + Resultados-Chave, barra de 0 a 100%
--   • Indicador mensal    — Objetivo + Indicadores com meta, farol e histórico
--
-- Elas parecem dois sistemas e são **um só**: um objetivo, coisas mensuráveis
-- penduradas nele, e uma série de medições no tempo. O que muda é o rótulo na
-- tela, de quanto em quanto tempo se mede, e se o resultado vira barra ou
-- farol. Por isso aqui não há dois caminhos — há `parent_goal_id`, uma tabela
-- de medições, e uma configuração por empresa que só escolhe o vocabulário.
--
-- O que NÃO entra aqui, de propósito: o número que se calcula sozinho a partir
-- dos chamados e das vendas (vem no passo seguinte, nas colunas `source_*` que
-- já nascem abaixo), Projetos, e o mapa estratégico com as perspectivas do BSC.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O objetivo e o que se mede embaixo dele
-- ───────────────────────────────────────────────────────────────────────────

-- Chave composta: é assim que este sistema impede que uma linha de uma empresa
-- aponte para a linha de outra. Sem ela, `parent_goal_id` seria uma porta.
alter table public.goals
  add constraint goals_id_tenant_key unique (id, tenant_id);

alter table public.goals
  -- Nulo = é um objetivo ("ser referência em atendimento"). Preenchido = é o
  -- que se mede embaixo dele ("90% dos chamados no prazo").
  add column if not exists parent_goal_id uuid,
  -- Como o número se lê na tela. Sem isto "2" e "2%" e "R$ 2" são a mesma coisa.
  add column if not exists unit text not null default 'number',
  -- Meta de subir ("chegar a 90%") ou de descer ("cair para 2 dias"). Sem isto
  -- o indicador de redução pinta vermelho justamente quando vai bem.
  add column if not exists direction text not null default 'up',
  -- De onde partiu. Meta que não começa do zero tem progresso mentiroso sem ele:
  -- sair de 80% e chegar a 90% não é "89% do caminho andado", é a metade.
  add column if not exists baseline numeric,
  -- A conta automática, para o passo seguinte. Nulo = o número é digitado.
  add column if not exists source_kind text,
  add column if not exists source_config jsonb not null default '{}'::jsonb;

-- `goal_type` dizia "de quem é a meta" com um nome que qualquer um leria como
-- "que tipo de número é". Zero linhas e zero leitores: renomear agora é grátis,
-- e daqui a um ano não seria.
alter table public.goals rename column goal_type to scope;

-- Objetivo da empresa não tem um dono só — quem responde é a diretoria.
alter table public.goals alter column assigned_to drop not null;
alter table public.goals alter column scope set default 'company';
alter table public.goals alter column frequency set default 'monthly';

alter table public.goals
  add constraint goals_parent_fkey
    foreign key (parent_goal_id, tenant_id)
    references public.goals (id, tenant_id) on delete cascade,
  add constraint goals_scope_check
    check (scope in ('company', 'department', 'individual')),
  add constraint goals_unit_check
    check (unit in ('number', 'percent', 'currency')),
  add constraint goals_direction_check
    check (direction in ('up', 'down')),
  add constraint goals_frequency_check
    check (frequency in ('monthly', 'quarterly', 'yearly')),
  add constraint goals_status_check
    check (status in ('active', 'done', 'cancelled')),
  add constraint goals_periodo_check
    check (end_date >= start_date),
  -- Dois níveis bastam: objetivo e o que se mede. Objetivo pendurado em
  -- indicador não é hierarquia, é engano de clique.
  add constraint goals_nao_e_neto_check
    check (parent_goal_id is null or parent_goal_id <> id),
  -- Responsável da outra empresa não responde por meta desta. Sai da empresa,
  -- a meta fica sem responsável — e não some junto com a pessoa. A lista de
  -- colunas no SET NULL existe porque sem ela o banco zeraria `tenant_id`
  -- também, que é obrigatório: o apagar do perfil falharia com um erro que não
  -- menciona metas.
  add constraint goals_assigned_fkey
    foreign key (assigned_to, tenant_id)
    references public.profiles (id, tenant_id) on delete set null (assigned_to);

create index if not exists goals_tenant_parent_idx
  on public.goals (tenant_id, parent_goal_id);

-- O quanto já andou, de 0 a 1 (1 = meta batida; passa de 1 quando supera).
-- Coluna gerada: a conta é da própria linha, então o banco a mantém sozinho e
-- não há duas verdades. `null` quando meta e ponto de partida são iguais — aí
-- não existe caminho a andar, e inventar 0% ou 100% seria mentir.
alter table public.goals
  add column if not exists progress numeric
  generated always as (
    case when direction = 'down'
      then case when (coalesce(baseline, 0) - target_value) = 0 then null
                else (coalesce(baseline, 0) - current_value)
                     / (coalesce(baseline, 0) - target_value) end
      else case when (target_value - coalesce(baseline, 0)) = 0 then null
                else (current_value - coalesce(baseline, 0))
                     / (target_value - coalesce(baseline, 0)) end
    end
  ) stored;

-- Dois níveis, garantido: o pai de alguém não pode ter pai.
create or replace function public.goal_pai_e_raiz()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent_goal_id is not null
     and exists (select 1 from public.goals g
                  where g.id = new.parent_goal_id and g.parent_goal_id is not null) then
    raise exception 'o que se mede fica embaixo de um objetivo, não de outro indicador'
      using errcode = '23514';
  end if;
  -- E o contrário: objetivo que já tem filhos não pode virar filho de ninguém.
  if new.parent_goal_id is not null
     and exists (select 1 from public.goals g where g.parent_goal_id = new.id) then
    raise exception 'este objetivo já tem indicadores embaixo dele' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trg_goal_pai_e_raiz before insert or update of parent_goal_id
  on public.goals for each row execute function public.goal_pai_e_raiz();

-- As três que toda tabela deste sistema tem e esta não tinha.
create trigger inject_tenant_id_goals before insert on public.goals
  for each row execute function public.inject_tenant_id();
create trigger handle_goals_updated_at before update on public.goals
  for each row execute function public.handle_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A medição no tempo
-- ───────────────────────────────────────────────────────────────────────────
-- É esta tabela que faz o gráfico existir e o farol fazer sentido: em março já
-- dá para ver que a meta de dezembro não vai chegar. Sem ela só haveria o
-- número de hoje, e "melhorou ou piorou" seria palpite.
create table if not exists public.goal_checkins (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  goal_id     uuid not null,
  -- Primeiro dia do período medido: 2026-03-01 é "março", 2026-07-01 é o 3º
  -- trimestre. Guardar o período e não a data do lançamento é o que permite
  -- corrigir o número de março em abril sem criar uma segunda linha de março.
  period_date date not null,
  value       numeric not null,
  note        text,
  author_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint goal_checkins_goal_fkey
    foreign key (goal_id, tenant_id)
    references public.goals (id, tenant_id) on delete cascade,
  constraint goal_checkins_author_fkey
    foreign key (author_id, tenant_id)
    references public.profiles (id, tenant_id) on delete set null (author_id),
  constraint goal_checkins_um_por_periodo unique (goal_id, period_date)
);

create index if not exists goal_checkins_goal_idx
  on public.goal_checkins (goal_id, period_date desc);

create trigger inject_tenant_id_goal_checkins before insert on public.goal_checkins
  for each row execute function public.inject_tenant_id();
create trigger handle_goal_checkins_updated_at before update on public.goal_checkins
  for each row execute function public.handle_updated_at();

-- O valor de hoje da meta é sempre a medição mais recente. Um lugar só grava, e
-- `current_value` deixa de ser um número que alguém precisa lembrar de digitar
-- duas vezes.
create or replace function public.goal_atualiza_valor()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_goal uuid := coalesce(new.goal_id, old.goal_id);
begin
  update public.goals g
     set current_value = coalesce(
           (select c.value from public.goal_checkins c
             where c.goal_id = v_goal order by c.period_date desc limit 1), 0)
   where g.id = v_goal;
  return null;
end;
$$;
create trigger trg_goal_atualiza_valor
  after insert or update or delete on public.goal_checkins
  for each row execute function public.goal_atualiza_valor();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Quem vê e quem mexe
-- ───────────────────────────────────────────────────────────────────────────
-- Decisão do dono: a empresa toda vê todas as metas — transparência é metade do
-- valor de trabalhar com meta, e o vendedor precisa saber para onde está
-- remando. Criar e editar é de gestor para cima. Lançar o número do mês é de
-- gestor **ou** de quem é responsável por aquele indicador.
drop policy if exists "Users see own goals or supervisors see all" on public.goals;
drop policy if exists "Users or supervisors create goals"         on public.goals;
drop policy if exists "Users or supervisors update goals"         on public.goals;
drop policy if exists "Creators or supervisors delete goals"      on public.goals;

create policy "A empresa toda ve as metas" on public.goals
  for select using (tenant_id = public.get_user_tenant_id());
create policy "Gestor cria meta" on public.goals
  for insert with check (
    tenant_id = public.get_user_tenant_id()
    and public.is_supervisor_or_higher(auth.uid()));
create policy "Gestor edita meta" on public.goals
  for update using (
    tenant_id = public.get_user_tenant_id()
    and public.is_supervisor_or_higher(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id());
create policy "Gestor apaga meta" on public.goals
  for delete using (
    tenant_id = public.get_user_tenant_id()
    and public.is_supervisor_or_higher(auth.uid()));

alter table public.goal_checkins enable row level security;

create policy "A empresa toda ve as medicoes" on public.goal_checkins
  for select using (tenant_id = public.get_user_tenant_id());
create policy "Gestor ou responsavel lanca o numero" on public.goal_checkins
  for insert with check (
    tenant_id = public.get_user_tenant_id()
    and (public.is_supervisor_or_higher(auth.uid())
         or exists (select 1 from public.goals g
                     where g.id = goal_id and g.assigned_to = auth.uid())));
create policy "Gestor ou responsavel corrige o numero" on public.goal_checkins
  for update using (
    tenant_id = public.get_user_tenant_id()
    and (public.is_supervisor_or_higher(auth.uid())
         or exists (select 1 from public.goals g
                     where g.id = goal_id and g.assigned_to = auth.uid())))
  with check (tenant_id = public.get_user_tenant_id());
create policy "Gestor apaga medicao" on public.goal_checkins
  for delete using (
    tenant_id = public.get_user_tenant_id()
    and public.is_supervisor_or_higher(auth.uid()));

-- Armadilha nº 6 das migrations deste sistema: tabela nova nasce com ALL para
-- anon e authenticated por causa das default privileges. A RLS acima é quem
-- manda, mas o `anon` não tem o que fazer aqui em nenhuma hipótese.
revoke all on public.goal_checkins from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. O vocabulário, por empresa
-- ───────────────────────────────────────────────────────────────────────────
-- `metas.modo` = 'okr' (Objetivo e Resultados-Chave, barra de progresso) ou
-- 'indicadores' (Objetivo e Indicadores, farol e histórico). Muda o rótulo e a
-- visualização; não muda o que está gravado, então trocar de ideia depois não
-- perde nada.
--
-- A função de configuração por módulo já existe desde 2026-09-25; aqui ela só
-- ganha mais uma chave conhecida. O rótulo virou mapa porque com 'metas' o
-- texto do erro sairia "a configuração do CRM", que não ajudaria ninguém.
create or replace function public.tenant_set_config(p_scope text, p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_rotulo text := case p_scope
                     when 'expedicao' then 'da Expedição'
                     when 'crm'       then 'do CRM'
                     when 'metas'     then 'das Metas'
                     else 'do sistema'
                   end;
begin
  if v_tenant is null then
    raise exception 'usuário sem empresa' using errcode = '42501';
  end if;
  if not public.is_admin_or_higher(auth.uid()) then
    raise exception 'só dono ou administrador muda a configuração %', v_rotulo using errcode = '42501';
  end if;
  if (p_scope, p_key) not in (
    ('expedicao', 'picking'), ('expedicao', 'label_provider'), ('crm', 'nfe_provider'),
    ('metas', 'modo')
  ) then
    raise exception 'configuração desconhecida: %', p_key using errcode = '22023';
  end if;
  if p_scope = 'metas' and p_key = 'modo'
     and p_value #>> '{}' not in ('okr', 'indicadores') then
    raise exception 'o modo das Metas é "okr" ou "indicadores"' using errcode = '22023';
  end if;

  update public.tenants
     set settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object(
                         p_scope,
                         coalesce(settings -> p_scope, '{}'::jsonb) || jsonb_build_object(p_key, p_value)
                       )
   where id = v_tenant;

  if not found then
    raise exception 'a configuração não foi gravada' using errcode = 'P0002';
  end if;
end;
$$;

-- A tela precisa saber o modo sem enxergar o resto de `tenants.settings`.
create or replace function public.metas_modo()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(t.settings -> 'metas' ->> 'modo', 'indicadores')
    from public.tenants t where t.id = public.get_user_tenant_id();
$$;
revoke execute on function public.metas_modo() from public, anon;
grant execute on function public.metas_modo() to authenticated;
