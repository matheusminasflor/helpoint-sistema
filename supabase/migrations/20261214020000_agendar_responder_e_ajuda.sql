-- AGENDAR, OS DOIS BOTÕES DE RESPOSTA E A AJUDA A OUTROS SETORES (decisões do dono, 2026-10-07;
-- memória `agendar-performance-cashback-tela`).
--
-- 1. AGENDADO: quem tem "Mudar prioridade e prazo" marca data/hora + motivo; o prazo PAUSA até lá
--    (a mesma pausa de Pendente, generalizada para "status que pausa"); na hora marcada o chamado
--    volta sozinho para Em andamento (job de 5 em 5 minutos) e o prazo segue de onde parou. O
--    solicitante é avisado. Agendado não gera aviso de vencido.
-- 2. RESPONDER: a caixinha "Continuo trabalhando nele" vira dois botões. `mantem_status = true` é o
--    botão "Responder": o chamado fica (ou volta) Em andamento — inclusive se estava Pendente ou
--    Agendado. Antes a caixinha só "não mudava nada": num chamado Pendente ele CONTINUAVA Pendente
--    (com o prazo pausado), e num Aberto já atribuído continuava Aberto. `mantem_status = false` é
--    "Responder e aguardar retorno" (Pendente, pausa, avisa) — o caminho de antes.
-- 3. AJUDA A OUTROS SETORES: o que alguém atende fora dos próprios setores não pesa na performance
--    dela e aparece à parte, também nos Indicadores do setor dela.

-- ─── 1a. As colunas ───────────────────────────────────────────────────────────────────────────
alter table public.tickets
  add column if not exists agendado_para timestamptz,
  add column if not exists agendado_motivo text,
  add column if not exists minutos_agendados integer not null default 0;

comment on column public.tickets.agendado_para is
  'Quando o atendente vai tratar o chamado (status Agendado). O prazo fica pausado até lá; o job volta para Em andamento.';
comment on column public.tickets.minutos_agendados is
  'Minutos ÚTEIS que o chamado passou Agendado (parte de minutos_pausados) — para os Indicadores.';

alter table public.tickets drop constraint if exists tickets_agendado_tem_data;
alter table public.tickets add constraint tickets_agendado_tem_data
  check (status <> 'scheduled' or agendado_para is not null);

-- ─── 1b. A pausa vale para Pendente E Agendado ────────────────────────────────────────────────
-- Toda troca de status que SAI de um status que pausa fecha o trecho parado: soma os minutos úteis
-- em `minutos_pausados` (e em `minutos_agendados`, se era Agendado) e empurra o prazo. Se a troca
-- ENTRA num status que pausa (inclusive de Pendente para Agendado), abre um trecho novo.
-- Mesma assinatura (create or replace mantém a ACL).
create or replace function public.chamado_pausa_em_pendente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if old.status::text in ('waiting_user', 'scheduled') and old.pendente_desde is not null then
    v_parado := coalesce(public.minutos_uteis_do_chamado(new.tenant_id, new.module, old.pendente_desde, now(),
                                                         new.assigned_to), 0);
    new.pendente_desde := null;
    if v_parado > 0 then
      new.minutos_pausados := old.minutos_pausados + v_parado;
      if old.status::text = 'scheduled' then
        new.minutos_agendados := old.minutos_agendados + v_parado;
      end if;
      if new.sla_due_at is not distinct from old.sla_due_at and new.sla_due_at is not null then
        new.sla_due_at := public.prazo_do_chamado(new.tenant_id, new.module, old.sla_due_at, v_parado,
                                                  new.assigned_to);
      end if;
    end if;
  end if;
  if new.status::text in ('waiting_user', 'scheduled') then
    new.pendente_desde := now();
  end if;
  return new;
end;
$function$;

