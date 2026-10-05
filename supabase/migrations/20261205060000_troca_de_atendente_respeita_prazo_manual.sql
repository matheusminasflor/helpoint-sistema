-- TROCAR O ATENDENTE NÃO APAGA PRAZO DEFINIDO À MÃO (revisão de 2026-10-05, eixo especificação).
--
-- `sla_segue_o_atendente` (20261205040000) recalculava o prazo pela política sempre que o atendente
-- mudava — e um prazo que alguém pôs à mão ("Mudar prioridade e prazo") voltava para o calculado. Na
-- abertura isso já era respeitado (`calculate_sla_due_at` não mexe em `sla_due_at` preenchido).
--
-- A regra agora: só recalcula se o prazo de antes É o que a conta daria com o atendente ANTERIOR
-- (mesma prioridade, setor, abertura e data pedida). Prazo diferente disso foi escolha de alguém e
-- fica. ponytail: se a política do setor mudou depois da abertura, o prazo antigo também deixa de
-- bater e fica como está — o mesmo que acontece hoje com chamado aberto quando a política muda
-- (nada recalcula). Saída, se um dia incomodar: marcar na linha `prazo_manual boolean`.
-- `create or replace` mantém a ACL (lição 14).
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
  -- O prazo de antes foi posto à mão? Então fica.
  if old.sla_due_at is distinct from public.prazo_padrao_do_chamado(
       old.tenant_id, old.module, old.priority::text, old.created_at, old.assigned_to, old.due_date) then
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
