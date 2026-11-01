-- TI › INDICADORES › SEMANAL: O FSENSE E AS INTERRUPÇÕES (dono, 2026-11-01; docs/proposta-indicadores-da-semana.md).
--
-- A planilha que o dono apresenta ao diretor toda segunda tinha dois números que o Helpoint não tem: a produtividade da
-- equipe medida pelo FSENSE (% trabalho e % ocioso por pessoa) e as interrupções (luz, internet, sistema, intranet).
-- Os chamados por categoria NÃO entram aqui: TI › Indicadores já mostra (decisão do dono).
--
-- Decisões:
--   1. FSENSE sem API: o Claude lê a tela do FSENSE no Chrome do dono e cola as linhas aqui, ou alguém digita. O que
--      entra fica "a confirmar" (`confirmado_em` nulo) até alguém clicar "Confirmar semana" — o painel só conta semana
--      confirmada, e um número lido errado não chega à reunião.
--   2. Interrupção é registro próprio (queda não é pedido de ninguém): tipo, início, fim (nulo = ainda parado).
--   3. Produtividade por pessoa: só quem tem "Ver métricas da equipe" nos Indicadores da TI, dono/admin e a Diretoria.
--      As interrupções (um número da TI, sem pessoa) seguem o "Visualizar" dos Indicadores da TI.
-- Lançar as duas coisas: a ação nova "Lançar FSENSE e interrupções" (nasce ligada no perfil Gestor da TI). As metas
-- moram em `dir_metas_dos_setores` (setor 'ti'), como as dos outros setores, e quem define é a Diretoria.

-- ─── 1. FSENSE: uma linha por pessoa por semana ──────────────────────────────────────────────────────
create table if not exists public.ti_fsense (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- O dia que fecha a semana lançada (na planilha, "o domingo que fecha a semana"). É ele que decide S1–S4.
  data date not null,
  -- Nome como está no FSENSE: tem quem não é pessoa do Helpoint ("Expedição"), por isso é texto.
  colaborador text not null,
  horas numeric(6, 1) not null,
  trabalho numeric(5, 1),
  bloqueada numeric(5, 1),
  ocioso numeric(5, 1),
  suspenso numeric(5, 1),
  confirmado_em timestamptz,
  confirmado_por uuid references auth.users (id) on delete set null,
  lancado_por uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ti_fsense_nome check (btrim(colaborador) <> '' and length(colaborador) <= 80),
  constraint ti_fsense_horas check (horas >= 0),
  constraint ti_fsense_percentuais check (
    coalesce(trabalho, 0) between 0 and 100 and coalesce(bloqueada, 0) between 0 and 100
    and coalesce(ocioso, 0) between 0 and 100 and coalesce(suspenso, 0) between 0 and 100)
);
create unique index if not exists ti_fsense_uma_por_pessoa on public.ti_fsense (tenant_id, data, lower(btrim(colaborador)));
alter table public.ti_fsense enable row level security;
revoke all on public.ti_fsense from anon;
grant select, insert, update, delete on public.ti_fsense to authenticated;

create policy ti_fsense_le on public.ti_fsense for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('ti', 'reports', 'view_team_metrics')) or (select public.dir_pode_ver('indicadores'))));
create policy ti_fsense_cria on public.ti_fsense for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'reports', 'lancar')));
create policy ti_fsense_muda on public.ti_fsense for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'reports', 'lancar')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'reports', 'lancar')));
create policy ti_fsense_apaga on public.ti_fsense for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'reports', 'lancar')));

-- Quem confirma é quem está logado: o carimbo não vem do cliente.
create or replace function public.ti_fsense_carimbo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.confirmado_em is null then
    new.confirmado_por := null;
  elsif tg_op = 'INSERT' or old.confirmado_em is null then
    new.confirmado_em := now();
    new.confirmado_por := auth.uid();
  else
    new.confirmado_em := old.confirmado_em;
    new.confirmado_por := old.confirmado_por;
  end if;
  return new;
