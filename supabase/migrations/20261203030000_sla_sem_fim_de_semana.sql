-- PRAZO DE ATENDIMENTO (SLA) NÃO CONTA SÁBADO E DOMINGO (decisão do dono, 2026-10-04).
--
-- O dono: o SLA não conta sábado e domingo; vale por SETOR, LIGADO por padrão em todos, e o setor
-- que trabalha no fim de semana (ex.: Expedição) desliga. Por enquanto só o fim de semana — sem
-- horário comercial, sem feriado.
--
-- ANTES: `calculate_sla_due_at` (trigger BEFORE INSERT em `tickets`) fazia
-- `sla_due_at = created_at + resolution_time minutos`, corridos. Um chamado de 8 horas aberto na
-- sexta às 17h vencia no sábado à 1h — e aparecia estourado na segunda de manhã sem ninguém ter
-- tido um minuto útil para ele.
--
-- A REGRA, por extenso (fuso de São Paulo, o mesmo do resto do sistema):
--   * o relógio do prazo só anda de segunda 00:00 a sexta 23:59:59; sábado e domingo não contam;
--   * chamado aberto na sexta às 17:00 com 8 horas: 7 horas até sábado 00:00, a 1 hora que falta
--     corre na segunda → vence SEGUNDA À 01:00;
--   * chamado aberto no sábado ou no domingo começa a contar na segunda às 00:00 (8 horas →
--     segunda às 08:00);
--   * setor com a pausa desligada: soma corrida, como antes.
--
-- ONDE MORA A CHAVE. Numa tabela pequena por setor, `sla_regras_do_setor`, e não em
-- `sla_policies`: lá o setor só tem linha se tiver prazo PRÓPRIO — quem usa o padrão da empresa
-- não teria onde guardar a escolha. Setor sem linha aqui = pausa LIGADA (o padrão do dono). Quem
-- muda é quem já muda o prazo do setor (`pode_configurar_setor`, a mesma pergunta da policy
-- `sla_policies_prazo_do_setor`), na aba Chamados › Prazos de atendimento.
--
-- ONDE MAIS O PRAZO É CALCULADO. Procurado nas migrations: só no INSERT (`calculate_sla_due_at`).
-- Mudar prioridade ou transferir de setor não recalcula `sla_due_at` hoje — continua assim; a regra
-- nova vale onde o prazo nasce, e no recálculo dos chamados em aberto, abaixo.

-- ─── 1. A chave por setor ─────────────────────────────────────────────────────────────────────
create table if not exists public.sla_regras_do_setor (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module text not null check (module = any (array[
    'tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial', 'educacional', 'compras',
    'expedicao', 'producao'])),
  pausa_fim_de_semana boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, module)
);

comment on table public.sla_regras_do_setor is
  'Regras do prazo (SLA) por setor. Sem linha = pausa no fim de semana LIGADA (decisão do dono, 2026-10-04).';

create trigger handle_sla_regras_do_setor_updated_at
  before update on public.sla_regras_do_setor
  for each row execute function public.handle_updated_at();

alter table public.sla_regras_do_setor enable row level security;
revoke all on public.sla_regras_do_setor from anon;

-- Ler: a empresa toda (a tela de prazos mostra a regra a quem só vê). Escrever: quem configura o
-- setor. O `with check` repete o `using` inteiro (lição 15): nada de porta de saída só com tenant.
create policy sla_regras_do_setor_le on public.sla_regras_do_setor
  for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy sla_regras_do_setor_quem_configura on public.sla_regras_do_setor
  for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_setor(module))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_configurar_setor(module));

-- ─── 2. Somar minutos pulando o fim de semana ─────────────────────────────────────────────────
-- Conta no horário de parede de São Paulo (`timestamp` sem fuso): "segunda 00:00" é a meia-noite
-- daqui, não a de Greenwich. Uma volta do laço por semana atravessada.
create or replace function public.somar_minutos_sem_fim_de_semana(p_inicio timestamptz, p_minutos integer)
returns timestamptz
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_local timestamp := p_inicio at time zone 'America/Sao_Paulo';
  v_falta interval := make_interval(mins => greatest(coalesce(p_minutos, 0), 0));
  v_sabado timestamp;
begin
  if p_inicio is null or p_minutos is null then
    return null;
  end if;
  loop
    -- No fim de semana, o relógio está parado: pula para segunda 00:00.
    if extract(isodow from v_local) in (6, 7) then
      v_local := date_trunc('day', v_local) + make_interval(days => (8 - extract(isodow from v_local))::int);
    end if;
    -- O sábado 00:00 desta semana (date_trunc('week') é a segunda).
    v_sabado := date_trunc('week', v_local) + interval '5 days';
    if v_local + v_falta <= v_sabado then
      return (v_local + v_falta) at time zone 'America/Sao_Paulo';
    end if;
    v_falta := v_falta - (v_sabado - v_local);
    v_local := v_sabado;
  end loop;
