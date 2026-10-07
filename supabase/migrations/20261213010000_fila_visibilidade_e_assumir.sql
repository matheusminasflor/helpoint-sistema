-- QUEM VÊ A FILA E A 1ª RESPOSTA QUE ASSUME (decisões do dono, 2026-10-06).
--
-- 1. VISIBILIDADE PELA CAIXINHA "Ver os chamados do setor" (`tickets.view_all`).
--    Sem ela, a pessoa do setor vê os PRÓPRIOS chamados (solicitante/atendente, como já era) e os
--    SEM ATENDENTE do setor — para poder assumir. Com ela, o setor inteiro. Vale em todos os setores
--    e é o BANCO que barra. Antes: sem a caixinha, nem os sem atendente apareciam; e a opção geral da
--    empresa (`settings.helpdesk.ticketVisibility`) só escondia na tela — saiu do front.
--    "Ser do setor" aqui é ter a concessão do módulo (`user_module_access`), a mesma base de
--    `modulos_de_chamado_visiveis`. Dono/administrador continuam vendo tudo (`is_supervisor_or_higher`).
--    No banco, o Operador do Comercial perde `view_all` (o dono: "os atendentes só conseguem ver
--    seus chamados e os não atribuídos").
--
-- 2. A 1ª RESPOSTA ASSUME. Resposta PÚBLICA de quem pode "Assumir / atender" no setor, num chamado
--    SEM atendente, já o atribui a quem respondeu — no mesmo UPDATE que põe o chamado em Pendente
--    (`chamado_status_pela_resposta`, migration 20261210010000). Com atendente, não tira. Nota
--    interna e resposta do solicitante não assumem. O aviso: a própria resposta já avisa o solicitante
--    ("respondido e aguarda seu retorno"); o "atribuído" desta troca fica calado, como o de status.

-- ─── 1a. Os módulos de chamado em que a pessoa atende (concessão), com ou sem "ver o setor" ───────
create or replace function public.modulos_de_chamado_que_atendo_de(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  with mapa(concessao, modulo_do_chamado) as (values
    ('ti', 'tickets'), ('marketing', 'marketing'), ('qualidade', 'qualidade'), ('rh', 'rh'),
    ('financeiro', 'financeiro'), ('comercial', 'comercial'), ('educacional', 'educacional'),
    ('compras', 'compras'), ('expedicao', 'expedicao'), ('producao', 'producao'))
  select coalesce(array_agg(m.modulo_do_chamado), array[]::text[])
    from mapa m
   where exists (select 1 from public.user_module_access uma
                  where uma.user_id = p_user and uma.module = m.concessao);
$$;

create or replace function public.modulos_de_chamado_que_atendo()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$ select public.modulos_de_chamado_que_atendo_de(auth.uid()); $$;

comment on function public.modulos_de_chamado_que_atendo() is
  'Módulos de chamado em que a pessoa tem a concessão — com eles ela vê os chamados SEM atendente do setor, mesmo sem "Ver os chamados do setor" (2026-10-06).';

revoke all on function public.modulos_de_chamado_que_atendo_de(uuid) from public, anon, authenticated;
revoke all on function public.modulos_de_chamado_que_atendo() from public, anon;
grant execute on function public.modulos_de_chamado_que_atendo() to authenticated;

-- ─── 1b. Todas as policies que perguntam "o setor está visível" ganham "ou está sem atendente e é
-- de um setor em que atendo". Uma regra só: o trecho é o mesmo em `tickets` (sem alias) e nas
-- tabelas filhas (alias `t`), e a migration troca o texto exato, conferindo quantas mudou.
do $$
declare
  p record;
  v_alvo_t text := '(t.module = ANY (COALESCE(( SELECT modulos_de_chamado_visiveis() AS modulos_de_chamado_visiveis), ARRAY[]::text[])))';
  v_novo_t text := '((t.module = ANY (COALESCE(( SELECT modulos_de_chamado_visiveis() AS modulos_de_chamado_visiveis), ARRAY[]::text[]))) OR ((t.assigned_to IS NULL) AND (t.module = ANY (COALESCE(( SELECT modulos_de_chamado_que_atendo() AS modulos_de_chamado_que_atendo), ARRAY[]::text[])))))';
  v_alvo text := '(module = ANY (COALESCE(( SELECT modulos_de_chamado_visiveis() AS modulos_de_chamado_visiveis), ARRAY[]::text[])))';
  v_novo text := '((module = ANY (COALESCE(( SELECT modulos_de_chamado_visiveis() AS modulos_de_chamado_visiveis), ARRAY[]::text[]))) OR ((assigned_to IS NULL) AND (module = ANY (COALESCE(( SELECT modulos_de_chamado_que_atendo() AS modulos_de_chamado_que_atendo), ARRAY[]::text[])))))';
  v_qual text;
  v_check text;
  v_n int := 0;
begin
  for p in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and tablename in ('tickets', 'ticket_comments', 'ticket_attachments', 'ticket_checklists', 'ticket_checklist_items')
       and (coalesce(qual, '') like '%modulos_de_chamado_visiveis()%' or coalesce(with_check, '') like '%modulos_de_chamado_visiveis()%')
  loop
    if p.tablename = 'tickets' then
      v_qual := replace(p.qual, v_alvo, v_novo);
      v_check := replace(p.with_check, v_alvo, v_novo);
    else
      v_qual := replace(p.qual, v_alvo_t, v_novo_t);
      v_check := replace(p.with_check, v_alvo_t, v_novo_t);
    end if;
    if v_qual is not distinct from p.qual and v_check is not distinct from p.with_check then
      raise exception 'policy % de % fala de modulos_de_chamado_visiveis num formato inesperado', p.policyname, p.tablename;
    end if;
    if v_qual is not null then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, v_qual);
    end if;
    if v_check is not null then
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, v_check);
    end if;
    v_n := v_n + 1;
  end loop;
  -- tickets: SELECT, UPDATE; comments: SELECT; attachments: SELECT, INSERT;
  -- checklists: SELECT, INSERT, UPDATE; checklist_items: SELECT, INSERT, UPDATE.
  if v_n <> 11 then
    raise exception 'esperava 11 policies com modulos_de_chamado_visiveis, achei %', v_n;
  end if;
