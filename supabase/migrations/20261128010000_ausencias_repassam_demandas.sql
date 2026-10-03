-- AUSÊNCIAS REPASSAM AS DEMANDAS (decisão do dono, 2026-10-03, revendo 20261127020000).
--
-- O dono, sobre os dois pontos em aberto:
--   * quem é avisado: quem tem a caixinha no perfil — não mais "o perfil que se chama Gestor".
--     Caixinha nova em Chamados de todo setor: "Receber aviso de ausência e repassar as demandas"
--     (`tickets.repassar_ausencias`), marcada agora nos perfis Gestor que existem. Setor sem ninguém
--     marcado → administradores, como antes;
--   * o que dispara: toda ausência de 2 DIAS OU MAIS — férias, abono, banco de horas e atestado —, e
--     só quando o RH dá o gatilho: aprova o pedido, registra, ou valida o atestado.
-- O "substituto temporário" das categorias passa a valer para qualquer uma dessas ausências.

-- ─── A caixinha nos perfis Gestor ────────────────────────────────────────────
-- Os de hoje ganham marcada; os que nascerem (empresa ou setor novo) também, pelo padrão de chamados
-- que o trigger `perfil_chamados_no_formato_novo` aplica na semente (20261119010000).
update public.access_profiles
   set permissions = jsonb_set(permissions, '{tickets,repassar_ausencias}', 'true'::jsonb)
 where name = 'Gestor' and permissions ? 'tickets';

create or replace function public.chamados_do_perfil_padrao(p_nome text)
returns jsonb
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_nome = 'Gestor' then
      '{"view_all":true,"assume":true,"change_status":true,"close":true,"reopen":true,
        "transfer":true,"change_priority":true,"internal_notes":true,"delete":true,
        "repassar_ausencias":true}'::jsonb
    when p_nome = 'Somente leitura' then
      '{"view_all":true,"assume":false,"change_status":false,"close":false,"reopen":false,
        "transfer":false,"change_priority":false,"internal_notes":false,"delete":false}'::jsonb
    else
      '{"view_all":true,"assume":true,"change_status":true,"close":true,"reopen":true,
        "transfer":false,"change_priority":false,"internal_notes":true,"delete":false}'::jsonb
  end;
$$;

-- ─── O atestado do colaborador nasce "recebido" ──────────────────────────────
-- A policy não olhava o status: dava para enviar pela API um atestado já "validado" — e validado agora
-- dispara o repasse. É o mesmo furo que o pedido de férias tinha (fechado em 20261127020000).
drop policy if exists "Colaborador envia seus atestados" on public.rh_medical_certificates;
create policy "Colaborador envia seus atestados" on public.rh_medical_certificates for insert to authenticated
  with check (user_id = auth.uid() and tenant_id = public.get_user_tenant_id() and status = 'recebido');

-- ─── As ausências que contam ─────────────────────────────────────────────────
-- Só as que o RH decidiu, e de 2 dias ou mais. Lida só pelas funções abaixo (sem grant).
create or replace view public.ausencias_que_repassam as
  select v.id, v.tenant_id, v.user_id, v.start_date as inicio, v.end_date as fim, v.type as tipo
    from public.rh_vacation_requests v
   where v.status = 'aprovada' and v.end_date - v.start_date + 1 >= 2
  union all
  select c.id, c.tenant_id, c.user_id, c.issue_date, c.issue_date + c.days_off - 1, 'atestado'
    from public.rh_medical_certificates c
   where c.status = 'validado' and c.days_off >= 2;
revoke all on public.ausencias_que_repassam from public, anon, authenticated;

