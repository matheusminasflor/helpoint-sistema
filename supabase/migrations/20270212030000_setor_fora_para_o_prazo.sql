-- SETOR FORA: O PRAZO DE TODOS OS CHAMADOS DO SETOR PARA (dono, 2026-10-27).
--
-- "O setor de TI no dia 26 e 27 está com chamados vencidos, porém o TI está em dias de evento dando apoio, com isso
-- não tem ninguém no setor para fazer as demandas. É injusto ficar SLA vencido e esses indicadores impactar na
-- equipe." Decisões (as duas = as recomendadas):
--   1. "Setor fora": um período (dias) em que o setor inteiro está fora. Nesses dias o relógio do prazo não anda para
--      NENHUM chamado do setor — os já abertos também (diferente da viagem por pessoa, 20261219020000, que só vale
--      para o chamado novo) —, e vale para datas que já passaram: registrar corrige os prazos de quem estava aberto.
--   2. Registra quem já registra Viagens (`pode_no_chamado(setor, 'registrar_viagem')`: gestor com a caixinha, ou
--      administrador), sempre com motivo.
--
-- Como: o dia "fora" entra no calendário do setor como um feriado só dele (`trechos_uteis_do_dia` ganha o setor).
-- Registrar ou tirar recalcula, na mesma transação, os prazos dos chamados do setor que estiveram abertos no
-- período — os resolvidos também, porque é deles que sai o "Fora do prazo" da equipe. Prazo posto à mão fica.

-- ─── 1. Os períodos ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.setor_fora (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- O `tickets.module` do setor ('tickets' é a TI).
  module text not null,
  de date not null,
  ate date not null,
  motivo text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint setor_fora_ate_depois check (ate >= de),
  constraint setor_fora_com_motivo check (btrim(motivo) <> ''),
  constraint setor_fora_ate_60_dias check (ate - de <= 60)
);
create index if not exists setor_fora_do_setor on public.setor_fora (tenant_id, module, de, ate);

alter table public.setor_fora enable row level security;
revoke all on public.setor_fora from anon;
grant select on public.setor_fora to authenticated;
-- Ler: a empresa toda (o chamado mostra por que o prazo parou). Escrever: só pelas funções abaixo.
create policy setor_fora_le on public.setor_fora for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));

-- ─── 2. O calendário enxerga o setor ────────────────────────────────────────────────────────────────
-- Versões com o setor; as de antes (sem setor) continuam para quem não é chamado (`dias_uteis_ate`).
create or replace function public.trechos_uteis_do_dia(p_dia date, p_inicio_exp time, p_fim_exp time,
  p_conta_fim_de_semana boolean, p_tenant uuid, p_almoco_inicio time, p_almoco_fim time, p_module text)
returns table(de timestamp, ate timestamp) language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_abre timestamp;
  v_fecha timestamp;
begin
  if not (coalesce(p_conta_fim_de_semana, false) or extract(isodow from p_dia) < 6)
     or exists (select 1 from public.feriados_nacionais(extract(year from p_dia)::int) n where n.data = p_dia)
     or exists (select 1 from public.feriados_da_empresa e where e.tenant_id = p_tenant and e.data = p_dia)
     or (p_module is not null and exists (select 1 from public.setor_fora s
          where s.tenant_id = p_tenant and s.module = p_module and p_dia between s.de and s.ate)) then
    return;
  end if;
  v_abre  := p_dia + coalesce(p_inicio_exp, time '00:00');
  v_fecha := case when p_fim_exp is null then (p_dia + 1)::timestamp else p_dia + p_fim_exp end;
  if p_almoco_inicio is not null and p_almoco_fim is not null
     and p_dia + p_almoco_inicio < v_fecha and p_dia + p_almoco_fim > v_abre then
    de := v_abre; ate := least(p_dia + p_almoco_inicio, v_fecha); return next;
    de := greatest(p_dia + p_almoco_fim, v_abre); ate := v_fecha; return next;
  else
    de := v_abre; ate := v_fecha; return next;
  end if;
