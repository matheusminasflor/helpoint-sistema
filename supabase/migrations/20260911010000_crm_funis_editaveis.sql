-- Leva E1 (ADR-007): funil editável — vários funis por empresa, etapas com
-- ordem, cor e tipo editáveis, criar e apagar etapa. 2026-09-11.
--
-- Referência de produto: no Twenty CRM a etapa é uma opção de lista com
-- `label/color/position` guardadas como dado (docs/pesquisa-twenty-crm.md,
-- seção 3). Aqui a etapa já era tabela (CRM-1); esta migration só a liga a um
-- funil e lhe dá cor.
--
-- O que muda, em uma frase cada:
--   crm_pipelines                 o funil: nome e posição; um é o padrão por empresa
--   crm_pipeline_stages           ganha pipeline_id (obrigatório) e color
--   "um ganho e um perdido"       passa a valer POR FUNIL, não por empresa
--   crm_delete_stage(etapa, para) apaga etapa movendo os negócios antes
--   crm_orders_on_paid            "ganho" é o da etapa atual do negócio, não o único da empresa
--   seed_crm_stages               semeia o funil padrão + as 6 etapas
--
-- Fora, de propósito: apagar um funil (não há pedido; quando houver, é a
-- mesma receita da etapa: mover tudo, depois apagar).

-- ───────────────────────────────────────────────────────────────────────────
-- O funil
-- ───────────────────────────────────────────────────────────────────────────
create table public.crm_pipelines (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  position   integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_pipelines_tenant_idx on public.crm_pipelines (tenant_id, position);
create unique index crm_pipelines_one_default_idx on public.crm_pipelines (tenant_id) where is_default;

create trigger inject_tenant_id_crm_pipelines before insert on public.crm_pipelines for each row execute function public.inject_tenant_id();
create trigger handle_crm_pipelines_updated_at before update on public.crm_pipelines for each row execute function public.handle_updated_at();

alter table public.crm_pipelines enable row level security;
create policy "Comercial reads crm_pipelines"   on public.crm_pipelines for select to authenticated using (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid()));
create policy "Comercial inserts crm_pipelines" on public.crm_pipelines for insert to authenticated with check (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid()));
create policy "Comercial updates crm_pipelines" on public.crm_pipelines for update to authenticated using (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid())) with check (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid()));
create policy "Managers delete crm_pipelines"   on public.crm_pipelines for delete to authenticated using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));

-- ───────────────────────────────────────────────────────────────────────────
-- A etapa ganha funil e cor
-- ───────────────────────────────────────────────────────────────────────────
alter table public.crm_pipeline_stages
  add column pipeline_id uuid references public.crm_pipelines(id) on delete restrict,
  -- Nome de cor da paleta, não hex: quem pinta é o front, conforme o tema (regra `helpoint/cor-fixa`).
  add column color text not null default 'slate'
    check (color in ('slate', 'blue', 'green', 'amber', 'red', 'violet', 'pink', 'teal'));

-- Backfill: um funil padrão por empresa que já tem etapas; as etapas apontam para ele.
insert into public.crm_pipelines (tenant_id, name, position, is_default)
select distinct tenant_id, 'Funil de vendas', 1, true from public.crm_pipeline_stages;

update public.crm_pipeline_stages s
   set pipeline_id = p.id
  from public.crm_pipelines p
 where p.tenant_id = s.tenant_id and p.is_default;

alter table public.crm_pipeline_stages alter column pipeline_id set not null;

-- "Um ganho e um perdido" passa a ser por funil.
drop index if exists public.crm_pipeline_stages_one_won_idx;
drop index if exists public.crm_pipeline_stages_one_lost_idx;
create unique index crm_pipeline_stages_one_won_idx  on public.crm_pipeline_stages (pipeline_id) where kind = 'won';
create unique index crm_pipeline_stages_one_lost_idx on public.crm_pipeline_stages (pipeline_id) where kind = 'lost';
create index crm_pipeline_stages_pipeline_idx on public.crm_pipeline_stages (pipeline_id, position);

-- A etapa tem de ser do mesmo tenant do funil (o RLS já garante para o
-- cliente; isto fecha o caminho para quem escreve com service role).
create or replace function public.crm_stage_check_pipeline_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.crm_pipelines where id = new.pipeline_id and tenant_id = new.tenant_id) then
    raise exception 'etapa e funil de empresas diferentes';
  end if;
  return new;
end;
$$;
create trigger trg_crm_stage_check_pipeline_tenant
  before insert or update of pipeline_id, tenant_id on public.crm_pipeline_stages
  for each row execute function public.crm_stage_check_pipeline_tenant();

