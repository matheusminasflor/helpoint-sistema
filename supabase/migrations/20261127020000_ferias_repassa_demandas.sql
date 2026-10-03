-- FÉRIAS REPASSAM AS DEMANDAS (decisão do dono, 2026-10-03).
--
-- O dono: quando o colaborador entra de férias — pedido dele aprovado, ou o RH registrando —, avisar o
-- gestor para ele decidir para quem vão os chamados e as categorias daquela pessoa. Decisões
-- (múltipla escolha):
--   * quem é avisado: o Gestor dos setores da pessoa; setor sem gestor → os administradores;
--   * quando: na aprovação, e de novo na véspera se ainda houver chamado parado com ela;
--   * categorias: SUBSTITUTO TEMPORÁRIO — durante as férias os chamados novos vão para o substituto, e
--     no dia seguinte ao fim voltam sozinhos para a pessoa (não há o que desfazer: a regra olha a data);
--   * repasse: um substituto para tudo, ajustável item a item (tela "Repassar demandas").

-- ─── O RH registra férias já aprovadas ───────────────────────────────────────
-- Até aqui só o colaborador pedia. Quem aprova férias no perfil do RH agora também registra.
create policy rh_ferias_registra on public.rh_vacation_requests for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id()
              and status = 'aprovada'
              and public.pode_no_rh('vacations', 'approve'));

-- E o pedido do colaborador nasce PENDENTE. A policy dele não olhava o status: dava para criar pela API
-- as próprias férias já "aprovadas" — e, com o aviso ao gestor abaixo, isso passaria a disparar repasse.
drop policy if exists "Colaborador cria suas solicitações de férias" on public.rh_vacation_requests;
create policy "Colaborador cria suas solicitações de férias" on public.rh_vacation_requests for insert to authenticated
  with check (user_id = auth.uid() and tenant_id = public.get_user_tenant_id() and status = 'pendente');

-- Férias registradas pelo RH já nascem decididas: não abrem chamado de "Solicitação de férias"
-- na fila do RH (o trigger abria um para todo pedido).
do $$
declare
  v_def text := pg_get_functiondef('public.create_rh_ticket_from_request'::regproc);
  v_novo text;
begin
  v_novo := replace(v_def,
    E'BEGIN\n  IF TG_TABLE_NAME = ''rh_vacation_requests'' THEN',
    E'BEGIN\n  IF TG_TABLE_NAME = ''rh_vacation_requests'' AND NEW.status = ''aprovada'' THEN\n    RETURN NEW;\n  END IF;\n  IF TG_TABLE_NAME = ''rh_vacation_requests'' THEN');
  if v_novo = v_def then
    raise exception 'create_rh_ticket_from_request mudou: o trecho esperado não foi achado';
  end if;
  execute v_novo;
end $$;

-- ─── Substitutos temporários das categorias ──────────────────────────────────
-- Só as funções abaixo escrevem e leem (RLS ligada, sem policy).
create table public.ferias_substitutos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vacation_id uuid not null references public.rh_vacation_requests(id) on delete cascade,
  category_id uuid not null references public.ti_categories(id) on delete cascade,
  substituto_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (vacation_id, category_id)
);
alter table public.ferias_substitutos enable row level security;

-- As férias aprovadas que a pessoa está gozando hoje (dia do Brasil — regra 10).
create or replace function public.ferias_de_hoje(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select v.id from public.rh_vacation_requests v
   where v.user_id = p_user and v.type = 'ferias' and v.status = 'aprovada'
     and (now() at time zone 'America/Sao_Paulo')::date between v.start_date and v.end_date
   order by v.start_date desc
   limit 1;
$$;
revoke all on function public.ferias_de_hoje(uuid) from public, anon;
grant execute on function public.ferias_de_hoje(uuid) to authenticated;

-- Responsáveis da categoria, agora com férias: quem está de férias sai, e entra o substituto que o
-- gestor escolheu para aquela categoria (sem substituto, só sai). `create or replace` mantém a ACL.
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
    select case when f.vac is null then v.user_id else s.substituto_id end as user_id
      from vinculos v
      cross join lateral (select public.ferias_de_hoje(v.user_id) as vac) f
      left join public.ferias_substitutos s on s.vacation_id = f.vac and s.category_id = v.category_id
     where f.vac is null or s.substituto_id is not null
  )
  select p.id, p.full_name
    from public.profiles p
    join alvo on p.tenant_id = alvo.tenant_id
   where p.id in (select user_id from efetivos)
     and coalesce(p.is_active, true)
     and public.ferias_de_hoje(p.id) is null
     and exists (select 1 from public.user_module_access m
                  where m.user_id = p.id and m.module = public.setor_do_modulo(alvo.module))
   order by coalesce(p.full_name, p.email);
