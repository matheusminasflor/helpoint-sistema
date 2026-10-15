-- LIMITE DE AGENDAMENTO (dono, 2026-10-15: "os usuários estão colocando agendamento para pausar o SLA e não ficar
-- vencido"). Plano: .scratch/plano-limite-de-agendamento.md. Medido: 4 dos 9 agendados foram agendados com o prazo JÁ
-- vencido (#32 e #86 por 7 dias) — e ao sair do Agendado o prazo era empurrado pelo tempo parado: o vencido voltava
-- "no prazo". Decisões (múltipla escolha, as recomendadas):
--   1. vencido pode agendar, mas o atraso fica: a pausa não empurra o prazo (`agendou_vencido`);
--   2. limite por setor, padrão 3 dias úteis; acima, só o Gestor do setor (ou administrador);
--   3. o Operador agenda e reagenda 1 vez (2 datas); da 3ª em diante, só o Gestor;
--   4. o gestor do setor é avisado quando alguém agenda com o prazo vencido;
--   5. os agendados hoje depois de vencidos voltam a contar como atrasados.

alter table public.sla_regras_do_setor
  add column if not exists agendar_max_dias_uteis smallint not null default 3 check (agendar_max_dias_uteis between 0 and 60);
alter table public.tickets
  add column if not exists agendamentos smallint not null default 0,
  add column if not exists agendou_vencido boolean not null default false;

/** Quantos dias úteis do setor há de amanhã até o dia `p_ate` (no Brasil) — expediente, fim de semana e feriados. */
create or replace function public.dias_uteis_ate(p_tenant uuid, p_module text, p_atendente uuid, p_ate timestamptz)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.calendario_do_chamado(p_tenant, p_module, p_atendente) c,
         generate_series(((now() at time zone 'America/Sao_Paulo')::date + 1),
                         (p_ate at time zone 'America/Sao_Paulo')::date, interval '1 day') d
   where exists (select 1 from public.trechos_uteis_do_dia(d::date, c.inicio_exp, c.fim_exp, c.conta_fim_de_semana, p_tenant, null, null));
$$;
revoke all on function public.dias_uteis_ate(uuid, text, uuid, timestamptz) from public, anon;
grant execute on function public.dias_uteis_ate(uuid, text, uuid, timestamptz) to authenticated;

/** O limite de dias úteis de agendamento do setor (3 se o setor não mexeu). */
create or replace function public.limite_de_agendamento(p_tenant uuid, p_module text)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select agendar_max_dias_uteis from public.sla_regras_do_setor where tenant_id = p_tenant and module = p_module), 3);
$$;
revoke all on function public.limite_de_agendamento(uuid, text) from public, anon;
grant execute on function public.limite_de_agendamento(uuid, text) to authenticated;

create or replace function public.chamado_limite_de_agendamento()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entra boolean := new.status::text = 'scheduled' and old.status::text <> 'scheduled';
  v_reagenda boolean := new.status::text = 'scheduled' and old.status::text = 'scheduled'
                        and new.agendado_para is distinct from old.agendado_para;
  v_gestor boolean;
  v_dias int;
  v_limite int;
begin
  if not (v_entra or v_reagenda) then
    return new;
  end if;
  new.agendamentos := old.agendamentos + 1;
  -- O atraso não se apaga: agendar com o prazo vencido marca o chamado, e a pausa não empurra o prazo.
  if v_entra then
    new.agendou_vencido := old.sla_due_at is not null and old.sla_due_at <= now();
  end if;
  -- O robô (agenda que vence, gatilhos) não passa pelo limite; só a pessoa.
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return new;
  end if;
  v_gestor := public.is_admin_or_higher(auth.uid())
              or public.gestor_do_setor(auth.uid(), public.setor_do_modulo(new.module));
  if v_gestor then
    return new;
  end if;
  if new.agendamentos > 2 then
    raise exception 'Este chamado já foi agendado e reagendado: daqui em diante, só o Gestor do setor agenda.'
      using errcode = '42501';
  end if;
  v_limite := public.limite_de_agendamento(new.tenant_id, new.module);
  v_dias := public.dias_uteis_ate(new.tenant_id, new.module, new.assigned_to, new.agendado_para);
  if v_dias > v_limite then
    raise exception 'Agendamento de % dias úteis: o limite do setor é %. Acima disso, só o Gestor do setor agenda.', v_dias, v_limite
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.chamado_limite_de_agendamento() from public, anon, authenticated;
-- O nome ordena antes de `trg_chamado_pausa_em_pendente`: a marca de vencido já está gravada quando a pausa abre.
drop trigger if exists trg_chamado_limite_de_agendamento on public.tickets;
create trigger trg_chamado_limite_de_agendamento before update of status, agendado_para on public.tickets
  for each row execute function public.chamado_limite_de_agendamento();