-- ─── 1c. Agendar pede "Mudar prioridade e prazo" ──────────────────────────────────────────────
-- Troca de texto exata em `chamado_guarda_o_perfil` (o resto da função fica como está).
do $$
declare
  v_def text := pg_get_functiondef('public.chamado_guarda_o_perfil()'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
    '    elsif not (v_assumiu and old.status = ''open'' and new.status = ''in_progress'') then',
    '    elsif new.status::text = ''scheduled'' then' || E'\n' ||
    '      -- Agendar é decidir QUANDO tratar: é prazo, não status (dono, 2026-10-07).' || E'\n' ||
    '      v_acoes := v_acoes || ''change_priority''::text;' || E'\n' ||
    '    elsif not (v_assumiu and old.status = ''open'' and new.status = ''in_progress'') then');
  v_novo := replace(v_novo,
    '  if new.priority is distinct from old.priority or new.due_date is distinct from old.due_date then',
    '  if new.priority is distinct from old.priority or new.due_date is distinct from old.due_date' || E'\n' ||
    '     or (new.status::text = ''scheduled'' and new.agendado_para is distinct from old.agendado_para) then');
  if v_novo = v_def or position('agendado_para' in v_novo) = 0 or position('''scheduled'' then' in v_novo) = 0 then
    raise exception 'chamado_guarda_o_perfil num formato inesperado: agendar não ficou protegido';
  end if;
  execute v_novo;
end $$;

-- ─── 1d. O aviso ao solicitante ───────────────────────────────────────────────────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.notify_on_ticket_change()'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
    'when ''cancelled'' then ''Cancelado''',
    'when ''cancelled'' then ''Cancelado'' when ''scheduled'' then ''Agendado''');
  v_novo := replace(v_novo,
    '  elsif new.module = ''compras'' and new.status is distinct from old.status',
    '  elsif new.status is distinct from old.status and new.status::text = ''scheduled'' then' || E'\n' ||
    '    perform public.notify_ticket(new.id, ''ticket_scheduled'', array[new.requester_id] || v_menc,' || E'\n' ||
    '      ''Chamado '' || v_n || '' foi agendado para '' ||' || E'\n' ||
    '        to_char(new.agendado_para at time zone ''America/Sao_Paulo'', ''DD/MM "às" HH24:MI'') || ''.'',' || E'\n' ||
    '      coalesce(nullif(btrim(new.agendado_motivo), ''''), coalesce(new.title, '''')), false);' || E'\n' ||
    '  elsif new.module = ''compras'' and new.status is distinct from old.status');
  if v_novo = v_def or position('ticket_scheduled' in v_novo) = 0 or position('''Agendado''' in v_novo) = 0 then
    raise exception 'notify_on_ticket_change num formato inesperado: o aviso de agendado não entrou';
  end if;
  execute v_novo;
end $$;

-- ─── 1e. Agendado não vence, e conta como chamado em aberto nas férias ────────────────────────
do $$
declare
  v_def text;
  v_novo text;
  f text;
begin
  v_def := pg_get_functiondef('public.avisar_prazo_vencido(uuid)'::regprocedure);
  v_novo := replace(v_def, 't.status::text = ''waiting_user''', 't.status::text in (''waiting_user'', ''scheduled'')');
  if v_novo = v_def then
    raise exception 'avisar_prazo_vencido num formato inesperado';
  end if;
  execute v_novo;

  foreach f in array array['public.ferias_repassar(uuid,jsonb,jsonb)', 'public.ferias_demandas(uuid)',
                           'public.ferias_avisa_gestores(uuid,boolean)'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    v_novo := replace(v_def, '''waiting_user'', ''waiting_parts'')', '''waiting_user'', ''waiting_parts'', ''scheduled'')');
    if v_novo = v_def then
      raise exception '% num formato inesperado: agendado ficaria fora das demandas a repassar', f;
    end if;
    execute v_novo;
  end loop;
end $$;

-- ─── 1f. Na hora marcada, volta para Em andamento ─────────────────────────────────────────────
-- Roda como o dono do banco (sem `auth.uid()`): a guarda do perfil não se aplica, e a pausa fecha
-- o trecho pelo gatilho de sempre. O aviso de "alterado" (status: Em andamento) vai ao atendente e
-- ao solicitante — é o lembrete de que chegou a hora.
create or replace function public.chamados_agendados_voltam()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  update public.tickets set status = 'in_progress'
   where status = 'scheduled' and agendado_para <= now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.chamados_agendados_voltam() is
  'Chamado Agendado cuja hora chegou volta para Em andamento (job de 5 em 5 minutos, 2026-10-07).';
revoke all on function public.chamados_agendados_voltam() from public, anon, authenticated;

select cron.schedule('chamados-agendados-5min', '*/5 * * * *', $cron$select public.chamados_agendados_voltam()$cron$);

-- ─── 2. Os dois botões de resposta ────────────────────────────────────────────────────────────
-- Igual a 20261213010000, com a regra nova do `mantem_status` (botão "Responder").
create or replace function public.chamado_status_pela_resposta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t record;
  v_novo text;
  v_assume boolean := false;
begin
  if coalesce(new.is_internal, false) or new.author_id is null then
    return null;
  end if;
  select id, status::text as status, requester_id, assigned_to, module into t from public.tickets where id = new.ticket_id;
  if t.id is null then
    return null;
  end if;
  if new.author_id = t.requester_id then
    if t.status = 'waiting_user' then
      v_novo := 'in_progress';
    end if;
  else
    -- 2026-10-06: quem pode atender e responde um chamado SEM atendente vira o atendente.
    v_assume := t.assigned_to is null
                and t.module <> 'compras'
                and new.author_id = auth.uid()
                and t.status in ('open', 'in_progress', 'waiting_user', 'scheduled')
                and public.pode_no_chamado(t.module, 'assume');
    if coalesce(new.mantem_status, false) then
      -- "Responder" (2026-10-07): o chamado fica, ou volta, Em andamento.
      if t.status in ('open', 'waiting_user', 'scheduled') then
        v_novo := 'in_progress';
      end if;
    elsif t.status in ('open', 'in_progress', 'scheduled') then
      -- "Responder e aguardar retorno": Pendente, prazo pausado, solicitante avisado.
      v_novo := 'waiting_user';
    end if;
  end if;
  if v_novo is null and not v_assume then
    return null;
  end if;
  perform set_config('helpoint.status_pela_resposta', t.id::text, true);
  update public.tickets
     set status = coalesce(v_novo, status::text)::ticket_status,
         assigned_to = case when v_assume then new.author_id else assigned_to end
   where id = t.id;
  perform set_config('helpoint.status_pela_resposta', '', true);
  return null;
end;
$function$;

comment on column public.ticket_comments.mantem_status is
  'Botão "Responder" (true): o chamado fica/volta Em andamento. "Responder e aguardar retorno" (false): Pendente.';

-- ─── 3. Os setores da pessoa e a ajuda a outros setores ───────────────────────────────────────
-- Os setores em que a pessoa TRABALHA (Setor do perfil, concessão, perfil de acesso) — sem o
-- "acompanhar também", que é só aviso. `setores_de_aviso` passa a ser isto + o acompanhar.
create or replace function public.setores_da_pessoa(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct case x.s when 'ti' then 'tickets' else x.s end), '{}'::text[])
    from (
      select lower(btrim(p.department)) as s from public.profiles p where p.id = p_user
      union select m.module from public.user_module_access m where m.user_id = p_user
      union select uap.department from public.user_access_profiles uap where uap.user_id = p_user
    ) x
   where coalesce(x.s, '') <> '';