end;
$$;
revoke all on function public.trechos_uteis_do_dia(date, time, time, boolean, uuid, time, time, text) from public, anon, authenticated;

create or replace function public.trechos_uteis_do_dia(p_dia date, p_inicio_exp time, p_fim_exp time,
  p_conta_fim_de_semana boolean, p_tenant uuid, p_almoco_inicio time, p_almoco_fim time)
returns table(de timestamp, ate timestamp) language sql stable security definer set search_path to 'public' as $$
  select * from public.trechos_uteis_do_dia(p_dia, p_inicio_exp, p_fim_exp, p_conta_fim_de_semana, p_tenant,
                                            p_almoco_inicio, p_almoco_fim, null::text);
$$;

create or replace function public.somar_minutos_uteis(p_inicio timestamptz, p_minutos integer, p_inicio_exp time,
  p_fim_exp time, p_conta_fim_de_semana boolean, p_tenant uuid, p_almoco_inicio time, p_almoco_fim time, p_module text)
returns timestamptz language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_local timestamp := p_inicio at time zone 'America/Sao_Paulo';
  v_falta interval := make_interval(mins => greatest(coalesce(p_minutos, 0), 0));
  v_dia date;
  t record;
  v_voltas int := 0;
begin
  if p_inicio is null or p_minutos is null then
    return null;
  end if;
  loop
    v_dia := v_local::date;
    for t in select * from public.trechos_uteis_do_dia(v_dia, p_inicio_exp, p_fim_exp,
                p_conta_fim_de_semana, p_tenant, p_almoco_inicio, p_almoco_fim, p_module) loop
      if v_local < t.de then
        v_local := t.de;
      end if;
      if v_local < t.ate then
        if v_local + v_falta <= t.ate then
          return (v_local + v_falta) at time zone 'America/Sao_Paulo';
        end if;
        v_falta := v_falta - (t.ate - v_local);
        v_local := t.ate;
      end if;
    end loop;
    v_local := (v_dia + 1)::timestamp;
    -- Trava contra laço sem fim (ex.: um ano inteiro de feriados cadastrados).
    v_voltas := v_voltas + 1;
    if v_voltas > 3700 then
      raise exception 'Prazo não cabe em 10 anos de expediente.';
    end if;
  end loop;
end;
$$;
revoke all on function public.somar_minutos_uteis(timestamptz, integer, time, time, boolean, uuid, time, time, text) from public, anon;
grant execute on function public.somar_minutos_uteis(timestamptz, integer, time, time, boolean, uuid, time, time, text) to authenticated;

create or replace function public.somar_minutos_uteis(p_inicio timestamptz, p_minutos integer, p_inicio_exp time,
  p_fim_exp time, p_conta_fim_de_semana boolean, p_tenant uuid, p_almoco_inicio time, p_almoco_fim time)
returns timestamptz language sql stable security definer set search_path to 'public' as $$
  select public.somar_minutos_uteis(p_inicio, p_minutos, p_inicio_exp, p_fim_exp, p_conta_fim_de_semana, p_tenant,
                                    p_almoco_inicio, p_almoco_fim, null::text);
$$;

create or replace function public.contar_minutos_uteis(p_de timestamptz, p_ate timestamptz, p_inicio_exp time,
  p_fim_exp time, p_conta_fim_de_semana boolean, p_tenant uuid, p_almoco_inicio time, p_almoco_fim time, p_module text)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_de timestamp := p_de at time zone 'America/Sao_Paulo';
  v_ate timestamp := p_ate at time zone 'America/Sao_Paulo';
  v_dia date;
  v_total interval := interval '0';
  t record;
begin
  if p_de is null or p_ate is null or p_ate <= p_de then
    return 0;
  end if;
  if v_ate::date - v_de::date > 3700 then
    raise exception 'Intervalo maior que 10 anos.';
  end if;
  v_dia := v_de::date;
  while v_dia <= v_ate::date loop
    for t in select * from public.trechos_uteis_do_dia(v_dia, p_inicio_exp, p_fim_exp,
                p_conta_fim_de_semana, p_tenant, p_almoco_inicio, p_almoco_fim, p_module) loop
      if least(t.ate, v_ate) > greatest(t.de, v_de) then
        v_total := v_total + (least(t.ate, v_ate) - greatest(t.de, v_de));
      end if;
    end loop;
    v_dia := v_dia + 1;
  end loop;
  return floor(extract(epoch from v_total) / 60)::int;