$$;

-- Quem decide o repasse: quem tem o perfil "Gestor" num setor da pessoa; ninguém → administradores.
-- ponytail: reconhece o gestor pelo nome do perfil semeado ("Gestor"). Perfil personalizado com
-- outro nome não conta; se aparecer, a saída é uma caixinha própria ("Repassar demandas") no perfil.
create or replace function public.gestores_da_pessoa(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  with pessoa as (select tenant_id from public.profiles where id = p_user),
  g as (
    select distinct uap.user_id
      from public.user_access_profiles uap
      join public.access_profiles ap on ap.id = uap.profile_id
      join public.user_module_access m on m.user_id = p_user and m.module = ap.department
      join public.profiles gp on gp.id = uap.user_id and coalesce(gp.is_active, true)
     where ap.name = 'Gestor' and uap.user_id <> p_user
       and ap.tenant_id = (select tenant_id from pessoa)
  )
  select user_id from g
  union
  select r.user_id from public.user_roles r join public.profiles p on p.id = r.user_id
   where r.role in ('owner', 'admin') and p.tenant_id = (select tenant_id from pessoa)
     and r.user_id <> p_user and coalesce(p.is_active, true)
     and not exists (select 1 from g);
$$;
revoke all on function public.gestores_da_pessoa(uuid) from public, anon, authenticated;

create or replace function public.pode_repassar_ferias(p_vacation uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.rh_vacation_requests v
     where v.id = p_vacation and v.tenant_id = public.get_user_tenant_id()
       and (public.is_admin_or_higher(auth.uid())
            or auth.uid() in (select public.gestores_da_pessoa(v.user_id))));
$$;
revoke all on function public.pode_repassar_ferias(uuid) from public, anon;
grant execute on function public.pode_repassar_ferias(uuid) to authenticated;

-- ─── O aviso ao gestor ───────────────────────────────────────────────────────
create or replace function public.ferias_avisa_gestores(p_vacation uuid, p_vespera boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v public.rh_vacation_requests%rowtype;
  v_nome text;
  v_chamados integer;
  v_categorias integer;
begin
  select * into v from public.rh_vacation_requests where id = p_vacation;
  if not found then return; end if;
  select coalesce(full_name, email) into v_nome from public.profiles where id = v.user_id;
  select count(*) into v_chamados from public.tickets
   where assigned_to = v.user_id and status in ('open', 'in_progress', 'waiting_user', 'waiting_parts');
  select count(*) into v_categorias from public.ti_category_responsaveis where user_id = v.user_id;
  -- Na véspera só se ainda houver chamado parado com a pessoa; na aprovação, se houver o que repassar.
  if (p_vespera and v_chamados = 0) or (v_chamados = 0 and v_categorias = 0) then
    return;
  end if;
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select v.tenant_id, g, 'ferias_repassar', 'ferias', v.id,
         case when p_vespera then v_nome || ' sai de férias amanhã' else 'Férias de ' || v_nome || ': repasse as demandas' end,
         format('Férias de %s a %s. Com %s: %s chamado(s) aberto(s) e %s categoria(s) de que é responsável. Escolha quem assume.',
                to_char(v.start_date, 'DD/MM'), to_char(v.end_date, 'DD/MM/YYYY'), v_nome, v_chamados, v_categorias)
    from public.gestores_da_pessoa(v.user_id) g;
end;
$$;
revoke all on function public.ferias_avisa_gestores(uuid, boolean) from public, anon, authenticated;

create or replace function public.ferias_aprovadas_avisam()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.type = 'ferias' and new.status = 'aprovada'
     and (tg_op = 'INSERT' or old.status is distinct from 'aprovada') then
    perform public.ferias_avisa_gestores(new.id, false);
  end if;
  return new;
end;
$$;
revoke all on function public.ferias_aprovadas_avisam() from public, anon;
create trigger trg_ferias_aprovadas_avisam after insert or update of status on public.rh_vacation_requests
  for each row execute function public.ferias_aprovadas_avisam();

-- A véspera: todo dia às 8h de Brasília (11h UTC).
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
    select id from public.rh_vacation_requests
     where type = 'ferias' and status = 'aprovada'
       and start_date = (now() at time zone 'America/Sao_Paulo')::date + 1
  loop
    perform public.ferias_avisa_gestores(r.id, true);
  end loop;
end;
$$;
revoke all on function public.ferias_lembra_vespera() from public, anon, authenticated;
select cron.schedule('ferias-vespera', '0 11 * * *', $cron$select public.ferias_lembra_vespera()$cron$);

-- ─── A tela "Repassar demandas" ──────────────────────────────────────────────
create or replace function public.ferias_demandas(p_vacation uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v public.rh_vacation_requests%rowtype;
begin
  if not public.pode_repassar_ferias(p_vacation) then
    raise exception 'Só o gestor do setor (ou um administrador) repassa as demandas destas férias.' using errcode = '42501';
  end if;
  select * into v from public.rh_vacation_requests where id = p_vacation;
  return jsonb_build_object(
    'pessoa', (select jsonb_build_object('id', p.id, 'nome', coalesce(p.full_name, p.email)) from public.profiles p where p.id = v.user_id),
    'inicio', v.start_date, 'fim', v.end_date, 'status', v.status,
    'chamados', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'numero', t.ticket_number, 'titulo', t.title, 'modulo', t.module)
                       order by t.created_at)
        from public.tickets t
       where t.assigned_to = v.user_id and t.tenant_id = v.tenant_id
         and t.status in ('open', 'in_progress', 'waiting_user', 'waiting_parts')), '[]'::jsonb),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nome', coalesce(pc.name || ' › ', '') || c.name,
                                          'modulo', c.module, 'substituto', s.substituto_id)
                       order by c.module, pc.name nulls first, c.name)
        from public.ti_category_responsaveis r
        join public.ti_categories c on c.id = r.category_id
        left join public.ti_categories pc on pc.id = c.parent_id
        left join public.ferias_substitutos s on s.vacation_id = v.id and s.category_id = c.id
       where r.user_id = v.user_id), '[]'::jsonb));