create or replace function public.rotulo_da_ausencia(p_tipo text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case p_tipo when 'ferias' then 'férias' when 'abono' then 'abono'
                     when 'banco_horas' then 'banco de horas' when 'atestado' then 'atestado' else p_tipo end;
$$;
revoke all on function public.rotulo_da_ausencia(text) from public, anon;

-- A ausência que a pessoa está cumprindo hoje (dia do Brasil).
create or replace function public.ausencia_de_hoje(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id from public.ausencias_que_repassam a
   where a.user_id = p_user
     and (now() at time zone 'America/Sao_Paulo')::date between a.inicio and a.fim
   order by a.inicio desc
   limit 1;
$$;
revoke all on function public.ausencia_de_hoje(uuid) from public, anon;
grant execute on function public.ausencia_de_hoje(uuid) to authenticated;

-- O substituto passa a apontar para qualquer ausência (as férias ou o atestado). Sem chave
-- estrangeira: são duas tabelas. A tabela está vazia na produção.
alter table public.ferias_substitutos drop constraint if exists ferias_substitutos_vacation_id_fkey;
alter table public.ferias_substitutos rename column vacation_id to ausencia_id;

create or replace function public.responsaveis_da_categoria(p_category uuid)
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with alvo as (
    select c.id, c.parent_id, c.module, c.tenant_id
      from public.ti_categories c
     where c.id = p_category
       and c.tenant_id = coalesce(public.get_user_tenant_id(), c.tenant_id)
  ), proprios as (
    select r.user_id, r.category_id from public.ti_category_responsaveis r join alvo on r.category_id = alvo.id
  ), vinculos as (
    select user_id, category_id from proprios
    union all
    select r.user_id, r.category_id from public.ti_category_responsaveis r join alvo on r.category_id = alvo.parent_id
     where not exists (select 1 from proprios)
  ), efetivos as (
    select case when f.aus is null then v.user_id else s.substituto_id end as user_id
      from vinculos v
      cross join lateral (select public.ausencia_de_hoje(v.user_id) as aus) f
      left join public.ferias_substitutos s on s.ausencia_id = f.aus and s.category_id = v.category_id
     where f.aus is null or s.substituto_id is not null
  )
  select p.id, p.full_name
    from public.profiles p
    join alvo on p.tenant_id = alvo.tenant_id
   where p.id in (select user_id from efetivos)
     and coalesce(p.is_active, true)
     and public.ausencia_de_hoje(p.id) is null
     and exists (select 1 from public.user_module_access m
                  where m.user_id = p.id and m.module = public.setor_do_modulo(alvo.module))
   order by coalesce(p.full_name, p.email);
$$;
drop function if exists public.ferias_de_hoje(uuid);

-- Quem é avisado: quem tem a caixinha num setor da pessoa; ninguém → administradores.
create or replace function public.gestores_da_pessoa(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  with pessoa as (select tenant_id from public.profiles where id = p_user),
  g as (
    select distinct outro.user_id
      from public.user_module_access dela
      join public.user_module_access outro on outro.module = dela.module and outro.tenant_id = dela.tenant_id
      join public.profiles gp on gp.id = outro.user_id and coalesce(gp.is_active, true)
     where dela.user_id = p_user and outro.user_id <> p_user
       and public.tem_permissao(outro.user_id, dela.module, 'tickets', 'repassar_ausencias')
  )
  select user_id from g
  union
  select r.user_id from public.user_roles r join public.profiles p on p.id = r.user_id
   where r.role in ('owner', 'admin') and p.tenant_id = (select tenant_id from pessoa)
     and r.user_id <> p_user and coalesce(p.is_active, true)
     and not exists (select 1 from g);
$$;

create or replace function public.pode_repassar_ferias(p_vacation uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.ausencias_que_repassam a
     where a.id = p_vacation and a.tenant_id = public.get_user_tenant_id()
       and (public.is_admin_or_higher(auth.uid())
            or auth.uid() in (select public.gestores_da_pessoa(a.user_id))));
$$;

create or replace function public.ferias_avisa_gestores(p_vacation uuid, p_vespera boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a record;
  v_nome text;
  v_tipo text;
  v_chamados integer;
  v_categorias integer;
begin
  select * into a from public.ausencias_que_repassam where id = p_vacation;
  if not found then return; end if;   -- menos de 2 dias, ou ainda não decidida pelo RH
  select coalesce(full_name, email) into v_nome from public.profiles where id = a.user_id;
  v_tipo := public.rotulo_da_ausencia(a.tipo);
  select count(*) into v_chamados from public.tickets
   where assigned_to = a.user_id and status in ('open', 'in_progress', 'waiting_user', 'waiting_parts');
  select count(*) into v_categorias from public.ti_category_responsaveis where user_id = a.user_id;
  if (p_vespera and v_chamados = 0) or (v_chamados = 0 and v_categorias = 0) then
    return;
  end if;
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select a.tenant_id, g, 'ferias_repassar', 'ferias', a.id,
         case when p_vespera then v_nome || ' fica fora a partir de amanhã (' || v_tipo || ')'
              else 'Ausência de ' || v_nome || ' (' || v_tipo || '): repasse as demandas' end,
         format('%s de %s a %s. Com %s: %s chamado(s) aberto(s) e %s categoria(s) de que é responsável. Escolha quem assume.',
                initcap(v_tipo), to_char(a.inicio, 'DD/MM'), to_char(a.fim, 'DD/MM/YYYY'), v_nome, v_chamados, v_categorias)
    from public.gestores_da_pessoa(a.user_id) g;
end;
$$;

-- O gatilho é do RH: aprovar ou registrar o pedido (qualquer tipo) e validar o atestado.
create or replace function public.ferias_aprovadas_avisam()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'aprovada' and (tg_op = 'INSERT' or old.status is distinct from 'aprovada') then
    perform public.ferias_avisa_gestores(new.id, false);
  end if;
  return new;
end;
$$;

create or replace function public.atestado_validado_avisa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'validado' and (tg_op = 'INSERT' or old.status is distinct from 'validado') then
    perform public.ferias_avisa_gestores(new.id, false);
  end if;
  return new;
end;
$$;
revoke all on function public.atestado_validado_avisa() from public, anon;
create trigger trg_atestado_validado_avisa after insert or update of status on public.rh_medical_certificates
  for each row execute function public.atestado_validado_avisa();

create or replace function public.ferias_lembra_vespera()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  for r in
    select id from public.ausencias_que_repassam
     where inicio = (now() at time zone 'America/Sao_Paulo')::date + 1
  loop
    perform public.ferias_avisa_gestores(r.id, true);
  end loop;
end;
$$;

create or replace function public.ferias_demandas(p_vacation uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  a record;
begin
  if not public.pode_repassar_ferias(p_vacation) then
    raise exception 'Só quem recebe o aviso de ausência do setor (ou um administrador) repassa estas demandas.' using errcode = '42501';
  end if;
  select * into a from public.ausencias_que_repassam where id = p_vacation;
  return jsonb_build_object(
    'pessoa', (select jsonb_build_object('id', p.id, 'nome', coalesce(p.full_name, p.email)) from public.profiles p where p.id = a.user_id),
    'inicio', a.inicio, 'fim', a.fim, 'tipo', public.rotulo_da_ausencia(a.tipo),
    'chamados', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'numero', t.ticket_number, 'titulo', t.title, 'modulo', t.module)
                       order by t.created_at)
        from public.tickets t
       where t.assigned_to = a.user_id and t.tenant_id = a.tenant_id
         and t.status in ('open', 'in_progress', 'waiting_user', 'waiting_parts')), '[]'::jsonb),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nome', coalesce(pc.name || ' › ', '') || c.name,
                                          'modulo', c.module, 'substituto', s.substituto_id)
                       order by c.module, pc.name nulls first, c.name)
        from public.ti_category_responsaveis r
        join public.ti_categories c on c.id = r.category_id
        left join public.ti_categories pc on pc.id = c.parent_id
        left join public.ferias_substitutos s on s.ausencia_id = a.id and s.category_id = c.id
       where r.user_id = a.user_id), '[]'::jsonb));