end;
$$;

comment on function public.somar_minutos_sem_fim_de_semana(timestamptz, integer) is
  'Início + N minutos, sem contar sábado e domingo (fuso de São Paulo). Sexta 17:00 + 8h = segunda 01:00.';

-- O prazo de um chamado pela regra do setor: o único lugar que decide entre as duas somas.
create or replace function public.prazo_do_chamado(p_tenant uuid, p_module text, p_inicio timestamptz, p_minutos integer)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when coalesce((select r.pausa_fim_de_semana from public.sla_regras_do_setor r
                    where r.tenant_id = p_tenant and r.module = p_module), true)
      then public.somar_minutos_sem_fim_de_semana(p_inicio, p_minutos)
    else p_inicio + make_interval(mins => p_minutos)
  end;
$$;

comment on function public.prazo_do_chamado(uuid, text, timestamptz, integer) is
  'Início + N minutos pela regra do setor (sla_regras_do_setor): sem fim de semana, salvo se o setor desligou.';

-- Só o banco chama (o trigger e a migration). A tela não precisa: ela lê `sla_due_at` pronto.
revoke all on function public.somar_minutos_sem_fim_de_semana(timestamptz, integer) from public, anon;
revoke all on function public.prazo_do_chamado(uuid, text, timestamptz, integer) from public, anon;

-- ─── 3. O trigger usa a regra ─────────────────────────────────────────────────────────────────
-- Igual ao de 20261115020000 (prazo por setor), trocando só a soma. O resto fica exatamente como
-- estava: `sla_due_at` já preenchido não é tocado, e `due_date` posterior ao prazo padrão manda.
-- `create or replace` preserva a ACL.
create or replace function public.calculate_sla_due_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _resolution_time integer;
  _standard_sla timestamptz;
begin
  -- If sla_due_at was manually set, don't override
  if new.sla_due_at is not null then
    return new;
  end if;

  -- O prazo do setor, se houver um ativo; senão o padrão da empresa (module nulo).
  select resolution_time into _resolution_time
    from public.sla_policies
   where tenant_id = new.tenant_id
     and priority = new.priority
     and is_active = true
     and (module = new.module or module is null)
   order by module nulls last
   limit 1;

  if _resolution_time is not null then
    -- 2026-10-04: sem sábado e domingo, salvo se o setor desligou a pausa.
    _standard_sla := public.prazo_do_chamado(new.tenant_id, new.module, coalesce(new.created_at, now()), _resolution_time);

    -- If custom due_date exists and is later than standard SLA, use due_date
    if new.due_date is not null and new.due_date > _standard_sla then
      new.sla_due_at := new.due_date;
    else
      new.sla_due_at := _standard_sla;
    end if;
  end if;

  return new;
end;
$function$;

-- ─── 4. Os chamados em aberto passam a seguir a regra (o dono quis justiça já) ────────────────
-- O mesmo prazo que cada um ganhou ao nascer (`sla_due_at - created_at`, que preserva a política
-- daquele dia mesmo que ela tenha mudado depois), agora sem o fim de semana. Fica de fora:
--   * o que já acabou (resolvido, fechado, cancelado, reprovado) — o veredito do SLA já saiu;
--   * o prazo que É a data escolhida pela pessoa (`sla_due_at = due_date`): é um dia de calendário
--     que alguém marcou, não uma conta de minutos.
-- O UPDATE mexe só em `sla_due_at`, que nenhum trigger de aviso observa
-- (`trg_notify_on_ticket_change` é `after update of status, assigned_to, module, priority,
-- due_date, title, asset_id, category`). A automação recebe a porta `helpoint.automation`, como
-- na migration anterior: mudar o prazo por arrumação não é evento de ninguém. Num bloco só, para a
-- porta valer no mesmo comando do UPDATE mesmo que a migration não rode dentro de uma transação.
do $$
begin
  perform set_config('helpoint.automation', '1', true);

  update public.tickets t
     set sla_due_at = public.prazo_do_chamado(
           t.tenant_id, t.module, t.created_at,
           (extract(epoch from (t.sla_due_at - t.created_at)) / 60)::integer)
   where t.sla_due_at is not null
     and t.status not in ('resolved', 'closed', 'cancelled', 'rejected')
     and t.sla_due_at > t.created_at
     and (t.due_date is null or t.sla_due_at <> t.due_date);

  perform set_config('helpoint.automation', '0', true);
end $$;
