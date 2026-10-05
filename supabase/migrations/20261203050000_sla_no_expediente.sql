-- O PRAZO (SLA) SÓ ANDA NO EXPEDIENTE (decisão do dono, 2026-10-04 — segunda rodada do mesmo dia).
--
-- A primeira rodada (20261203030000) tirou só sábado e domingo: a noite continuava contando, e um
-- chamado de 8 horas aberto às 17h amanhecia atrasado. O dono escolheu o padrão do mercado
-- (Zendesk, Freshdesk, Jira SM, Movidesk, GLPI): um CALENDÁRIO DE EXPEDIENTE por setor.
--
-- A REGRA, por extenso (fuso de São Paulo):
--   * o relógio só anda dentro do expediente do setor, de segunda a sexta; o almoço CONTA
--     (expediente corrido, decisão do dono);
--   * expediente padrão: Produção, Expedição e Qualidade 07:00–17:00; os outros 08:00–18:00. Cada
--     setor muda o seu em Chamados › Prazos de atendimento (`sla_regras_do_setor`);
--   * feriado não conta: os NACIONAIS vêm prontos (fixos + Carnaval, Sexta-feira Santa e Corpus
--     Christi, que mudam com a Páscoa) e a empresa cadastra os dela (`feriados_da_empresa`);
--   * setor com a pausa do fim de semana DESLIGADA conta sábado e domingo no mesmo horário;
--   * linha do setor com o expediente em branco (as duas horas nulas) conta o dia inteiro — é o
--     jeito de um setor 24 horas, e o que os testes que perguntam "qual política vale" usam.
--   Exemplos (08–18): terça 17:00 + 8h → quarta 15:00; sexta 17:00 + 8h → segunda 15:00; aberto
--   às 20:00 começa no dia seguinte às 08:00.
--
-- OS PRAZOS PADRÃO passam a ser HORAS ÚTEIS (decisão do dono): crítica 4h úteis, alta 8h úteis,
-- média 2 dias úteis (1200 min = 2 × 10h), baixa 4 dias úteis (2400 min). Sem isso, os 1440 e 2880
-- minutos de antes viravam 2,4 e quase 5 dias úteis. Só muda a linha que ainda tem o valor semeado;
-- quem já ajustou o seu fica como está. A primeira resposta mantém os números, agora em minutos úteis
-- (hoje ela só é exibida; o prazo calculado é o de resolução).

-- ─── 1. O expediente do setor ─────────────────────────────────────────────────────────────────
alter table public.sla_regras_do_setor
  add column if not exists inicio_expediente time,
  add column if not exists fim_expediente time;

alter table public.sla_regras_do_setor
  drop constraint if exists sla_regras_do_setor_expediente_check;
alter table public.sla_regras_do_setor
  add constraint sla_regras_do_setor_expediente_check
  check ((inicio_expediente is null) = (fim_expediente is null)
         and (fim_expediente is null or fim_expediente > inicio_expediente));

comment on column public.sla_regras_do_setor.inicio_expediente is
  'Início do expediente do setor (o relógio do SLA só anda dentro dele). Nulo junto com o fim = dia inteiro.';

-- O padrão de quem ainda não gravou o seu. Mora num lugar só (a tela repete o mesmo valor em
-- `EXPEDIENTE_PADRAO`, `src/hooks/useSLAPolicies.ts`, só para mostrar).
create or replace function public.expediente_padrao(p_module text)
returns table (inicio time, fim time)
language sql
immutable
set search_path to 'public'
as $$
  select case when p_module in ('producao', 'expedicao', 'qualidade') then time '07:00' else time '08:00' end,
         case when p_module in ('producao', 'expedicao', 'qualidade') then time '17:00' else time '18:00' end;
$$;

-- As linhas que JÁ existem foram gravadas quando só havia a chave do fim de semana: horas nulas
-- nelas não foram escolha de "dia inteiro", então recebem o padrão do setor. (A linha nova que
-- nascer com as horas em branco, daqui para frente, é escolha — a tela sempre manda as duas.)
update public.sla_regras_do_setor r
   set inicio_expediente = (select p.inicio from public.expediente_padrao(r.module) p),
       fim_expediente    = (select p.fim from public.expediente_padrao(r.module) p)
 where r.inicio_expediente is null and r.fim_expediente is null;