end;
$$;
revoke all on function public.contar_minutos_uteis(timestamptz, timestamptz, time, time, boolean, uuid, time, time, text) from public, anon, authenticated;

create or replace function public.contar_minutos_uteis(p_de timestamptz, p_ate timestamptz, p_inicio_exp time,
  p_fim_exp time, p_conta_fim_de_semana boolean, p_tenant uuid, p_almoco_inicio time, p_almoco_fim time)
returns integer language sql stable security definer set search_path to 'public' as $$
  select public.contar_minutos_uteis(p_de, p_ate, p_inicio_exp, p_fim_exp, p_conta_fim_de_semana, p_tenant,
                                     p_almoco_inicio, p_almoco_fim, null::text);
$$;

-- O prazo e as pausas do chamado contam no calendário DO SETOR.
create or replace function public.prazo_do_chamado(p_tenant uuid, p_module text, p_inicio timestamptz, p_minutos integer, p_atendente uuid)
returns timestamptz language sql stable security definer set search_path to 'public' as $$
  select public.somar_minutos_uteis(p_inicio, p_minutos, c.inicio_exp, c.fim_exp,
                                    c.conta_fim_de_semana, p_tenant, c.almoco_inicio, c.almoco_fim, p_module)
    from public.calendario_do_chamado(p_tenant, p_module, p_atendente) c;
$$;

create or replace function public.minutos_uteis_do_chamado(p_tenant uuid, p_module text, p_de timestamptz, p_ate timestamptz, p_atendente uuid)
returns integer language sql stable security definer set search_path to 'public' as $$
  select public.contar_minutos_uteis(p_de, p_ate, c.inicio_exp, c.fim_exp,
                                     c.conta_fim_de_semana, p_tenant, c.almoco_inicio, c.almoco_fim, p_module)
    from public.calendario_do_chamado(p_tenant, p_module, p_atendente) c;
$$;

