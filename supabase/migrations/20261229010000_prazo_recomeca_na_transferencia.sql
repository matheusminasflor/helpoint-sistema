-- O PRAZO RECOMEÇA NA TRANSFERÊNCIA (dono, 2026-10-13; troca a decisão de 2026-10-06, "contando desde a
-- abertura"). Caso: o #27 nasceu na TI, foi passado para a Mel, e chegou a ela quase vencido — venceu na
-- manhã seguinte. Decisão (múltipla escolha, a recomendada): quem recebe ganha o prazo cheio da urgência a
-- partir da transferência, no expediente dela.
--
-- Transferência = o chamado sai de UMA PESSOA para OUTRA (ou muda de setor). Pegar da fila (sem atendente →
-- alguém) não recomeça: aí o prazo continua o da abertura, como sempre.
--
-- `prazo_desde` guarda de quando o prazo conta (a abertura, ou a última transferência) e
-- `pausado_antes_do_recomeco` quanto já tinha ficado pausado até lá — para a regra "prazo posto à mão fica"
-- reconhecer o prazo recomeçado como o padrão, e não como manual, numa segunda transferência.
-- A saída de "Pendente" estende o prazo que existe (`chamado_pausa_em_pendente`), então não desfaz o recomeço.

alter table public.tickets
  add column if not exists prazo_desde timestamptz,
  add column if not exists pausado_antes_do_recomeco integer not null default 0;

create or replace function public.sla_segue_o_atendente()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_prazo timestamptz;
  v_transferiu boolean := (old.assigned_to is not null and new.assigned_to is distinct from old.assigned_to)
                          or new.module is distinct from old.module;
begin
  if (new.assigned_to is not distinct from old.assigned_to and new.module is not distinct from old.module)
     or new.status::text in ('resolved', 'closed', 'cancelled', 'rejected') then
    return new;
  end if;

  if new.first_response_at is null
     and new.first_response_due_at is not distinct from old.first_response_due_at then
    new.first_response_due_at := coalesce(
      public.prazo_da_primeira_resposta(new.tenant_id, new.module, new.priority::text, new.created_at, new.assigned_to),
      new.first_response_due_at);
  end if;

  if old.sla_due_at is null or new.sla_due_at is distinct from old.sla_due_at then
    return new;
  end if;
  -- O prazo de antes foi posto à mão? Então fica. (O padrão conta de `prazo_desde`, a abertura ou a
  -- última transferência, com as pausas que vieram depois dela.)
  if old.sla_due_at is distinct from public.prazo_padrao_com_pausa(
       old.tenant_id, old.module, old.priority::text, coalesce(old.prazo_desde, old.created_at), old.assigned_to,
       old.due_date, old.minutos_pausados - old.pausado_antes_do_recomeco) then
    return new;
  end if;

  if v_transferiu then
    -- Recomeça agora, com o prazo cheio, no expediente de quem recebe. Transferido parado (Pendente,
    -- Agendado…): a pausa até aqui fica contada e recomeça agora, para não esticar o prazo novo depois.
    if new.pendente_desde is not null then
      new.minutos_pausados := new.minutos_pausados + coalesce(public.minutos_uteis_do_chamado(
        new.tenant_id, old.module, new.pendente_desde, now(), old.assigned_to), 0);
      new.pendente_desde := now();
    end if;
    new.prazo_desde := now();
    new.pausado_antes_do_recomeco := new.minutos_pausados;
    v_prazo := public.prazo_padrao_do_chamado(new.tenant_id, new.module, new.priority::text, now(),
                                              new.assigned_to, new.due_date);
  else
    v_prazo := public.prazo_padrao_com_pausa(new.tenant_id, new.module, new.priority::text,
                                             coalesce(new.prazo_desde, new.created_at), new.assigned_to,
                                             new.due_date, new.minutos_pausados - new.pausado_antes_do_recomeco);
  end if;
  if v_prazo is not null then
    new.sla_due_at := v_prazo;
  end if;
  return new;
end;
$$;
