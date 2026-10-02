-- CORREÇÕES DOS AVISOS DO CHAMADO E DO REGISTRO DE CORREÇÃO (revisão de 2026-10-02).
--
-- A revisão do código achou desvios do que o dono decidiu; ele mandou corrigir todos:
--   1. compra aprovada/reprovada gerava DOIS avisos ("chamado alterado" pelo banco e "compra
--      decidida" pela tela). Agora o banco diz o certo e a tela não insere mais;
--   2. (edge function check-alerts, fora daqui) o alerta de prazo de Expedição/Produção ia à TI;
--   3. a correção de lançamento feita pelo gestor no PRÓPRIO lançamento não ficava registrada;
--   4. o e-mail usa o texto do dono ("O chamado #1234 recebeu uma nova resposta.") — a fila
--      passa a entregar o tipo de cada aviso, e a edge function escreve a frase;
--   5. "transferido" quase nunca disparava: o botão Transferir troca o ATENDENTE, não o setor.
--      Trocar de um atendente para outro (quem troca não é o novo atendente) agora é
--      "transferido": o novo atendente recebe com e-mail, o solicitante sem;
--   6. os mencionados no chamado recebem todos os avisos, não só as respostas (quem pode ver;
--      "aguarda seu retorno" continua só do solicitante, é dele a vez);
--   7. a nota interna avisa o atendente e os mencionados — nunca o solicitante.

-- ─── Mencionados de um chamado ────────────────────────────────────────────────
create or replace function public.mencionados_do_chamado(p_ticket uuid)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct m.mentioned_user_id), '{}'::uuid[])
    from public.ticket_mentions m where m.ticket_id = p_ticket;
$$;
revoke all on function public.mencionados_do_chamado(uuid) from public, anon, authenticated;

-- ─── 7. Respondido: a nota interna também avisa (o lado de dentro) ────────────
create or replace function public.notify_on_ticket_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t record;
  v_author text;
  v_targets uuid[];
begin
  select id, tenant_id, ticket_number, requester_id, assigned_to, module into t
    from public.tickets where id = new.ticket_id;
  if t.id is null then
    return new;
  end if;
  select full_name into v_author from public.profiles where id = new.author_id;

  if coalesce(new.is_internal, false) then
    -- Nota interna: atendente e mencionados. O solicitante sai por `p_exclude`, mesmo que
    -- esteja mencionado — nota interna nunca chega a ele (decisão do dono).
    perform public.notify_ticket(
      t.id, 'ticket_reply',
      array_remove(array[t.assigned_to] || public.mencionados_do_chamado(t.id), new.author_id),
      'Chamado #' || t.ticket_number || ' recebeu uma nota interna.',
      coalesce(v_author, 'Alguém') || ': ' || left(new.content, 160),
      true, t.requester_id);
    return new;
  end if;

  if new.author_id = t.requester_id then
    v_targets := case when t.assigned_to is not null then array[t.assigned_to]
                      else public.equipe_do_chamado(t.tenant_id, t.module) end;
  else
    v_targets := array[t.requester_id, t.assigned_to];
  end if;

  perform public.notify_ticket(
    t.id, 'ticket_reply', v_targets || public.mencionados_do_chamado(t.id),
    'Chamado #' || t.ticket_number || ' foi respondido.',
    coalesce(v_author, 'Alguém') || ': ' || left(new.content, 160),
    true, new.author_id);
  return new;
end;
$$;

-- ─── 1, 5 e 6. As movimentações ───────────────────────────────────────────────
create or replace function public.notify_on_ticket_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n text := '#' || new.ticket_number;
  v_quem text;
  v_status text;
  v_menc uuid[] := public.mencionados_do_chamado(new.id);