-- ─── 2. Feriados ──────────────────────────────────────────────────────────────────────────────
-- Os nacionais do ano: fixos (inclui 20/11, nacional desde a Lei 14.759/2023) e os que dependem da
-- Páscoa (algoritmo de Meeus para o calendário gregoriano). Carnaval e Corpus Christi são ponto
-- facultativo na lei, mas a empresa não trabalha — decisão do dono.
create or replace function public.feriados_nacionais(p_ano integer)
returns table (data date, nome text)
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  a int := p_ano % 19;
  b int := p_ano / 100;
  c int := p_ano % 100;
  d int := b / 4;
  e int := b % 4;
  f int := (b + 8) / 25;
  g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30;
  i int := c / 4;
  k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7;
  m int := (a + 11 * h + 22 * l) / 451;
  v_pascoa date := make_date(p_ano, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
begin
  return query values
    (make_date(p_ano, 1, 1),   'Confraternização Universal'),
    (v_pascoa - 48,            'Carnaval'),
    (v_pascoa - 47,            'Carnaval'),
    (v_pascoa - 2,             'Sexta-feira Santa'),
    (make_date(p_ano, 4, 21),  'Tiradentes'),
    (make_date(p_ano, 5, 1),   'Dia do Trabalho'),
    (v_pascoa + 60,            'Corpus Christi'),
    (make_date(p_ano, 9, 7),   'Independência do Brasil'),
    (make_date(p_ano, 10, 12), 'Nossa Senhora Aparecida'),
    (make_date(p_ano, 11, 2),  'Finados'),
    (make_date(p_ano, 11, 15), 'Proclamação da República'),
    (make_date(p_ano, 11, 20), 'Dia Nacional de Zumbi e da Consciência Negra'),
    (make_date(p_ano, 12, 25), 'Natal');
end;
$$;

comment on function public.feriados_nacionais(integer) is
  'Feriados nacionais do ano (fixos + móveis pela Páscoa). O relógio do SLA não anda neles.';

create table if not exists public.feriados_da_empresa (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  data date not null,
  nome text not null check (length(trim(nome)) > 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, data)
);

comment on table public.feriados_da_empresa is
  'Feriados e pontes da empresa (municipal, emenda). Somados aos nacionais, param o relógio do SLA.';

alter table public.feriados_da_empresa enable row level security;
revoke all on public.feriados_da_empresa from anon;

drop policy if exists feriados_da_empresa_le on public.feriados_da_empresa;
create policy feriados_da_empresa_le on public.feriados_da_empresa
  for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));

-- Cadastrar e tirar: quem configura os chamados de ALGUM setor. É a porta que já existe para o
-- prazo (`pode_configurar_setor`), aplicada a qualquer setor — o feriado vale para a empresa toda,
-- e quem cuida dos prazos de um setor é quem sabe da ponte. Dono e administrador passam por ela.
-- O `with check` repete o `using` inteiro (lição 15). Sem UPDATE: errou, tira e cadastra de novo.
drop policy if exists feriados_da_empresa_quem_configura on public.feriados_da_empresa;
create policy feriados_da_empresa_quem_configura on public.feriados_da_empresa
  for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
    and exists (select 1 from unnest(array['tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial',
                                           'educacional', 'compras', 'expedicao', 'producao']) s(m)
                 where public.pode_configurar_setor(s.m)));
drop policy if exists feriados_da_empresa_tira on public.feriados_da_empresa;
create policy feriados_da_empresa_tira on public.feriados_da_empresa
  for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
    and exists (select 1 from unnest(array['tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial',
                                           'educacional', 'compras', 'expedicao', 'producao']) s(m)
                 where public.pode_configurar_setor(s.m)));