end;
$$;
revoke all on function public.ferias_demandas(uuid) from public, anon;
grant execute on function public.ferias_demandas(uuid) to authenticated;

-- Repassa: chamados abertos trocam de atendente agora (o aviso de "atribuído" sai pelo trigger de
-- sempre); categorias ganham o substituto do período. `para` vazio numa categoria tira o substituto.
-- Quem recebe precisa ter o acesso ao setor do item.
create or replace function public.ferias_repassar(p_vacation uuid, p_chamados jsonb, p_categorias jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v public.rh_vacation_requests%rowtype;
  item jsonb;
  v_para uuid;
  v_cat uuid;
  v_n_chamados integer := 0;
  v_n_categorias integer := 0;
begin
  if not public.pode_repassar_ferias(p_vacation) then
    raise exception 'Só o gestor do setor (ou um administrador) repassa as demandas destas férias.' using errcode = '42501';
  end if;
  select * into v from public.rh_vacation_requests where id = p_vacation;

  for item in select * from jsonb_array_elements(coalesce(p_chamados, '[]'::jsonb)) loop
    v_para := nullif(item ->> 'para', '')::uuid;
    continue when v_para is null or v_para = v.user_id;
    update public.tickets t set assigned_to = v_para
     where t.id = (item ->> 'id')::uuid and t.tenant_id = v.tenant_id and t.assigned_to = v.user_id
       and t.status in ('open', 'in_progress', 'waiting_user', 'waiting_parts')
       and exists (select 1 from public.user_module_access m
                    where m.user_id = v_para and m.module = public.setor_do_modulo(t.module));
    if found then v_n_chamados := v_n_chamados + 1; end if;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_categorias, '[]'::jsonb)) loop
    v_cat := (item ->> 'id')::uuid;
    v_para := nullif(item ->> 'para', '')::uuid;
    continue when not exists (select 1 from public.ti_category_responsaveis
                               where category_id = v_cat and user_id = v.user_id);
    if v_para is null then
      delete from public.ferias_substitutos where vacation_id = v.id and category_id = v_cat;
    elsif v_para <> v.user_id and exists (
            select 1 from public.ti_categories c join public.user_module_access m
                on m.user_id = v_para and m.module = public.setor_do_modulo(c.module)
             where c.id = v_cat) then
      insert into public.ferias_substitutos (tenant_id, vacation_id, category_id, substituto_id)
      values (v.tenant_id, v.id, v_cat, v_para)
      on conflict (vacation_id, category_id) do update set substituto_id = excluded.substituto_id;
      v_n_categorias := v_n_categorias + 1;
    end if;
  end loop;

  return jsonb_build_object('chamados', v_n_chamados, 'categorias', v_n_categorias);
end;
$$;
revoke all on function public.ferias_repassar(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.ferias_repassar(uuid, jsonb, jsonb) to authenticated;