-- ─── 3. Registrar e tirar recalculam ────────────────────────────────────────────────────────────────
-- Os chamados do setor que estiveram abertos em algum dia do período, e quais estão no prazo padrão (os de prazo
-- posto à mão ficam de fora). Lido ANTES de mudar o calendário: é a mesma conta de `sla_segue_o_atendente`.
-- ponytail: pausa (Pendente, Agendado) que caiu dentro do período já foi somada em minutos pelo calendário de antes;
-- o recálculo não a desconta — o erro é a favor da equipe e só existe se houve pausa e "setor fora" no mesmo dia.
create or replace function public.setor_fora_recalcula(p_tenant uuid, p_module text, p_de date, p_ate date, p_mudar jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_sla uuid[];
  v_resposta uuid[];
  v_id uuid;
  v_automacao text := coalesce(current_setting('helpoint.automation', true), '0');
begin
  select array_agg(t.id) filter (where t.sla_due_at is not distinct from public.prazo_padrao_com_pausa(
             t.tenant_id, t.module, t.priority::text, coalesce(t.prazo_desde, t.created_at), t.assigned_to,
             t.due_date, t.minutos_pausados - t.pausado_antes_do_recomeco)),
         array_agg(t.id) filter (where t.first_response_due_at is not distinct from public.prazo_da_primeira_resposta(
             t.tenant_id, t.module, t.priority::text, t.created_at, t.assigned_to))
    into v_sla, v_resposta
    from public.tickets t
   where t.tenant_id = p_tenant and t.module = p_module and t.status::text <> 'cancelled'
     and (t.created_at at time zone 'America/Sao_Paulo')::date <= p_ate
     and (coalesce(t.resolved_at, t.closed_at) is null
          or (coalesce(t.resolved_at, t.closed_at) at time zone 'America/Sao_Paulo')::date >= p_de);

  -- Muda o calendário (registrar ou tirar o período).
  if p_mudar ? 'tirar' then
    delete from public.setor_fora where id = (p_mudar ->> 'tirar')::uuid and tenant_id = p_tenant;
  else
    insert into public.setor_fora (tenant_id, module, de, ate, motivo)
    values (p_tenant, p_module, p_de, p_ate, btrim(p_mudar ->> 'motivo'))
    returning id into v_id;
  end if;

  -- Recalcular não é "o chamado mudou": nenhum fluxo de automação dispara por isso.
  perform set_config('helpoint.automation', '1', true);
  update public.tickets t
     set sla_due_at = coalesce(public.prazo_padrao_com_pausa(
           t.tenant_id, t.module, t.priority::text, coalesce(t.prazo_desde, t.created_at), t.assigned_to,
           t.due_date, t.minutos_pausados - t.pausado_antes_do_recomeco), t.sla_due_at)
   where t.id = any (coalesce(v_sla, '{}'));
  update public.tickets t
     set first_response_due_at = coalesce(public.prazo_da_primeira_resposta(
           t.tenant_id, t.module, t.priority::text, t.created_at, t.assigned_to), t.first_response_due_at)
   where t.id = any (coalesce(v_resposta, '{}'));
  perform set_config('helpoint.automation', v_automacao, true);

  return coalesce(array_length(v_sla, 1), 0);
end;
$$;
revoke all on function public.setor_fora_recalcula(uuid, text, date, date, jsonb) from public, anon, authenticated;

create or replace function public.registrar_setor_fora(p_module text, p_de date, p_ate date, p_motivo text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
begin
  if v_tenant is null or not public.pode_no_chamado(p_module, 'registrar_viagem') then
    raise exception 'Seu perfil de acesso não permite registrar o setor fora.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'O último dia precisa ser igual ou depois do primeiro.' using errcode = '23514';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Diga o motivo (evento, apoio, treinamento…).' using errcode = '23514';
  end if;
  if exists (select 1 from public.setor_fora s where s.tenant_id = v_tenant and s.module = p_module
              and s.de <= p_ate and s.ate >= p_de) then
    raise exception 'Já há um período de setor fora nesses dias.' using errcode = '23505';
  end if;
  return public.setor_fora_recalcula(v_tenant, p_module, p_de, p_ate, jsonb_build_object('motivo', p_motivo));
end;
$$;
revoke all on function public.registrar_setor_fora(text, date, date, text) from public, anon;
grant execute on function public.registrar_setor_fora(text, date, date, text) to authenticated;

create or replace function public.tirar_setor_fora(p_id uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  s public.setor_fora%rowtype;
begin
  select * into s from public.setor_fora where id = p_id and tenant_id = v_tenant;
  if not found then
    raise exception 'Período não encontrado.' using errcode = 'P0002';
  end if;
  if not public.pode_no_chamado(s.module, 'registrar_viagem') then
    raise exception 'Seu perfil de acesso não permite tirar o setor fora.' using errcode = '42501';
  end if;
  return public.setor_fora_recalcula(v_tenant, s.module, s.de, s.ate, jsonb_build_object('tirar', p_id));
end;
$$;
revoke all on function public.tirar_setor_fora(uuid) from public, anon;
grant execute on function public.tirar_setor_fora(uuid) to authenticated;

-- ─── 4. Quem abre chamado durante o período é avisado ───────────────────────────────────────────────
-- A tela já mostra "volta em …" com o que esta função devolve; o setor fora devolve a manhã seguinte ao último dia.
create or replace function public.aviso_de_viagem(p_module text, p_atendente uuid)
returns timestamptz language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select ((max(s.ate) + 1)::timestamp at time zone 'America/Sao_Paulo')
       from public.setor_fora s
      where s.tenant_id = public.get_user_tenant_id() and s.module = p_module
        and (now() at time zone 'America/Sao_Paulo')::date between s.de and s.ate),
    public.volta_da_viagem(public.get_user_tenant_id(), p_module, p_atendente, now()));
$$;