begin
  v_status := case new.status::text
    when 'open' then 'Aberto' when 'in_progress' then 'Em andamento'
    when 'waiting_user' then 'Aguardando retorno' when 'waiting_parts' then 'Pendente'
    when 'resolved' then 'Resolvido' when 'closed' then 'Encerrado'
    when 'cancelled' then 'Cancelado' when 'rejected' then 'Reprovado' else new.status::text end;

  if new.status is distinct from old.status and new.status::text = 'closed' then
    perform public.notify_ticket(new.id, 'ticket_closed', array[new.requester_id, new.assigned_to] || v_menc,
      'Chamado ' || v_n || ' foi encerrado.', coalesce(new.title, ''), true);

  elsif new.status is distinct from old.status and new.status::text = 'resolved' then
    perform public.notify_ticket(new.id, 'ticket_resolved', array[new.requester_id, new.assigned_to] || v_menc,
      'Chamado ' || v_n || ' foi resolvido.',
      coalesce(nullif(btrim(new.resolution_notes), ''), coalesce(new.title, '')), true);

  elsif new.status is distinct from old.status and new.status::text = 'waiting_user' then
    -- É a vez do solicitante: só ele.
    perform public.notify_ticket(new.id, 'ticket_waiting', array[new.requester_id],
      'Chamado ' || v_n || ' aguarda seu retorno.', coalesce(new.title, ''), true);

  elsif new.module = 'compras' and new.status is distinct from old.status
        and new.status::text in ('in_progress', 'rejected')
        and new.assigned_to is not distinct from old.assigned_to then
    -- A compra decidida. Era a tela que avisava (`purchase_decided`), e o banco avisava de novo
    -- como "chamado alterado": dois avisos para a mesma decisão. Agora é um, daqui.
    perform public.notify_ticket(new.id, 'purchase_decided', array[new.requester_id, new.assigned_to] || v_menc,
      case new.status::text when 'rejected' then 'A compra do chamado ' || v_n || ' foi reprovada.'
                            else 'A compra do chamado ' || v_n || ' foi aprovada.' end,
      coalesce(nullif(btrim(new.resolution_notes), ''), coalesce(new.title, '')), false);

  elsif new.module is distinct from old.module then
    perform public.notify_ticket(new.id, 'ticket_transferred',
      array[new.requester_id] || v_menc
        || case when new.assigned_to is not null then array[new.assigned_to]
                else public.equipe_do_chamado(new.tenant_id, new.module) end,
      'Chamado ' || v_n || ' foi transferido para ' || public.nome_do_setor_do_chamado(new.module) || '.',
      coalesce(new.title, ''), false);

  elsif new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null
        and old.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
    -- Transferir de um atendente para outro (o botão Transferir). Quem assume para si não é
    -- transferência — cai no ramo de baixo.
    select full_name into v_quem from public.profiles where id = new.assigned_to;
    perform public.notify_ticket(new.id, 'ticket_transferred', array[new.assigned_to],
      'Chamado ' || v_n || ' foi transferido para você.', coalesce(new.title, ''), true);
    perform public.notify_ticket(new.id, 'ticket_transferred', array[new.requester_id] || v_menc,
      'Chamado ' || v_n || ' foi transferido para ' || coalesce(v_quem, 'outra pessoa') || '.',
      coalesce(new.title, ''), false, new.assigned_to);

  elsif new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    select full_name into v_quem from public.profiles where id = new.assigned_to;
    perform public.notify_ticket(new.id, 'ticket_assigned', array[new.assigned_to],
      'Chamado ' || v_n || ' foi atribuído a você.', coalesce(new.title, ''), true);
    perform public.notify_ticket(new.id, 'ticket_assigned', array[new.requester_id] || v_menc,
      'Chamado ' || v_n || ' agora é atendido por ' || coalesce(v_quem, 'outra pessoa') || '.',
      coalesce(new.title, ''), false, new.assigned_to);

  elsif new.status is distinct from old.status
     or new.priority is distinct from old.priority
     or new.due_date is distinct from old.due_date
     or new.title is distinct from old.title
     or new.asset_id is distinct from old.asset_id
     or new.category is distinct from old.category
     or new.assigned_to is distinct from old.assigned_to then
    perform public.notify_ticket(new.id, 'ticket_updated', array[new.requester_id, new.assigned_to] || v_menc,
      'Chamado ' || v_n || ' foi alterado.',
      concat_ws(' · ',
        case when new.status is distinct from old.status then 'status: ' || v_status end,
        case when new.priority is distinct from old.priority then 'prioridade: ' ||
          case new.priority::text when 'low' then 'Baixa' when 'medium' then 'Média' when 'high' then 'Alta'
                                  when 'critical' then 'Crítica' else new.priority::text end end,
        case when new.due_date is distinct from old.due_date then 'prazo alterado' end,
        case when new.title is distinct from old.title then 'título alterado' end,
        case when new.asset_id is distinct from old.asset_id then 'equipamento trocado' end,
        case when new.category is distinct from old.category then 'categoria alterada' end,
        case when new.assigned_to is distinct from old.assigned_to then 'sem atendente' end),
      false);
  end if;
  return null;
