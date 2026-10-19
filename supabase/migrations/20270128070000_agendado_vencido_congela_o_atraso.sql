-- AGENDADO COM O PRAZO VENCIDO CONGELA O ATRASO (dono, 2026-10-19, chamado #146). A Gislene abriu como Crítico (2 horas)
-- às 13h27; a Merilyn agendou às 16h27 para 21/10, e o atraso seguiu crescendo durante o agendamento inteiro. Proposta do
-- dono: "prazo venceu, pode agendar, porém quando agendar para de contar, assim não aumenta mais o vencimento, e volta
-- quando terminar o agendamento". Então, ao sair do Agendado, o prazo anda o tempo útil parado também para quem agendou
-- vencido: o atraso fica do tamanho que tinha ao agendar e volta a correr dali. Continua marcado (`agendou_vencido`) e
-- conta como fora do prazo — o atraso não se apaga (2026-10-15); só não cresce enquanto a data combinada não chega.
create or replace function public.chamado_pausa_em_pendente()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
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
      -- Toda pausa empurra o prazo, inclusive a de quem agendou vencido (2026-10-19): o atraso fica congelado.
      if new.sla_due_at is not distinct from old.sla_due_at and new.sla_due_at is not null then
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
$function$;