-- ───────────────────────────────────────────────────────────────────────────
-- Semente: funil padrão + 6 etapas (substitui a versão do CRM-1)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.seed_crm_stages(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pipeline uuid;
begin
  if exists (select 1 from public.crm_pipelines where tenant_id = p_tenant_id) then
    return;
  end if;
  insert into public.crm_pipelines (tenant_id, name, position, is_default)
  values (p_tenant_id, 'Funil de vendas', 1, true)
  returning id into v_pipeline;

  insert into public.crm_pipeline_stages (tenant_id, pipeline_id, name, position, kind, color) values
    (p_tenant_id, v_pipeline, 'Novo',               1, 'open', 'blue'),
    (p_tenant_id, v_pipeline, 'Em contato',         2, 'open', 'teal'),
    (p_tenant_id, v_pipeline, 'Orçamento enviado',  3, 'open', 'violet'),
    (p_tenant_id, v_pipeline, 'Negociação',         4, 'open', 'amber'),
    (p_tenant_id, v_pipeline, 'Ganho',              5, 'won',  'green'),
    (p_tenant_id, v_pipeline, 'Perdido',            6, 'lost', 'red');
end;
$$;
revoke all on function public.seed_crm_stages(uuid) from public, anon, authenticated;

-- Etapas antigas ganham as cores da semente (só as que ainda estão em 'slate').
update public.crm_pipeline_stages s
   set color = c.color
  from (values ('open', 1, 'blue'), ('open', 2, 'teal'), ('open', 3, 'violet'), ('open', 4, 'amber'), ('won', 5, 'green'), ('lost', 6, 'red'))
       as c(kind, position, color)
 where s.kind = c.kind and s.position = c.position and s.color = 'slate';

-- ───────────────────────────────────────────────────────────────────────────
-- Apagar etapa: move os negócios antes (dispara a linha do tempo), depois apaga
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.crm_delete_stage(p_stage uuid, p_move_to uuid default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stage   public.crm_pipeline_stages;
  v_target  public.crm_pipeline_stages;
  v_deals   integer;
begin
  select * into v_stage from public.crm_pipeline_stages where id = p_stage;
  if v_stage.id is null then
    raise exception 'etapa não encontrada';
  end if;
  if v_stage.kind <> 'open' then
    raise exception 'as etapas Ganho e Perdido não podem ser apagadas';
  end if;

  select count(*) into v_deals from public.crm_deals where stage_id = p_stage;
  if v_deals > 0 then
    if p_move_to is null then
      raise exception 'a etapa tem % negócio(s): escolha para onde movê-los', v_deals;
    end if;
    select * into v_target from public.crm_pipeline_stages where id = p_move_to;
    if v_target.id is null or v_target.tenant_id <> v_stage.tenant_id then
      raise exception 'etapa de destino não encontrada';
    end if;
    if v_target.id = v_stage.id then
      raise exception 'a etapa de destino é a própria etapa';
    end if;
    update public.crm_deals set stage_id = p_move_to where stage_id = p_stage;
  end if;

  delete from public.crm_pipeline_stages where id = p_stage;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Mudança de etapa: quando troca de funil, a linha do tempo diz
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.crm_deals_on_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from record;
  v_to   record;
  v_text text;
begin
  select s.name, s.pipeline_id into v_from from public.crm_pipeline_stages s where s.id = old.stage_id;
  select s.name, s.kind, s.pipeline_id, p.name as pipeline_name
    into v_to
    from public.crm_pipeline_stages s join public.crm_pipelines p on p.id = s.pipeline_id
   where s.id = new.stage_id;

  if v_to.kind = 'won' then
    new.won_at := coalesce(new.won_at, now());
    new.lost_at := null;
  elsif v_to.kind = 'lost' then
    new.lost_at := coalesce(new.lost_at, now());
    new.won_at := null;
  else
    new.won_at := null;
    new.lost_at := null;
  end if;

  v_text := 'De "' || coalesce(v_from.name, '?') || '" para "' || v_to.name || '"';
  if v_from.pipeline_id is distinct from v_to.pipeline_id then
    v_text := v_text || ' (funil "' || v_to.pipeline_name || '")';
  end if;

  insert into public.crm_deal_activities (tenant_id, deal_id, author_id, kind, content, meta)
  values (new.tenant_id, new.id, auth.uid(), 'stage_change', v_text,
          jsonb_build_object('from', old.stage_id, 'to', new.stage_id));
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Pedido pago: o "ganho" é o do funil em que o negócio está
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.crm_orders_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_won   uuid;
  v_deal  public.crm_deals;
begin
  if new.status <> 'paid' or old.status = 'paid' then
    return new;
  end if;
  new.paid_at := coalesce(new.paid_at, now());

  if new.deal_id is not null then
    select * into v_deal from public.crm_deals where id = new.deal_id;
    select w.id into v_won
      from public.crm_pipeline_stages cur
      join public.crm_pipeline_stages w on w.pipeline_id = cur.pipeline_id and w.kind = 'won'
     where cur.id = v_deal.stage_id;

    insert into public.crm_deal_activities (tenant_id, deal_id, author_id, kind, content, meta)
    values (new.tenant_id, new.deal_id, null, 'payment',
            'Pedido #' || new.number || ' pago — R$ ' || public.fmt_brl(new.total),
            jsonb_build_object('order_id', new.id));

    if v_won is not null and v_deal.stage_id is distinct from v_won then
      update public.crm_deals set stage_id = v_won where id = new.deal_id;
    end if;

    perform public.notify_users(
      new.tenant_id,
      array[coalesce(v_deal.owner_id, new.created_by)],
      'order_paid', 'crm_deal', new.deal_id,
      'Pedido #' || new.number || ' foi pago',
      coalesce(v_deal.title, 'Negócio') || ' — R$ ' || public.fmt_brl(new.total)
    );
  end if;
  return new;
end;
$$;
