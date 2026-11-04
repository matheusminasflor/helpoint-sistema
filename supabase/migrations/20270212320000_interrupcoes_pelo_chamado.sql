-- INTERRUPÇÕES NASCEM DO CHAMADO (dono, 2026-11-04: "interrupção não faz sentido ter botão disso, pois deveria vir direto
-- dos chamados"). Proposta https://claude.ai/artifact/1AQYFWLJQxwzPxq22bMc2H, Parte 4, aprovada "pela categoria + atendente
-- corrige".
--
-- A categoria diz que conta como interrupção (com o tipo; a subcategoria herda do nível de cima mais próximo). O chamado
-- abre a interrupção; outro chamado do mesmo tipo com uma queda aberta entra nela (dez pessoas sem internet = uma queda).
-- Ela fecha quando o último chamado resolve, na hora em que quem resolveu disse que voltou. O atendente marca ou desmarca
-- no chamado. As interrupções que já existem continuam contando, só não têm chamado.

-- ─── 1. As colunas ───────────────────────────────────────────────────────────────────────────────────────────────
alter table public.ti_categories
  add column if not exists interrupcao_tipo text
    constraint ti_categories_interrupcao_tipo check (interrupcao_tipo in ('luz', 'internet', 'sistema', 'intranet', 'outra'));

alter table public.tickets
  add column if not exists interrupcao_tipo text
    constraint tickets_interrupcao_tipo check (interrupcao_tipo in ('luz', 'internet', 'sistema', 'intranet', 'outra')),
  add column if not exists interrupcao_id uuid references public.ti_interrupcoes (id) on delete set null,
  -- "Voltou às": vem no mesmo comando que resolve. Sem ela, vale a hora de resolver.
  add column if not exists interrupcao_voltou_em timestamptz;
create index if not exists tickets_por_interrupcao on public.tickets (interrupcao_id) where interrupcao_id is not null;

-- ─── 2. A categoria mais próxima que diz o tipo ──────────────────────────────────────────────────────────────────
create or replace function public.interrupcao_da_categoria(p_categoria uuid)
returns text language sql stable set search_path = public as $$
  with recursive acima as (
    select c.parent_id, c.interrupcao_tipo, 0 as nivel from public.ti_categories c where c.id = p_categoria
    union all
    select p.parent_id, p.interrupcao_tipo, a.nivel + 1 from public.ti_categories p join acima a on p.id = a.parent_id
  )
  select a.interrupcao_tipo from acima a where a.interrupcao_tipo is not null order by a.nivel limit 1;
$$;
revoke all on function public.interrupcao_da_categoria(uuid) from public, anon, authenticated;

-- ─── 3. O chamado entra na queda aberta do tipo, ou abre uma ─────────────────────────────────────────────────────
create or replace function public.chamado_entra_na_interrupcao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.interrupcao_tipo := coalesce(new.interrupcao_tipo, public.interrupcao_da_categoria(new.category_id));
  elsif new.category_id is distinct from old.category_id then
    -- Corrigir a categoria corrige a interrupção (a pessoa escolheu "Queda de internet" e era outra coisa).
    new.interrupcao_tipo := public.interrupcao_da_categoria(new.category_id);
  end if;

  if tg_op = 'UPDATE' then
    if new.interrupcao_tipo is not distinct from old.interrupcao_tipo then
      return new;
    end if;
    new.interrupcao_id := null;
  end if;

  if new.interrupcao_tipo is null or new.status::text in ('resolved', 'closed', 'cancelled', 'rejected') then
    return new;
  end if;

  select i.id into new.interrupcao_id from public.ti_interrupcoes i
   where i.tenant_id = new.tenant_id and i.tipo = new.interrupcao_tipo and i.fim is null and not i.sem_horario
   order by i.inicio desc limit 1;
  if new.interrupcao_id is null then
    insert into public.ti_interrupcoes (tenant_id, tipo, inicio, observacao, created_by)
    values (new.tenant_id, new.interrupcao_tipo, coalesce(new.created_at, now()), new.title, null)
    returning id into new.interrupcao_id;
  end if;
  return new;
end;
$$;
revoke all on function public.chamado_entra_na_interrupcao() from public, anon, authenticated;
drop trigger if exists trg_chamado_entra_na_interrupcao on public.tickets;
create trigger trg_chamado_entra_na_interrupcao before insert or update of category_id, interrupcao_tipo on public.tickets
  for each row execute function public.chamado_entra_na_interrupcao();

-- ─── 4. Sair, fechar e reabrir ───────────────────────────────────────────────────────────────────────────────────
create or replace function public.chamado_mexe_na_interrupcao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_fechado constant text[] := array['resolved', 'closed', 'cancelled', 'rejected'];
begin
  -- Desmarcado: a queda que ficou sem chamado nenhum não aconteceu.
  if old.interrupcao_id is not null and new.interrupcao_id is distinct from old.interrupcao_id then
    delete from public.ti_interrupcoes i
     where i.id = old.interrupcao_id
       and not exists (select 1 from public.tickets t where t.interrupcao_id = i.id);
  end if;

  if new.interrupcao_id is null or new.status is not distinct from old.status then
    return null;
  end if;

  if new.status::text = any (v_fechado) then
    update public.ti_interrupcoes i
       set fim = greatest(i.inicio, least(coalesce(new.interrupcao_voltou_em, now()), now()))
     where i.id = new.interrupcao_id and i.fim is null
       and not exists (select 1 from public.tickets t
                        where t.interrupcao_id = i.id and t.id <> new.id and t.status::text <> all (v_fechado));
  elsif old.status::text = any (v_fechado) then
    update public.ti_interrupcoes set fim = null where id = new.interrupcao_id;
  end if;
  return null;
end;
$$;
revoke all on function public.chamado_mexe_na_interrupcao() from public, anon, authenticated;
drop trigger if exists trg_chamado_mexe_na_interrupcao on public.tickets;
-- Com WHEN, não com "of coluna": gatilho por coluna não enxerga o que o gatilho BEFORE mudou (interrupcao_id).
create trigger trg_chamado_mexe_na_interrupcao after update on public.tickets
  for each row when (old.status is distinct from new.status or old.interrupcao_id is distinct from new.interrupcao_id)
  execute function public.chamado_mexe_na_interrupcao();

-- ─── 5. Marcar ou desmarcar é corrigir a categoria: mesma caixinha do perfil ─────────────────────────────────────
create or replace function public.chamado_guarda_o_perfil()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_fechado constant text[] := array['resolved', 'closed', 'cancelled', 'rejected'];
  v_acoes text[] := array[]::text[];
  v_assumiu boolean := false;
  v_acao text;
  v_junto boolean;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.module <> 'compras' and not public.pode_no_chamado(old.module, 'delete') then
      raise exception 'Seu perfil de acesso não permite excluir este chamado.' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.module = 'compras' then
    return new;
  end if;

  -- Quem abriu avalia ou reabre o que lhe entregaram. Não é ação de equipe — e não muda categoria.
  if old.requester_id = auth.uid() and old.status = 'resolved'
     and new.status::text in ('closed', 'in_progress')
     and new.assigned_to is not distinct from old.assigned_to
     and new.priority is not distinct from old.priority
     and new.due_date is not distinct from old.due_date
     and new.category_id is not distinct from old.category_id
     and new.category is not distinct from old.category
     and new.subcategory is not distinct from old.subcategory
     and new.interrupcao_tipo is not distinct from old.interrupcao_tipo then
    return new;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    -- Pegar da fila, ou assumir no mesmo comando que resolve (2026-10-13), é "assumir".
    v_assumiu := new.assigned_to = auth.uid()
                 and (old.assigned_to is null or new.status::text = any (v_fechado));
    v_acoes := v_acoes || (case when v_assumiu then 'assume' else 'transfer' end);
  end if;

  if new.status is distinct from old.status then
    if new.status::text = any (v_fechado) then
      v_acoes := v_acoes || 'close'::text;
    elsif old.status::text = any (v_fechado) then
      v_acoes := v_acoes || 'reopen'::text;
    elsif new.status::text = 'scheduled' then
      v_acoes := v_acoes || 'schedule'::text;
    elsif not (v_assumiu and old.status = 'open' and new.status = 'in_progress') then
      v_acoes := v_acoes || 'change_status'::text;
    end if;
  end if;

  if new.priority is distinct from old.priority or new.due_date is distinct from old.due_date then
    v_acoes := v_acoes || 'change_priority'::text;
  end if;
  -- Reagendar (mudar a data de um chamado já agendado) é agendar.
  if new.status::text = 'scheduled' and old.status::text = 'scheduled' and new.agendado_para is distinct from old.agendado_para then
    v_acoes := v_acoes || 'schedule'::text;
  end if;

  if new.category_id is distinct from old.category_id
     or new.category is distinct from old.category
     or new.subcategory is distinct from old.subcategory
     or new.interrupcao_tipo is distinct from old.interrupcao_tipo then
    v_acoes := v_acoes || 'change_category'::text;
  end if;

  v_junto := public.atende_junto(new.id);
  foreach v_acao in array v_acoes loop
    continue when v_junto and v_acao in ('close', 'change_status', 'reopen');
    if not public.pode_no_chamado(new.module, v_acao) then
      raise exception 'Seu perfil de acesso não permite % neste chamado.',
        case v_acao
          when 'assume' then 'assumir'
          when 'transfer' then 'transferir'
          when 'close' then 'resolver ou fechar'
          when 'reopen' then 'reabrir'
          when 'change_status' then 'mudar o status'
          when 'change_priority' then 'mudar a prioridade ou o prazo'
          when 'change_category' then 'mudar a categoria'
          when 'schedule' then 'agendar'
        end
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$function$;

-- ─── 6. As categorias sugeridas na proposta ──────────────────────────────────────────────────────────────────────
-- Só acrescenta: nada que existe muda. Semente é exemplo: a TI renomeia, desativa ou marca outras.
do $$
declare
  r record;
  v_infra uuid;
begin
  for r in select distinct c.tenant_id from public.ti_categories c
            where c.module = 'tickets' and c.parent_id is null and c.is_active and c.name in ('Rede', 'Sistemas')
  loop
    insert into public.ti_categories (tenant_id, module, name, parent_id, is_active, sort_order, interrupcao_tipo)
    select r.tenant_id, 'tickets', s.nome, p.id, true, 50, s.tipo
      from (values ('Rede', 'Queda de internet', 'internet'),
                   ('Sistemas', 'Sistema fora do ar', 'sistema'),
                   ('Sistemas', 'Intranet fora do ar', 'intranet')) as s (pai, nome, tipo)
      join public.ti_categories p on p.tenant_id = r.tenant_id and p.module = 'tickets' and p.parent_id is null
                                 and p.is_active and p.name = s.pai
     where not exists (select 1 from public.ti_categories j where j.parent_id = p.id and lower(j.name) = lower(s.nome));

    select c.id into v_infra from public.ti_categories c
     where c.tenant_id = r.tenant_id and c.module = 'tickets' and c.parent_id is null and c.is_active and c.name = 'Infraestrutura';
    if v_infra is null and (select count(*) from public.ti_categories c
                             where c.tenant_id = r.tenant_id and c.module = 'tickets' and c.parent_id is null and c.is_active) < 8 then
      insert into public.ti_categories (tenant_id, module, name, is_active, sort_order)
      values (r.tenant_id, 'tickets', 'Infraestrutura', true, 50) returning id into v_infra;
    end if;
    if v_infra is not null then
      insert into public.ti_categories (tenant_id, module, name, parent_id, is_active, sort_order, interrupcao_tipo)
      select r.tenant_id, 'tickets', 'Queda de energia', v_infra, true, 50, 'luz'
       where not exists (select 1 from public.ti_categories j where j.parent_id = v_infra and lower(j.name) = 'queda de energia');
    end if;
  end loop;
end;
$$;
