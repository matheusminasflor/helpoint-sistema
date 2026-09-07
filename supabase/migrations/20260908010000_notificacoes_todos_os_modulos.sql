-- Notificações para todos os módulos — parte de banco da leva L0 (Fase 3).
--
-- O QUE ESTAVA QUEBRADO
-- ─────────────────────
-- 1. `check-alerts` insere `type = 'reminder'`, `'deadline_expired'` e
--    `'ticket_created'` em `notifications`, e nenhum dos três existe no enum
--    `notification_type`. O INSERT falha e a função descarta o erro: lembrete
--    de agenda, prazo estourado e chamado de renovação nunca chegaram ao sino.
-- 2. Três decisões não avisam quem pediu: férias/atestado decidido (RH),
--    compra aprovada/reprovada/concluída (Financeiro) e resposta de CLIENTE
--    no SAC (Qualidade). Os dois primeiros ganham produtor no front (mesma
--    leva); o terceiro nasce aqui, por trigger — o cliente escreve pelo
--    portal e não há hook de staff nesse caminho.
--
-- `ALTER TYPE ... ADD VALUE` não pode ser usado na mesma transação em que o
-- valor é criado. A função abaixo só referencia o valor em tempo de execução
-- (plpgsql), então criar tudo numa migration só é seguro. O que NÃO dá é
-- inserir uma linha com o valor novo aqui dentro — e não inserimos.

alter type public.notification_type add value if not exists 'reminder';
alter type public.notification_type add value if not exists 'deadline_expired';
alter type public.notification_type add value if not exists 'ticket_created';
alter type public.notification_type add value if not exists 'request_decided';
alter type public.notification_type add value if not exists 'purchase_decided';
alter type public.notification_type add value if not exists 'sac_customer_reply';

-- ───────────────────────────────────────────────────────────────────────────
-- SAC: resposta de cliente avisa o staff no sino.
--
-- Vai para o responsável do chamado. Sem responsável, para quem tem o módulo
-- Qualidade concedido — e, se ninguém tiver, para owner/admin, que veem tudo
-- de qualquer jeito. Comentário interno ou de staff não gera nada: para isso
-- já existe `trg_emit_sac_reply` (e-mail ao cliente, leva L1).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.notify_staff_on_sac_customer_reply()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ticket   record;
  v_targets  uuid[];
begin
  if new.author_type is distinct from 'customer' or coalesce(new.is_internal, false) then
    return new;
  end if;

  select id, tenant_id, ticket_number, subject, assigned_to
    into v_ticket
    from public.sac_tickets
   where id = new.ticket_id;

  if v_ticket.id is null then
    return new;
  end if;

  if v_ticket.assigned_to is not null then
    v_targets := array[v_ticket.assigned_to];
  else
    select coalesce(array_agg(distinct p.id), '{}')
      into v_targets
      from public.profiles p
      join public.user_module_access m on m.user_id = p.id and m.module = 'qualidade'
     where p.tenant_id = v_ticket.tenant_id;

    if coalesce(array_length(v_targets, 1), 0) = 0 then
      select coalesce(array_agg(distinct p.id), '{}')
        into v_targets
        from public.profiles p
        join public.user_roles r on r.user_id = p.id and r.role in ('owner', 'admin')
       where p.tenant_id = v_ticket.tenant_id;
    end if;
  end if;

  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select v_ticket.tenant_id,
         t,
         'sac_customer_reply'::public.notification_type,
         'sac_ticket',
         v_ticket.id,
         'Cliente respondeu — SAC #' || v_ticket.ticket_number,
         coalesce(new.author_name, 'O cliente') || ' respondeu em "' || coalesce(v_ticket.subject, 'chamado') || '".'
    from unnest(v_targets) as t;

  return new;
end;
$$;

drop trigger if exists trg_notify_staff_on_sac_customer_reply on public.sac_ticket_comments;

create trigger trg_notify_staff_on_sac_customer_reply
  after insert on public.sac_ticket_comments
  for each row
  execute function public.notify_staff_on_sac_customer_reply();

-- Nota para quem revisa: `reference_type = 'sac_ticket'` é novo. O sino hoje
-- roteia `ticket` para `/helpdesk/:id`; `sac_ticket` precisa de uma entrada em
-- `TYPE_ROUTES` do NotificationBell apontando para `/qualidade/sacs/:id`
-- (leva L0, parte de código — o executor recebe isto no relatório).
