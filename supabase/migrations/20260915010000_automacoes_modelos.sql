-- Leva CRM-1d: modelos de fluxo prontos. 2026-09-12.
-- Base: docs/proposta-fluxo-comercial.md (bloco F e seção 6.1) e ADR-008.
--
-- O motor (20260912010000) ganha seis coisas pequenas; o resto dos modelos é
-- só configuração de fluxo, montada pelo front (src/lib/automation-templates.ts):
--   automation_subject_row(tipo, id)  a linha atual de um registro, em jsonb
--   passo com refresh = true          lê o registro de novo antes de decidir (depois de uma espera)
--   automation_enrich_payload         o gatilho de pedido/negócio leva o contato (e os itens) junto —
--                                     é a "ficha pronta" do chamado de cadastro
--   create_ticket.requester_target    quem abre o chamado pode ser quem criou o pedido (o vendedor)
--   set_stage.lost_reason             mover para "perdido" com o motivo
--   passo create_receivable           conta a receber no Financeiro a partir do pedido
--
-- automation_validate_flow e automation_run_step são copiadas do arquivo
-- original por scripts/gen-migration-modelos.mjs, com as mudanças acima em
-- pontos nomeados. Não edite este arquivo à mão: mude o script e gere de novo.

-- A linha atual de um registro (para o refresh).
create or replace function public.automation_subject_row(p_type text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  case p_type
    when 'ticket'      then select to_jsonb(t) into v from public.tickets t where t.id = p_id;
    when 'crm_deal'    then select to_jsonb(d) into v from public.crm_deals d where d.id = p_id;
    when 'crm_contact' then select to_jsonb(c) into v from public.crm_contacts c where c.id = p_id;
    when 'crm_order'   then select to_jsonb(o) into v from public.crm_orders o where o.id = p_id;
    else v := null;
  end case;
  return v;
end;
$$;

-- O que vai junto no contexto do gatilho: o contato (pedido e negócio), o
-- negócio e os itens (pedido). Os textos dos passos usam {{trigger.contact.name}},
-- {{trigger.items_text}} etc.
create or replace function public.automation_enrich_payload(p_entity text, p_after jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contact uuid;
  v_out     jsonb := '{}'::jsonb;
begin
  if p_entity not in ('crm_order', 'crm_deal') then return v_out; end if;
  v_contact := nullif(p_after->>'contact_id', '')::uuid;
  if v_contact is not null then
    select jsonb_build_object('contact', to_jsonb(c) || jsonb_build_object(
             'segment', (select s.name from public.crm_segments s where s.id = c.segment_id)))
      into v_out from public.crm_contacts c where c.id = v_contact;
    v_out := coalesce(v_out, '{}'::jsonb);
  end if;
  if p_entity = 'crm_order' then
    v_out := v_out || jsonb_build_object(
      'deal', (select jsonb_build_object('id', d.id, 'title', d.title, 'owner_id', d.owner_id) from public.crm_deals d where d.id = nullif(p_after->>'deal_id', '')::uuid),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity, 'unit_price', i.unit_price, 'total', i.total) order by i.position), '[]'::jsonb)
                  from public.crm_order_items i where i.order_id = (p_after->>'id')::uuid),
      'items_text', (select coalesce(string_agg(rtrim(rtrim(i.quantity::text, '0'), '.') || ' × ' || i.description || ' — R$ ' || public.fmt_brl(i.total), E'\n' order by i.position), '')
                       from public.crm_order_items i where i.order_id = (p_after->>'id')::uuid),
      'total_text', public.fmt_brl((p_after->>'total')::numeric));
  end if;
  return v_out;
end;
$$;
-- Internas do motor: só quem executa o motor (postgres/service_role) as chama.
-- Definer aberta a anon leria contato de qualquer empresa (auditoria 2026-09-12).
revoke all on function public.automation_subject_row(text, uuid) from public, anon, authenticated;
revoke all on function public.automation_enrich_payload(text, jsonb) from public, anon, authenticated;

