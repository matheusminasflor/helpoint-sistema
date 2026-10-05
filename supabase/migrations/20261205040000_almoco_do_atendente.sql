-- O PRAZO PARA NO ALMOÇO DE QUEM ATENDE (decisão do dono, 2026-10-04).
--
-- O dono: "colocar no horário de almoço… quem configura também é o RH, porque cada colaborador tem o
-- seu horário de almoço, mas isso é opcional". Então:
--   * o almoço mora no cadastro do colaborador no RH (`rh_employee_profiles`), opcional — o
--     colaborador não edita o próprio cadastro (só `pode_no_rh('employees','edit')`);
--   * o relógio do prazo para no almoço do ATENDENTE (`tickets.assigned_to`). Chamado sem atendente
--     não para: ainda não é o almoço de ninguém;
--   * ao atribuir ou trocar o atendente de um chamado em aberto, o prazo é recalculado desde a
--     abertura, pela política de hoje, com o almoço do novo atendente.
--   Exemplo (08–18, almoço 12–13, 4h úteis): aberto às 10:00 vence às 15:00; sem atendente, às 14:00.

-- ─── 1. O almoço no cadastro do colaborador ───────────────────────────────────────────────────
alter table public.rh_employee_profiles
  add column if not exists inicio_almoco time,
  add column if not exists fim_almoco time;
alter table public.rh_employee_profiles drop constraint if exists rh_employee_profiles_almoco_check;
alter table public.rh_employee_profiles
  add constraint rh_employee_profiles_almoco_check
  check ((inicio_almoco is null) = (fim_almoco is null) and (fim_almoco is null or fim_almoco > inicio_almoco));

comment on column public.rh_employee_profiles.inicio_almoco is
  'Início do almoço (opcional, o RH preenche). O prazo dos chamados que a pessoa atende para nesse intervalo.';

-- A tabela tem permissão por coluna desde 20261119030000 (o salário não é legível direto): as colunas
-- novas precisam entrar na lista para a tela ler e gravar. Quem grava continua sendo a policy.
grant select (inicio_almoco, fim_almoco), insert (inicio_almoco, fim_almoco), update (inicio_almoco, fim_almoco)
  on public.rh_employee_profiles to authenticated;

-- ─── 2. Somar minutos úteis, pulando o almoço ─────────────────────────────────────────────────
-- A de 20261203050000 com dois parâmetros a mais. A antiga (6 parâmetros) passa a chamar esta, sem
-- almoço — `create or replace` mantém a permissão dela.
create or replace function public.somar_minutos_uteis(
  p_inicio timestamptz, p_minutos integer, p_inicio_exp time, p_fim_exp time,
  p_conta_fim_de_semana boolean, p_tenant uuid, p_almoco_inicio time, p_almoco_fim time)
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
  v_de timestamp[];
  v_ate timestamp[];
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
      -- Os trechos do dia: o expediente inteiro, ou antes e depois do almoço quando ele cai dentro.
      if p_almoco_inicio is not null and p_almoco_fim is not null
         and v_dia + p_almoco_inicio < v_fecha and v_dia + p_almoco_fim > v_abre then
        v_de  := array[v_abre, greatest(v_dia + p_almoco_fim, v_abre)];
        v_ate := array[least(v_dia + p_almoco_inicio, v_fecha), v_fecha];
      else
        v_de  := array[v_abre];
        v_ate := array[v_fecha];
      end if;
      for i in 1 .. array_length(v_de, 1) loop
        if v_local < v_de[i] then
          v_local := v_de[i];
        end if;
        if v_local < v_ate[i] then
          if v_local + v_falta <= v_ate[i] then
            return (v_local + v_falta) at time zone 'America/Sao_Paulo';
          end if;
          v_falta := v_falta - (v_ate[i] - v_local);
          v_local := v_ate[i];
        end if;
      end loop;
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

comment on function public.somar_minutos_uteis(timestamptz, integer, time, time, boolean, uuid, time, time) is
  'Início + N minutos de expediente (São Paulo), sem fim de semana (salvo se conta), sem feriados e sem o almoço informado.';

create or replace function public.somar_minutos_uteis(
  p_inicio timestamptz, p_minutos integer, p_inicio_exp time, p_fim_exp time,
  p_conta_fim_de_semana boolean, p_tenant uuid)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.somar_minutos_uteis(p_inicio, p_minutos, p_inicio_exp, p_fim_exp, p_conta_fim_de_semana, p_tenant, null, null);
$$;