-- ─── 3. Somar minutos úteis ───────────────────────────────────────────────────────────────────
-- Dia a dia, no horário de parede de São Paulo. `security definer` para enxergar os feriados da
-- empresa sem depender do RLS de quem abriu o chamado (só o banco chama: o trigger e a migration).
create or replace function public.somar_minutos_uteis(
  p_inicio timestamptz, p_minutos integer, p_inicio_exp time, p_fim_exp time,
  p_conta_fim_de_semana boolean, p_tenant uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_local timestamp := p_inicio at time zone 'America/Sao_Paulo';
  v_falta interval := make_interval(mins => greatest(coalesce(p_minutos, 0), 0));
  v_dia date;
  v_abre timestamp;
  v_fecha timestamp;
  v_voltas int := 0;
begin
  if p_inicio is null or p_minutos is null then
    return null;
  end if;
  loop
    v_dia := v_local::date;
    if (coalesce(p_conta_fim_de_semana, false) or extract(isodow from v_dia) < 6)
       and not exists (select 1 from public.feriados_nacionais(extract(year from v_dia)::int) n where n.data = v_dia)
       and not exists (select 1 from public.feriados_da_empresa e where e.tenant_id = p_tenant and e.data = v_dia)
    then
      v_abre  := v_dia + coalesce(p_inicio_exp, time '00:00');
      v_fecha := case when p_fim_exp is null then (v_dia + 1)::timestamp else v_dia + p_fim_exp end;
      if v_local < v_abre then
        v_local := v_abre;
      end if;
      if v_local < v_fecha then
        if v_local + v_falta <= v_fecha then
          return (v_local + v_falta) at time zone 'America/Sao_Paulo';
        end if;
        v_falta := v_falta - (v_fecha - v_local);
      end if;
    end if;
    v_local := (v_dia + 1)::timestamp;
    -- Trava contra laço sem fim (ex.: um ano inteiro de feriados cadastrados).
    v_voltas := v_voltas + 1;
    if v_voltas > 3700 then
      raise exception 'Prazo não cabe em 10 anos de expediente.';
    end if;
  end loop;
end;
$$;

comment on function public.somar_minutos_uteis(timestamptz, integer, time, time, boolean, uuid) is
  'Início + N minutos de expediente (São Paulo), sem fim de semana (salvo se conta) e sem feriados. Horas nulas = dia inteiro.';

-- O prazo de um chamado pela regra do setor (mesma assinatura; `create or replace` mantém a ACL).
create or replace function public.prazo_do_chamado(p_tenant uuid, p_module text, p_inicio timestamptz, p_minutos integer)
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r public.sla_regras_do_setor%rowtype;
  p record;
begin
  select * into r from public.sla_regras_do_setor where tenant_id = p_tenant and module = p_module;
  if not found then
    select * into p from public.expediente_padrao(p_module);
    return public.somar_minutos_uteis(p_inicio, p_minutos, p.inicio, p.fim, false, p_tenant);
  end if;
  return public.somar_minutos_uteis(p_inicio, p_minutos, r.inicio_expediente, r.fim_expediente,
                                    not r.pausa_fim_de_semana, p_tenant);
end;
$$;

-- A função da primeira rodada fica sem uso.
drop function if exists public.somar_minutos_sem_fim_de_semana(timestamptz, integer);

revoke all on function public.somar_minutos_uteis(timestamptz, integer, time, time, boolean, uuid) from public, anon;
revoke all on function public.expediente_padrao(text) from public, anon;
-- A tela de Prazos mostra os nacionais do ano.
revoke all on function public.feriados_nacionais(integer) from public, anon;
grant execute on function public.feriados_nacionais(integer) to authenticated;

-- ─── 4. Os prazos padrão em horas úteis ───────────────────────────────────────────────────────
update public.sla_policies set resolution_time = 1200
 where module is null and priority = 'medium' and resolution_time = 1440;
update public.sla_policies set resolution_time = 2400
 where module is null and priority = 'low' and resolution_time = 2880;

create or replace function public.seed_default_sla_policies()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Minutos ÚTEIS (2026-10-04): média 2 dias úteis, baixa 4 dias úteis de 10h.
  insert into public.sla_policies (tenant_id, name, priority, first_response_time, resolution_time)
  values
    (new.id, 'SLA Crítico', 'critical', 60, 240),
    (new.id, 'SLA Alto', 'high', 120, 480),
    (new.id, 'SLA Médio', 'medium', 240, 1200),
    (new.id, 'SLA Baixo', 'low', 480, 2400);
  return new;
end;
$function$;

-- ─── 5. Os chamados em aberto passam a seguir a regra ─────────────────────────────────────────
-- Pela POLÍTICA de hoje (a mesma busca do trigger `calculate_sla_due_at`), não pela duração
-- gravada: a rodada anterior já tinha esticado essas durações, e a política mudou de número. Fica
-- de fora o que já acabou e o prazo que É a data escolhida pela pessoa (`sla_due_at = due_date`).
-- Só `sla_due_at` muda (nenhum aviso observa a coluna); a automação recebe a porta, como antes.
do $$
begin
  perform set_config('helpoint.automation', '1', true);

  update public.tickets t
     set sla_due_at = case when t.due_date is not null and t.due_date > n.prazo then t.due_date else n.prazo end
    from (
      select t2.id,
             public.prazo_do_chamado(t2.tenant_id, t2.module, t2.created_at,
               (select s.resolution_time from public.sla_policies s
                 where s.tenant_id = t2.tenant_id and s.priority = t2.priority and s.is_active
                   and (s.module = t2.module or s.module is null)
                 order by s.module nulls last
                 limit 1)) as prazo
        from public.tickets t2
       where t2.sla_due_at is not null
         and t2.status not in ('resolved', 'closed', 'cancelled', 'rejected')
         and (t2.due_date is null or t2.sla_due_at <> t2.due_date)
    ) n
   where t.id = n.id and n.prazo is not null;

  perform set_config('helpoint.automation', '0', true);
end $$;