-- A pausa (igual a 20261221010000), sem empurrar o prazo de quem foi agendado já vencido.
create or replace function public.chamado_pausa_em_pendente()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_parado integer;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status::text = 'scheduled' then
    new.agendado_para := null;
    new.agendado_motivo := null;
  end if;
  if old.status::text in ('waiting_user', 'waiting_parts', 'scheduled') and old.pendente_desde is not null then
    v_parado := coalesce(public.minutos_uteis_do_chamado(new.tenant_id, new.module, old.pendente_desde, now(),
                                                         new.assigned_to), 0);
    new.pendente_desde := null;
    if v_parado > 0 then
      new.minutos_pausados := old.minutos_pausados + v_parado;
      if old.status::text = 'scheduled' then
        new.minutos_agendados := old.minutos_agendados + v_parado;
      end if;
      -- Agendado com o prazo já vencido (2026-10-15): o tempo parado conta no relatório, mas não empurra o prazo.
      if new.sla_due_at is not distinct from old.sla_due_at and new.sla_due_at is not null
         and not (old.status::text = 'scheduled' and old.agendou_vencido) then
        new.sla_due_at := public.prazo_do_chamado(new.tenant_id, new.module, old.sla_due_at, v_parado,
                                                  new.assigned_to);
      end if;
    end if;
  end if;
  if new.status::text in ('waiting_user', 'waiting_parts', 'scheduled') then
    new.pendente_desde := now();
  end if;
  return new;
end;
$$;

-- O gestor do setor fica sabendo de quem agenda com o prazo vencido (o próprio gestor não se avisa).
create or replace function public.avisa_agendado_vencido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_gestores uuid[];
  v_quem text;
begin
  if not (new.status::text = 'scheduled' and old.status::text <> 'scheduled' and new.agendou_vencido) or auth.uid() is null then
    return null;
  end if;
  select coalesce(array_agg(p.id), '{}') into v_gestores
    from public.profiles p
   where p.tenant_id = new.tenant_id and coalesce(p.is_active, true) and p.id <> auth.uid()
     and public.gestor_do_setor(p.id, public.setor_do_modulo(new.module));
  if cardinality(v_gestores) = 0 then
    return null;
  end if;
  select coalesce(full_name, email) into v_quem from public.profiles where id = auth.uid();
  perform public.notify_ticket(new.id, 'ticket_updated', v_gestores,
    'Agendado com o prazo vencido — #' || new.ticket_number,
    coalesce(v_quem, 'Alguém') || ' agendou para ' || to_char(new.agendado_para at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
      || ' um chamado que já estava atrasado. O atraso continua contando. Motivo: ' || coalesce(new.agendado_motivo, '—'),
    false, auth.uid());
  return null;
end;
$$;
revoke all on function public.avisa_agendado_vencido() from public, anon, authenticated;
drop trigger if exists trg_avisa_agendado_vencido on public.tickets;
create trigger trg_avisa_agendado_vencido after update of status on public.tickets
  for each row execute function public.avisa_agendado_vencido();

-- Os de hoje: agendado depois de vencido volta a contar como atrasado (a agenda fica; o prazo não será empurrado).
update public.tickets
   set agendou_vencido = true, agendamentos = greatest(agendamentos, 1)
 where status = 'scheduled' and sla_due_at is not null and pendente_desde is not null and sla_due_at <= pendente_desde;
update public.tickets set agendamentos = 1 where status = 'scheduled' and agendamentos = 0;