end;
$$;

create or replace function public.ferias_repassar(p_vacation uuid, p_chamados jsonb, p_categorias jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a record;
  item jsonb;
  v_para uuid;
  v_cat uuid;
  v_n_chamados integer := 0;
  v_n_categorias integer := 0;
begin
  if not public.pode_repassar_ferias(p_vacation) then
    raise exception 'Só quem recebe o aviso de ausência do setor (ou um administrador) repassa estas demandas.' using errcode = '42501';
  end if;
  select * into a from public.ausencias_que_repassam where id = p_vacation;

  for item in select * from jsonb_array_elements(coalesce(p_chamados, '[]'::jsonb)) loop
    v_para := nullif(item ->> 'para', '')::uuid;
    continue when v_para is null or v_para = a.user_id;
    update public.tickets t set assigned_to = v_para
     where t.id = (item ->> 'id')::uuid and t.tenant_id = a.tenant_id and t.assigned_to = a.user_id
       and t.status in ('open', 'in_progress', 'waiting_user', 'waiting_parts')
       and exists (select 1 from public.user_module_access m
                    where m.user_id = v_para and m.module = public.setor_do_modulo(t.module));
    if found then v_n_chamados := v_n_chamados + 1; end if;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_categorias, '[]'::jsonb)) loop
    v_cat := (item ->> 'id')::uuid;
    v_para := nullif(item ->> 'para', '')::uuid;
    continue when not exists (select 1 from public.ti_category_responsaveis
                               where category_id = v_cat and user_id = a.user_id);
    if v_para is null then
      delete from public.ferias_substitutos where ausencia_id = a.id and category_id = v_cat;
    elsif v_para <> a.user_id and exists (
            select 1 from public.ti_categories c join public.user_module_access m
                on m.user_id = v_para and m.module = public.setor_do_modulo(c.module)
             where c.id = v_cat) then
      insert into public.ferias_substitutos (tenant_id, ausencia_id, category_id, substituto_id)
      values (a.tenant_id, a.id, v_cat, v_para)
      on conflict (ausencia_id, category_id) do update set substituto_id = excluded.substituto_id;
      v_n_categorias := v_n_categorias + 1;
    end if;
  end loop;

  return jsonb_build_object('chamados', v_n_chamados, 'categorias', v_n_categorias);
end;
$$;