-- ─── 3. O prazo de um chamado, com o atendente ────────────────────────────────────────────────
create or replace function public.prazo_do_chamado(
  p_tenant uuid, p_module text, p_inicio timestamptz, p_minutos integer, p_atendente uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r public.sla_regras_do_setor%rowtype;
  p record;
  a record;
begin
  select e.inicio_almoco, e.fim_almoco into a
    from public.rh_employee_profiles e
   where p_atendente is not null and e.user_id = p_atendente and e.tenant_id = p_tenant
   limit 1;
  select * into r from public.sla_regras_do_setor where tenant_id = p_tenant and module = p_module;
  if not found then
    select * into p from public.expediente_padrao(p_module);
    return public.somar_minutos_uteis(p_inicio, p_minutos, p.inicio, p.fim, false, p_tenant,
                                      a.inicio_almoco, a.fim_almoco);
  end if;
  return public.somar_minutos_uteis(p_inicio, p_minutos, r.inicio_expediente, r.fim_expediente,
                                    not r.pausa_fim_de_semana, p_tenant, a.inicio_almoco, a.fim_almoco);
end;
$$;

-- A de 4 parâmetros continua valendo para quem a chama (sem atendente = sem almoço).
create or replace function public.prazo_do_chamado(p_tenant uuid, p_module text, p_inicio timestamptz, p_minutos integer)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.prazo_do_chamado(p_tenant, p_module, p_inicio, p_minutos, null::uuid);
$$;

-- O prazo-padrão de um chamado: a política do setor (ou da empresa) para a prioridade, e a data
-- pedida pela pessoa quando ela é depois do prazo. A MESMA conta na abertura e na troca de atendente.
create or replace function public.prazo_padrao_do_chamado(
  p_tenant uuid, p_module text, p_priority text, p_inicio timestamptz, p_atendente uuid, p_due_date timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_minutos integer;
  v_prazo timestamptz;
begin
  select s.resolution_time into v_minutos
    from public.sla_policies s
   where s.tenant_id = p_tenant and s.priority::text = p_priority and s.is_active
     and (s.module = p_module or s.module is null)
   order by s.module nulls last
   limit 1;
  if v_minutos is null then
    return null;
  end if;
  v_prazo := public.prazo_do_chamado(p_tenant, p_module, p_inicio, v_minutos, p_atendente);
  if p_due_date is not null and p_due_date > v_prazo then
    return p_due_date;
  end if;
  return v_prazo;
end;
$$;

revoke all on function public.somar_minutos_uteis(timestamptz, integer, time, time, boolean, uuid, time, time) from public, anon;
revoke all on function public.prazo_do_chamado(uuid, text, timestamptz, integer, uuid) from public, anon;
revoke all on function public.prazo_padrao_do_chamado(uuid, text, text, timestamptz, uuid, timestamptz) from public, anon;

-- ─── 4. A abertura usa o atendente (o da categoria já veio antes: `trg_chamado_vai_para_o_responsavel`
-- roda antes deste trigger, pela ordem alfabética dos BEFORE INSERT) ────────────────────────────
create or replace function public.calculate_sla_due_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- If sla_due_at was manually set, don't override
  if new.sla_due_at is not null then
    return new;
  end if;
  new.sla_due_at := public.prazo_padrao_do_chamado(new.tenant_id, new.module, new.priority::text,
                                                   coalesce(new.created_at, now()), new.assigned_to, new.due_date);
  return new;
end;
$function$;

-- ─── 5. Trocar o atendente recalcula o prazo ──────────────────────────────────────────────────
-- Só em aberto, e só quando o mesmo comando não mexeu no prazo. `sla_due_at` não é observado pelo
-- aviso (`trg_notify_on_ticket_change` é `after update of status, assigned_to, …`): o aviso que sai
-- é o da troca de atendente, que já sairia. Roda depois da guarda do perfil (`chamado_guarda_o_perfil`
-- vem antes na ordem alfabética), que confere o que a PESSOA mandou — o prazo novo é do sistema.
create or replace function public.sla_segue_o_atendente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prazo timestamptz;
begin
  if new.assigned_to is not distinct from old.assigned_to
     or old.sla_due_at is null
     or new.sla_due_at is distinct from old.sla_due_at
     or new.status::text in ('resolved', 'closed', 'cancelled', 'rejected') then
    return new;
  end if;
  v_prazo := public.prazo_padrao_do_chamado(new.tenant_id, new.module, new.priority::text,
                                            new.created_at, new.assigned_to, new.due_date);
  if v_prazo is not null then
    new.sla_due_at := v_prazo;
  end if;
  return new;
end;
$$;

revoke all on function public.sla_segue_o_atendente() from public, anon, authenticated;

drop trigger if exists trg_sla_segue_o_atendente on public.tickets;
create trigger trg_sla_segue_o_atendente
  before update of assigned_to on public.tickets
  for each row execute function public.sla_segue_o_atendente();
