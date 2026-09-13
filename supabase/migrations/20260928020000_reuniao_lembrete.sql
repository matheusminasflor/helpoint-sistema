-- CRM-3b, correção da auditoria: a reunião nasce com lembrete. 2026-09-13.
--
-- A agenda tem lembrete desde sempre (`calendar_events.reminder_offsets`, em
-- minutos antes), e a reunião nascia sem nenhum: o vendedor marcava e não era
-- avisado na hora. Agora vem com um dia antes e quinze minutos antes — o
-- primeiro para organizar o dia, o segundo para não perder a hora. Quem quiser
-- outro troca na Agenda, que é onde lembrete se edita.
create or replace function public.crm_agendar_reuniao(
  p_deal     uuid,
  p_titulo   text,
  p_inicio   timestamptz,
  p_minutos  integer default 60,
  p_notas    text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant  uuid;
  v_contato text;
  v_evento  uuid;
  v_min     integer := greatest(coalesce(p_minutos, 60), 5);
begin
  -- Sem isto, chamada fora de sessão morreria num NOT NULL cru da agenda.
  if auth.uid() is null then
    raise exception 'a reunião é marcada por alguém: entre no sistema' using errcode = '42501';
  end if;
  if p_inicio is null then
    raise exception 'a reunião precisa de data e hora' using errcode = '22023';
  end if;
  if coalesce(trim(p_titulo), '') = '' then
    raise exception 'a reunião precisa de um título' using errcode = '22023';
  end if;

  -- Passa pela RLS: negócio que o vendedor não enxerga não vira reunião.
  select d.tenant_id, c.name into v_tenant, v_contato
    from public.crm_deals d
    left join public.crm_contacts c on c.id = d.contact_id
   where d.id = p_deal;
  if v_tenant is null then
    raise exception 'negócio não encontrado' using errcode = 'P0002';
  end if;

  insert into public.calendar_events
    (tenant_id, user_id, title, description, start_at, end_at, event_type,
     source_type, source_id, color, reminder_offsets)
  values
    (v_tenant, auth.uid(), trim(p_titulo), nullif(trim(p_notas), ''),
     p_inicio, p_inicio + make_interval(mins => v_min),
     'meeting', 'crm_deal', p_deal, '#0ea5e9', array[1440, 15])
  returning id into v_evento;

  insert into public.crm_deal_activities (tenant_id, deal_id, author_id, kind, content, meta)
  values (v_tenant, p_deal, auth.uid(), 'meeting',
          'Reunião marcada para ' || to_char(p_inicio at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
            || ' (' || v_min || ' min)' || case when v_contato is null then '' else ' com ' || v_contato end,
          jsonb_build_object('event_id', v_evento, 'start_at', p_inicio, 'minutes', v_min));

  return v_evento;
end;
$$;
revoke execute on function public.crm_agendar_reuniao(uuid, text, timestamptz, integer, text) from public, anon;
grant execute on function public.crm_agendar_reuniao(uuid, text, timestamptz, integer, text) to authenticated;