end $$;

-- ─── 1c. `pode_ver_chamado` (avisos, resumo da Lyra, transferir) segue a mesma regra ─────────────
-- `create or replace` com a mesma assinatura: preserva a ACL (lição 14).
create or replace function public.pode_ver_chamado(p_user uuid, p_tenant uuid, p_module text, p_requester uuid, p_assigned uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  with c as (select case p_module when 'tickets' then 'ti' else coalesce(p_module, 'ti') end as concessao)
  select p_user is not null
     and exists (select 1 from public.profiles p
                  where p.id = p_user and p.tenant_id = p_tenant and coalesce(p.is_active, true))
     and (p_user = p_requester
          or p_user = p_assigned
          or public.is_supervisor_or_higher(p_user)
          or exists (select 1 from public.user_module_access uma
                      where uma.user_id = p_user and uma.module = 'diretoria')
          or exists (select 1 from public.user_module_access uma, c
                      where uma.user_id = p_user and uma.module = c.concessao
                        and (c.concessao = 'compras'
                             or p_assigned is null
                             or coalesce(public.tem_permissao(p_user, c.concessao, 'tickets', 'view_all'), false))));
$$;

-- ─── 1d. O Operador do Comercial deixa de ver o setor inteiro (só ele) ────────────────────────────
update public.access_profiles
   set permissions = jsonb_set(permissions, '{tickets,view_all}', 'false'::jsonb, true)
 where department = 'comercial' and name = 'Operador'
   and coalesce((permissions -> 'tickets' ->> 'view_all')::boolean, false);

-- ─── 2. A resposta pública assume o chamado sem atendente ─────────────────────────────────────────
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
    -- `pode_no_chamado` pergunta por `auth.uid()`, que é o autor (a policy de INSERT exige).
    v_assume := t.assigned_to is null
                and t.module <> 'compras'
                and new.author_id = auth.uid()
                and t.status in ('open', 'in_progress', 'waiting_user')
                and public.pode_no_chamado(t.module, 'assume');
    if not coalesce(new.mantem_status, false) and t.status in ('open', 'in_progress') then
      v_novo := 'waiting_user';
    elsif v_assume and t.status = 'open' then
      -- "Continuo trabalhando nele": assume como o botão Assumir, que põe Em andamento.
      v_novo := 'in_progress';
    end if;
  end if;
  if v_novo is null and not v_assume then
    return null;
  end if;
  -- O aviso desta troca é o da própria resposta (`notify_on_ticket_comment`); o de "mudou o
  -- status"/"foi atribuído" fica calado só neste chamado, só neste comando.
  perform set_config('helpoint.status_pela_resposta', t.id::text, true);
  update public.tickets
     set status = coalesce(v_novo, status::text)::ticket_status,
         assigned_to = case when v_assume then new.author_id else assigned_to end
   where id = t.id;
  perform set_config('helpoint.status_pela_resposta', '', true);
  return null;
end;
$function$;

-- O silêncio do aviso cobria só a troca de STATUS; agora cobre também a de atendente feita pela
-- resposta. Troca o texto exato da função, conferindo que mudou.
do $$
declare
  v_def text := pg_get_functiondef('public.notify_on_ticket_change()'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
    'if new.status is distinct from old.status' || E'\n' || '     and current_setting(''helpoint.status_pela_resposta'', true) = new.id::text then',
    'if (new.status is distinct from old.status or new.assigned_to is distinct from old.assigned_to)' || E'\n' || '     and current_setting(''helpoint.status_pela_resposta'', true) = new.id::text then');
  if v_novo = v_def then
    raise exception 'notify_on_ticket_change num formato inesperado: o silêncio da resposta não foi estendido';
  end if;
  execute v_novo;
end $$;