$$;

comment on function public.setores_da_pessoa(uuid) is
  'Módulos de chamado em que a pessoa trabalha (Setor do perfil, concessão, perfil de acesso). Sem o "acompanhar".';
revoke all on function public.setores_da_pessoa(uuid) from public, anon, authenticated;
grant execute on function public.setores_da_pessoa(uuid) to service_role;

create or replace function public.setores_de_aviso(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct x.s), '{}'::text[])
    from (
      select unnest(public.setores_da_pessoa(p_user)) as s
      union select case a.s when 'ti' then 'tickets' else a.s end
        from public.profiles p, unnest(p.acompanha_setores) as a(s) where p.id = p_user
    ) x
   where coalesce(x.s, '') <> '';
$$;

-- Os meus (a tela de performance pergunta).
create or replace function public.meus_setores_de_chamado()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.setores_da_pessoa(auth.uid());
$$;
revoke all on function public.meus_setores_de_chamado() from public, anon;
grant execute on function public.meus_setores_de_chamado() to authenticated;

-- Os chamados de OUTROS setores atendidos por gente DESTE setor, no período (abertos nele, como o
-- resto dos Indicadores). Quem pergunta precisa ser do setor, da Diretoria ou administrador. O
-- título só aparece para quem pode ver o chamado — chamado do RH não vaza para o painel da TI.
create or replace function public.ajuda_a_outros_setores(p_modulo text, p_de timestamptz, p_ate timestamptz)
returns table (id uuid, ticket_number integer, title text, module text, status text, created_at timestamptz,
               resolved_at timestamptz, atendente_id uuid, atendente_nome text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id, t.ticket_number,
         case when public.pode_ver_chamado(auth.uid(), t.tenant_id, t.module, t.requester_id, t.assigned_to)
              then t.title else 'Chamado de ' || public.nome_do_setor_do_chamado(t.module) end,
         t.module,
         case when t.status::text = 'closed' then 'resolved' else t.status::text end,
         t.created_at, t.resolved_at, t.assigned_to, p.full_name
    from public.tickets t
    join public.profiles p on p.id = t.assigned_to
   where t.tenant_id = public.get_user_tenant_id()
     and t.module <> p_modulo
     and t.created_at >= p_de and t.created_at < p_ate
     and p_modulo = any (public.setores_da_pessoa(t.assigned_to))
     and not (t.module = any (public.setores_da_pessoa(t.assigned_to)))
     and (public.is_admin_or_higher(auth.uid())
          or public.has_diretoria_access(auth.uid())
          or p_modulo = any (public.setores_da_pessoa(auth.uid())))
   order by t.created_at desc;
$$;

comment on function public.ajuda_a_outros_setores(text, timestamptz, timestamptz) is
  'Chamados de outros setores atendidos por gente do setor p_modulo no período (2026-10-07). Não pesam na performance.';
revoke all on function public.ajuda_a_outros_setores(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.ajuda_a_outros_setores(text, timestamptz, timestamptz) to authenticated;