-- Um fluxo de um módulo pode observar os chamados de OUTRO módulo dizendo
-- `trigger.ticket_module` (o modelo "cadastro concluído → cobrar" vive no
-- Comercial e olha o chamado que nasceu na TI). Sem isso, só o próprio módulo.
create or replace function public.automation_enqueue(p_tenant uuid, p_module text, p_entity text, p_event text, p_payload jsonb, p_subject uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  w       public.automation_workflows;
  v_ctx   jsonb;
  v_run   uuid;
  v_extra jsonb;
  n       int := 0;
begin
  for w in
    select * from public.automation_workflows
     where tenant_id = p_tenant and status = 'active'
       and trigger->>'kind' = p_event and trigger->>'entity' = p_entity
       and (module = p_module or (p_entity = 'ticket' and trigger->>'ticket_module' = p_module))
     order by created_at
  loop
    if p_event = 'record_updated' and jsonb_typeof(w.trigger->'fields') = 'array' and jsonb_array_length(w.trigger->'fields') > 0
       and not exists (select 1 from jsonb_array_elements_text(w.trigger->'fields') f
                        where f in (select jsonb_array_elements_text(coalesce(p_payload->'updated_fields', '[]'::jsonb)))) then
      continue;
    end if;
    -- O contexto extra (contato, itens) só é montado se algum fluxo chegou até aqui.
    if v_extra is null then
      v_extra := public.automation_enrich_payload(p_entity, p_payload->'after');
    end if;
    v_ctx := jsonb_build_object(
      'trigger', p_payload || v_extra || jsonb_build_object('kind', p_event, 'entity', p_entity),
      'subject', jsonb_build_object('type', p_entity, 'id', p_subject));
    if not public.automation_filter_matches(w.trigger->'filter', v_ctx) then
      continue;
    end if;
    v_run := public.automation_start_run(w, p_event, p_entity, p_subject, v_ctx);
    perform public.automation_advance(v_run);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- automation_validate_flow — cópia de 20260912010000 + o passo create_receivable
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automation_validate_flow(p_trigger jsonb, p_steps jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_kind    text := p_trigger->>'kind';
  v_entity  text := p_trigger->>'entity';
  v_ids     text[] := '{}';
  s         jsonb;
  n         text;
  v_remaining text[];
  v_removed   boolean;
  k_step    text;
begin
  if jsonb_typeof(p_trigger) <> 'object' then raise exception 'gatilho precisa ser um objeto'; end if;
  if v_kind is null or v_kind not in ('record_created', 'record_updated', 'deadline_expired', 'schedule', 'webhook', 'manual') then
    raise exception 'gatilho desconhecido: %', coalesce(v_kind, '(vazio)');
  end if;
  if v_kind in ('record_created', 'record_updated', 'deadline_expired', 'manual')
     and (v_entity is null or v_entity not in ('ticket', 'crm_deal', 'crm_contact', 'crm_order')) then
    raise exception 'gatilho "%" precisa de um cadastro (ticket, crm_deal, crm_contact, crm_order)', v_kind;
  end if;
  if v_kind = 'deadline_expired' and v_entity <> 'ticket' then
    raise exception 'prazo estourado só vale para chamado';
  end if;
  if v_kind = 'schedule' then
    if p_trigger->>'every' not in ('day', 'week') then raise exception 'agenda precisa de every = day|week'; end if;
    if (p_trigger->>'time') !~ '^\d{2}:\d{2}$' then raise exception 'agenda precisa de time HH:MM'; end if;
    if p_trigger->>'every' = 'week' and coalesce((p_trigger->>'weekday')::int, 0) not between 1 and 7 then
      raise exception 'agenda semanal precisa de weekday 1..7';
    end if;
  end if;
  if jsonb_typeof(p_steps) <> 'array' then raise exception 'passos precisam ser uma lista'; end if;

  for s in select * from jsonb_array_elements(p_steps) loop
    if jsonb_typeof(s) <> 'object' or coalesce(s->>'id', '') = '' then raise exception 'passo sem id'; end if;
    if s->>'id' = any(v_ids) then raise exception 'id de passo repetido: %', s->>'id'; end if;
    v_ids := v_ids || (s->>'id');
    if s->>'kind' is null or s->>'kind' not in (
      'notify', 'create_task', 'create_ticket', 'assign', 'set_priority', 'set_stage', 'update_record',
      'create_deal', 'add_note', 'create_calendar_event', 'condition', 'delay', 'stop', 'branch',
      'send_email', 'http_request', 'ai_text', 'create_receivable') then
      raise exception 'tipo de passo desconhecido: %', coalesce(s->>'kind', '(vazio)');
    end if;
    if s ? 'next' and jsonb_typeof(s->'next') <> 'array' then raise exception 'next do passo % precisa ser lista', s->>'id'; end if;
  end loop;

  -- todo `next` (do gatilho, dos passos e dos ramos) aponta para um passo existente
  for n in select jsonb_array_elements_text(coalesce(p_trigger->'next', '[]'::jsonb)) loop
    if not (n = any(v_ids)) then raise exception 'o gatilho aponta para passo inexistente: %', n; end if;
  end loop;
  for s in select * from jsonb_array_elements(p_steps) loop
    for n in select jsonb_array_elements_text(coalesce(s->'next', '[]'::jsonb)) loop
      if not (n = any(v_ids)) then raise exception 'o passo % aponta para passo inexistente: %', s->>'id', n; end if;
    end loop;
    if s->>'kind' = 'branch' then
      for n in
        select jsonb_array_elements_text(coalesce(b->'next', '[]'::jsonb))
          from jsonb_array_elements(coalesce(s->'config'->'branches', '[]'::jsonb)) b
        union all
        select jsonb_array_elements_text(coalesce(s->'config'->'else_next', '[]'::jsonb))
      loop
        if not (n = any(v_ids)) then raise exception 'o ramo do passo % aponta para passo inexistente: %', s->>'id', n; end if;
      end loop;
    end if;
  end loop;

  -- sem ciclo: remove repetidamente quem não tem aresta chegando de quem ainda resta
  v_remaining := v_ids;
  loop
    v_removed := false;
    foreach k_step in array v_remaining loop
      if not exists (
        select 1
          from jsonb_array_elements(p_steps) s2
         where (s2->>'id') = any(v_remaining)
           and (
             k_step in (select jsonb_array_elements_text(coalesce(s2->'next', '[]'::jsonb)))
             or k_step in (select jsonb_array_elements_text(coalesce(b->'next', '[]'::jsonb))
                             from jsonb_array_elements(coalesce(s2->'config'->'branches', '[]'::jsonb)) b)
             or k_step in (select jsonb_array_elements_text(coalesce(s2->'config'->'else_next', '[]'::jsonb)))
           )
      ) then
        v_remaining := array_remove(v_remaining, k_step);
        v_removed := true;
      end if;
    end loop;
    exit when not v_removed or cardinality(v_remaining) = 0;
  end loop;
  if cardinality(v_remaining) > 0 then
    raise exception 'o fluxo tem um ciclo entre os passos %', array_to_string(v_remaining, ', ');
  end if;
  return true;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- automation_run_step — cópia de 20260912010000 + refresh, requester_target,
-- lost_reason e create_receivable
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.automation_run_step(r public.automation_runs, p_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg       jsonb := coalesce(p_step->'config', '{}'::jsonb);
  ctx       jsonb := r.context;
  w         public.automation_workflows;
  v_entity  text := r.subject_type;
  v_user    uuid;
  v_targets uuid[];
  v_id      uuid;
  v_title   text;
  v_text    text;
  v_ref_type text;
  v_ref_id   uuid;
  k         text;
  v         jsonb;
  v_allowed text[];
  v_set     text := '';
  v_deal    public.crm_deals;
begin
  select * into w from public.automation_workflows where id = r.workflow_id;

  -- refresh: depois de uma espera, o registro pode ter mudado. O passo pede
  -- para olhar de novo e a condição/ramo decide pelo estado atual, não pelo
  -- do disparo (CRM-1d, modelo "sem resposta 24/48 h").
  if coalesce(cfg->>'refresh', 'false') = 'true' and r.subject_id is not null then
    ctx := jsonb_set(ctx, '{trigger,after}', coalesce(public.automation_subject_row(r.subject_type, r.subject_id), ctx #> '{trigger,after}'), true);
  end if;
  v_ref_type := case v_entity when 'ticket' then 'ticket' when 'crm_deal' then 'crm_deal'
                                when 'crm_order' then case when nullif(ctx #>> '{trigger,deal,id}', '') is not null then 'crm_deal' else 'automation_workflow' end
                                else 'automation_workflow' end;
  v_ref_id := case v_ref_type when 'automation_workflow' then r.workflow_id
                              when 'crm_deal' then coalesce(nullif(ctx #>> '{trigger,deal,id}', '')::uuid, r.subject_id)
                              else r.subject_id end;

  case p_step->>'kind'

  when 'notify' then
    if cfg ? 'team_module' then
      v_targets := public.notification_team(r.tenant_id, cfg->>'team_module');
    else
      v_user := public.automation_target_user(cfg, ctx);
      if v_user is null then raise exception 'a acao "avisar" precisa de uma pessoa ou de uma equipe'; end if;
      v_targets := array[v_user];
    end if;
    perform public.notify_users(
      r.tenant_id, v_targets, 'automation', v_ref_type, v_ref_id,
      coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), 'Automação: ' || w.name),
      coalesce(public.automation_render(cfg->>'message', ctx), ''));
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('notified', to_jsonb(v_targets)));

  when 'create_task' then
    v_user := coalesce(public.automation_target_user(cfg, ctx),
                       nullif(ctx #>> '{trigger,after,assigned_to}', '')::uuid,
                       nullif(ctx #>> '{trigger,after,owner_id}', '')::uuid,
                       w.created_by);
    if v_user is null then raise exception 'a acao "criar tarefa" precisa de uma pessoa'; end if;
    insert into public.tasks (tenant_id, user_id, title, description, priority, due_date, source_type, source_id)
    values (r.tenant_id, v_user,
            coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
            public.automation_render(cfg->>'description', ctx),
            coalesce((cfg->>'priority')::int, 3),
            case when cfg ? 'due_in_days' then now() + make_interval(days => (cfg->>'due_in_days')::int) end,
            'automation', w.id)
    returning id into v_id;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('task_id', v_id));

  when 'create_ticket' then
    insert into public.tickets (tenant_id, module, title, description, priority, status, category_id, requester_id, created_by, assigned_to)
    values (r.tenant_id,
            coalesce(nullif(cfg->>'module', ''), w.module),
            coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
            coalesce(nullif(public.automation_render(cfg->>'description', ctx), ''), 'Aberto pela automação "' || w.name || '".'),
            coalesce((cfg->>'priority')::public.ticket_priority, 'medium'),
            'open',
            nullif(cfg->>'category_id', '')::uuid,
            coalesce(public.automation_target_user(jsonb_build_object('target', cfg->>'requester_target'), ctx),
                     nullif(ctx #>> '{trigger,after,requester_id}', '')::uuid, w.created_by),
            w.created_by,
            nullif(cfg->>'assigned_to', '')::uuid)
    returning id into v_id;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('ticket_id', v_id));

  when 'assign' then
    v_user := public.automation_target_user(cfg, ctx);
    if v_user is null then raise exception 'a acao "atribuir" precisa de uma pessoa'; end if;
    if v_entity = 'ticket' then
      update public.tickets set assigned_to = v_user where id = r.subject_id;
      insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
      values (r.tenant_id, r.subject_id, coalesce(w.created_by, v_user), 'Atribuído automaticamente pelo fluxo "' || w.name || '".', true);
      perform public.notify_users(r.tenant_id, array[v_user], 'ticket_assigned', 'ticket', r.subject_id,
        'Chamado #' || coalesce(ctx #>> '{trigger,after,ticket_number}', '?') || ' atribuído a você',
        'Pelo fluxo "' || w.name || '": "' || coalesce(ctx #>> '{trigger,after,title}', '') || '"');
    elsif v_entity = 'crm_deal' then
      update public.crm_deals set owner_id = v_user where id = r.subject_id;
      insert into public.crm_deal_activities (tenant_id, deal_id, author_id, kind, content)
      values (r.tenant_id, r.subject_id, null, 'system', 'Dono definido pelo fluxo "' || w.name || '".');
    elsif v_entity = 'crm_contact' then
      update public.crm_contacts set owner_id = v_user where id = r.subject_id;
    else
      raise exception 'a acao "atribuir" nao vale para %', v_entity;
    end if;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('user_id', v_user));

  when 'set_priority' then
    if v_entity <> 'ticket' then raise exception 'a acao "mudar prioridade" exige um chamado'; end if;
    if nullif(cfg->>'priority', '') is null then raise exception 'a acao "mudar prioridade" precisa da prioridade'; end if;
    update public.tickets set priority = (cfg->>'priority')::public.ticket_priority where id = r.subject_id;
    insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
    values (r.tenant_id, r.subject_id, coalesce(w.created_by, nullif(ctx #>> '{trigger,after,requester_id}', '')::uuid),
            'Prioridade alterada para ' || (cfg->>'priority') || ' pelo fluxo "' || w.name || '".', true);
    return jsonb_build_object('status', 'success');

  when 'set_stage' then
    if v_entity <> 'crm_deal' then raise exception 'a acao "mudar etapa" exige um negocio'; end if;
    if nullif(cfg->>'stage_id', '') is null then raise exception 'a acao "mudar etapa" precisa da etapa'; end if;
    update public.crm_deals set stage_id = (cfg->>'stage_id')::uuid, lost_reason = coalesce(nullif(cfg->>'lost_reason', ''), lost_reason)
     where id = r.subject_id and tenant_id = r.tenant_id;
    return jsonb_build_object('status', 'success');

  when 'update_record' then
    -- {fields: {coluna: valor}}; só colunas da lista; "custom.chave" entra no jsonb `custom`.
    v_allowed := case v_entity
      when 'ticket'      then array['status', 'priority', 'assigned_to', 'category_id', 'due_date', 'title']
      when 'crm_deal'    then array['title', 'value', 'owner_id', 'expected_close_date', 'stage_id', 'lost_reason']
      when 'crm_contact' then array['owner_id', 'notes', 'company', 'city', 'state']
      when 'crm_order'   then array['status']
      else '{}'::text[] end;
    for k, v in select * from jsonb_each(coalesce(cfg->'fields', '{}'::jsonb)) loop
      if k like 'custom.%' and v_entity in ('crm_deal', 'crm_contact') then
        execute format('update public.%I set custom = jsonb_set(custom, %L, %L::jsonb) where id = $1',
                       case v_entity when 'crm_deal' then 'crm_deals' else 'crm_contacts' end,
                       array[substr(k, 8)], v::text) using r.subject_id;
      elsif k = any(v_allowed) then
        v_text := case when jsonb_typeof(v) = 'string' then public.automation_render(v #>> '{}', ctx) else v #>> '{}' end;
        execute format('update public.%I set %I = %L where id = $1',
                       case v_entity when 'ticket' then 'tickets' when 'crm_deal' then 'crm_deals' when 'crm_contact' then 'crm_contacts' else 'crm_orders' end,
                       k, v_text) using r.subject_id;
      else
        raise exception 'a acao "atualizar" nao pode mudar "%" em %', k, v_entity;
      end if;
    end loop;
    return jsonb_build_object('status', 'success');

  when 'create_deal' then
    v_id := coalesce(nullif(cfg->>'contact_id', '')::uuid,
                     case v_entity when 'crm_contact' then r.subject_id when 'crm_deal' then nullif(ctx #>> '{trigger,after,contact_id}', '')::uuid end);
    if v_id is null then raise exception 'a acao "criar negocio" precisa de um contato'; end if;
    insert into public.crm_deals (tenant_id, contact_id, stage_id, title, value, owner_id, source)
    select r.tenant_id, v_id,
           coalesce(nullif(cfg->>'stage_id', '')::uuid,
                    (select s.id from public.crm_pipeline_stages s join public.crm_pipelines p on p.id = s.pipeline_id
                      where p.tenant_id = r.tenant_id and p.is_default and s.kind = 'open' order by s.position limit 1)),
           coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
           coalesce((cfg->>'value')::numeric, 0),
           coalesce(public.automation_target_user(cfg, ctx), (select owner_id from public.crm_contacts where id = v_id)),
           'outro'
    returning id into v_id;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('deal_id', v_id));

  when 'add_note' then
    v_text := coalesce(nullif(public.automation_render(cfg->>'content', ctx), ''), 'Fluxo "' || w.name || '"');
    if v_entity = 'crm_deal' then
      insert into public.crm_deal_activities (tenant_id, deal_id, author_id, kind, content) values (r.tenant_id, r.subject_id, null, 'note', v_text);
    elsif v_entity = 'ticket' then
      insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
      values (r.tenant_id, r.subject_id, coalesce(w.created_by, nullif(ctx #>> '{trigger,after,requester_id}', '')::uuid), v_text, true);
    else
      raise exception 'a acao "anotar" nao vale para %', v_entity;
    end if;
    return jsonb_build_object('status', 'success');

  when 'create_calendar_event' then
    v_user := coalesce(public.automation_target_user(cfg, ctx), w.created_by);
    if v_user is null then raise exception 'a acao "agendar" precisa de uma pessoa'; end if;
    insert into public.calendar_events (tenant_id, user_id, title, description, start_at, end_at, event_type, source_type, source_id)
    values (r.tenant_id, v_user,
            coalesce(nullif(public.automation_render(cfg->>'title', ctx), ''), w.name),
            public.automation_render(cfg->>'description', ctx),
            now() + make_interval(days => coalesce((cfg->>'in_days')::int, 1)),
            now() + make_interval(days => coalesce((cfg->>'in_days')::int, 1)) + interval '1 hour',
            'event', 'automation', w.id)
    returning id into v_id;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('event_id', v_id));

  when 'condition' then
    if public.automation_filter_matches(cfg->'filter', ctx) then
      return jsonb_build_object('status', 'success', 'result', jsonb_build_object('matched', true));
    end if;
    return jsonb_build_object('status', 'stop', 'result', jsonb_build_object('matched', false));

  when 'delay' then
    if cfg ? 'until_path' then
      v_text := ctx #>> string_to_array(cfg->>'until_path', '.');
      if v_text is null then raise exception 'a espera "ate a data" nao achou a data em %', cfg->>'until_path'; end if;
      return jsonb_build_object('status', 'waiting', 'resume_at', (v_text::timestamptz));
    end if;
    return jsonb_build_object('status', 'waiting',
      'resume_at', now() + make_interval(mins => coalesce((cfg->>'minutes')::int, 0), hours => coalesce((cfg->>'hours')::int, 0), days => coalesce((cfg->>'days')::int, 0)));

  when 'stop' then
    return jsonb_build_object('status', 'stop');

  when 'branch' then
    -- A3: escolhe o primeiro ramo cujo filtro casa; o executor lê `result.next`.
    for v in select * from jsonb_array_elements(coalesce(cfg->'branches', '[]'::jsonb)) loop
      if public.automation_filter_matches(v->'filter', ctx) then
        return jsonb_build_object('status', 'success', 'result', jsonb_build_object('branch', v->>'name', 'next', coalesce(v->'next', '[]'::jsonb)));
      end if;
    end loop;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('branch', 'else', 'next', coalesce(cfg->'else_next', '[]'::jsonb)));

  when 'create_receivable' then
    -- Conta a receber no Financeiro a partir do pedido (CRM-1d, decisão 6 da
    -- proposta): quem usa só o Helpoint cobra por aqui; quem tem ERP desliga o passo.
    if v_entity <> 'crm_order' then raise exception 'a acao "criar conta a receber" exige um pedido'; end if;
    insert into public.fin_entries (tenant_id, kind, description, counterparty, document_number, amount, due_date, competence, status, source, notes, created_by)
    values (r.tenant_id, 'receivable',
            coalesce(nullif(public.automation_render(cfg->>'description', ctx), ''),
                     'Pedido #' || coalesce(ctx #>> '{trigger,after,number}', '?') || ' — ' || coalesce(ctx #>> '{trigger,contact,name}', '')),
            ctx #>> '{trigger,contact,name}',
            ctx #>> '{trigger,after,number}',
            coalesce((ctx #>> '{trigger,after,total}')::numeric, 0),
            (now() at time zone 'America/Sao_Paulo')::date + coalesce((cfg->>'due_in_days')::int, 7),
            (now() at time zone 'America/Sao_Paulo')::date, 'pending', 'automation',
            'Criada pelo fluxo "' || w.name || '".', w.created_by)
    returning id into v_id;
    return jsonb_build_object('status', 'success', 'result', jsonb_build_object('entry_id', v_id));

  when 'send_email', 'http_request', 'ai_text' then
    -- Passo externo: quem executa é a edge function automation-worker (leva A2), pelo tick.
    return jsonb_build_object('status', 'waiting', 'pending_kind', p_step->>'kind');

  else
    raise exception 'tipo de passo desconhecido: %', p_step->>'kind';
  end case;
end;
$$;