end;
$$;
revoke all on function public.ti_fsense_carimbo() from public, anon, authenticated;
create trigger ti_fsense_carimbo before insert or update on public.ti_fsense
  for each row execute function public.ti_fsense_carimbo();

-- Lançar (colar ou digitar) a semana de uma vez: quem já está na semana é atualizado, e a linha volta a "a confirmar".
-- `security invoker`: as regras de cima valem como se a pessoa gravasse direto.
create or replace function public.ti_fsense_lancar(p_data date, p_linhas jsonb)
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  insert into public.ti_fsense (tenant_id, data, colaborador, horas, trabalho, bloqueada, ocioso, suspenso)
  select public.get_user_tenant_id(), p_data, btrim(l ->> 'colaborador'), (l ->> 'horas')::numeric,
         (l ->> 'trabalho')::numeric, (l ->> 'bloqueada')::numeric, (l ->> 'ocioso')::numeric, (l ->> 'suspenso')::numeric
    from jsonb_array_elements(p_linhas) l
  on conflict (tenant_id, data, (lower(btrim(colaborador)))) do update
     set colaborador = excluded.colaborador, horas = excluded.horas, trabalho = excluded.trabalho,
         bloqueada = excluded.bloqueada, ocioso = excluded.ocioso, suspenso = excluded.suspenso, confirmado_em = null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.ti_fsense_lancar(date, jsonb) from public, anon;
grant execute on function public.ti_fsense_lancar(date, jsonb) to authenticated;

-- ─── 2. Interrupções ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.ti_interrupcoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tipo text not null,
  inicio timestamptz not null,
  -- Nulo = ainda parado.
  fim timestamptz,
  -- Vindas da planilha antiga: só se sabia quantas houve na semana, não o horário. Não somam horas paradas.
  sem_horario boolean not null default false,
  observacao text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ti_interrupcoes_tipo check (tipo in ('luz', 'internet', 'sistema', 'intranet', 'outra')),
  constraint ti_interrupcoes_fim_depois check (fim is null or fim >= inicio)
);
create index if not exists ti_interrupcoes_por_data on public.ti_interrupcoes (tenant_id, inicio);
alter table public.ti_interrupcoes enable row level security;
revoke all on public.ti_interrupcoes from anon;
grant select, insert, update, delete on public.ti_interrupcoes to authenticated;

create policy ti_interrupcoes_le on public.ti_interrupcoes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('ti', 'reports', 'view')) or (select public.dir_pode_ver('indicadores'))));
create policy ti_interrupcoes_cria on public.ti_interrupcoes for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'reports', 'lancar')));
create policy ti_interrupcoes_muda on public.ti_interrupcoes for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'reports', 'lancar')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'reports', 'lancar')));
create policy ti_interrupcoes_apaga on public.ti_interrupcoes for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('ti', 'reports', 'lancar')));

-- ─── 3. As metas: quem vê os Indicadores da TI lê as da TI ───────────────────────────────────────────
-- Políticas de SELECT somam com OR; a escrita continua só com a Diretoria (`dir_pode_definir_metas_dos_setores`).
create policy dir_metas_le_ti on public.dir_metas_dos_setores for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and setor = 'ti'
         and (select public.pode_no_setor('ti', 'reports', 'view')));

-- ─── 4. A ação nova nasce ligada no Gestor da TI ─────────────────────────────────────────────────────
-- ponytail: só nas empresas que já existem (a Minasflor), como as Rotinas (20270212120000). Empresa nova nasce sem ela
-- — dono e admin passam do mesmo jeito. Saída: somar ao `seed_default_categories_novos_modulos`.
update public.access_profiles
   set permissions = jsonb_set(permissions, '{reports}', coalesce(permissions -> 'reports', '{}'::jsonb) || '{"lancar": true}'::jsonb)
 where department = 'ti' and name = 'Gestor';