end;
$$;

-- ─── 4. A fila de e-mail entrega o tipo de cada aviso ─────────────────────────
-- O tipo de retorno muda: `drop` + `create`, e a ACL volta à mão (lição 14).
drop function if exists public.chamado_emails_pendentes(int, interval);
create function public.chamado_emails_pendentes(p_limit int default 50, p_idade interval default '1 minute')
returns table (user_id uuid, email text, nome text, ticket_id uuid, ticket_number int, ticket_title text,
               ids uuid[], titulos text[], tipos text[])
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.notifications n set email_sent = true
   where n.email_sent = false and n.reference_type = 'ticket'
     and (n.created_at < now() - interval '24 hours'
          or exists (select 1 from public.profiles p where p.id = n.user_id
                      and (not p.receber_email_chamados or p.email is null or not coalesce(p.is_active, true))));

  return query
  select n.user_id, p.email, p.full_name, t.id, t.ticket_number, t.title,
         array_agg(n.id order by n.created_at), array_agg(n.title order by n.created_at),
         array_agg(n.type::text order by n.created_at)
    from public.notifications n
    join public.profiles p on p.id = n.user_id
    join public.tickets t on t.id = n.reference_id
   where n.email_sent = false and n.reference_type = 'ticket'
   group by n.user_id, p.email, p.full_name, t.id, t.ticket_number, t.title
  having min(n.created_at) <= now() - p_idade
   order by min(n.created_at)
   limit p_limit;
end;
$$;
revoke all on function public.chamado_emails_pendentes(int, interval) from public, anon, authenticated;
grant execute on function public.chamado_emails_pendentes(int, interval) to service_role;

-- ─── 3. Correção do próprio lançamento também fica registrada ─────────────────
-- Antes só a mexida de OUTRA pessoa era registrada. Quem tem "Corrigir lançamento" passa por cima
-- da trava também no lançamento dele — e isso também é correção.
drop trigger if exists trg_com_interacoes_auditoria on public.com_interacoes;
create trigger trg_com_interacoes_auditoria
  after update or delete on public.com_interacoes
  for each row when (auth.uid() is distinct from old.vendedor_id or public.com_pode_corrigir_lancamento())
  execute function public.audit_trigger_fn();

create or replace function public.com_marca_auditoria()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_linha public.com_interacao_marcas := coalesce(new, old);
begin
  if auth.uid() is not null and pg_trigger_depth() = 1
     and (public.com_pode_corrigir_lancamento()
          or exists (select 1 from public.com_interacoes i
                      where i.id = v_linha.interacao_id and i.vendedor_id is distinct from auth.uid()))
     -- A marca que nasce junto com o lançamento não é correção.
     and v_linha.interacao_id::text is distinct from coalesce(current_setting('helpoint.lancamento_novo', true), '') then
    insert into public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_data, new_data)
    values (v_linha.tenant_id, auth.uid(), tg_op, 'com_interacao_marcas', v_linha.interacao_id,
            case when tg_op = 'DELETE' then to_jsonb(old) end,
            case when tg_op = 'INSERT' then to_jsonb(new) end);
  end if;
  return null;
end;
$$;
