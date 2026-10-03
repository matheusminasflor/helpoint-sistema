-- RESPONSÁVEIS DA CATEGORIA (decisão do dono, 2026-10-03).
--
-- O dono: "atrelar uma categoria a um colaborador — no Marketing, criação de arte, rótulo e embalagens
-- é somente a Mel. Assim evita de a pessoa selecionar errado." Decisões (múltipla escolha):
--   * ao abrir o chamado, "Quem vai atender" vem PREENCHIDO E TRAVADO com o responsável;
--   * uma ou mais pessoas por categoria — com duas ou mais, quem abre escolhe SÓ entre elas;
--   * a subcategoria HERDA os responsáveis da categoria de cima, salvo se tiver os seus;
--   * ausência: quem configura o setor troca na configuração. Quem perdeu o acesso ao setor deixa de
--     contar, e o chamado cai na fila como antes.
-- A tela trava o campo; este trigger garante o mesmo para qualquer porta que grave chamado.

create table public.ti_category_responsaveis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid not null references public.ti_categories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (category_id, user_id)
);
create index ti_category_responsaveis_user_idx on public.ti_category_responsaveis (user_id);
alter table public.ti_category_responsaveis enable row level security;

-- Ler: a empresa toda (o formulário de abertura precisa saber). Mexer: quem configura o setor da
-- categoria — a mesma porta das próprias categorias (`ti_categories_quem_configura_*`).
create policy ti_category_responsaveis_select on public.ti_category_responsaveis for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy ti_category_responsaveis_insert on public.ti_category_responsaveis for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
              and exists (select 1 from public.ti_categories c
                           where c.id = category_id and c.tenant_id = ti_category_responsaveis.tenant_id
                             and public.pode_configurar_setor(c.module)));
create policy ti_category_responsaveis_delete on public.ti_category_responsaveis for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and exists (select 1 from public.ti_categories c
                      where c.id = category_id and public.pode_configurar_setor(c.module)));

-- Quem atende esta categoria: os próprios, ou os da categoria de cima quando ela não tem nenhum; e só
-- quem continua ativo e com o acesso ao setor. Lista vazia = sem responsável (fila do setor).
-- O tenant vem da categoria quando não há usuário (trigger chamado por cron ou função do sistema).
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
    select r.user_id from public.ti_category_responsaveis r join alvo on r.category_id = alvo.id
  ), escolhidos as (
    select user_id from proprios
    union
    select r.user_id from public.ti_category_responsaveis r join alvo on r.category_id = alvo.parent_id
     where not exists (select 1 from proprios)
  )
  select p.id, p.full_name
    from escolhidos e
    join public.profiles p on p.id = e.user_id
    join alvo on p.tenant_id = alvo.tenant_id
   where coalesce(p.is_active, true)
     and exists (select 1 from public.user_module_access m
                  where m.user_id = p.id and m.module = public.setor_do_modulo(alvo.module))
   order by coalesce(p.full_name, p.email);
$$;
revoke all on function public.responsaveis_da_categoria(uuid) from public, anon;
grant execute on function public.responsaveis_da_categoria(uuid) to authenticated;

-- O chamado vai para o responsável. Com um só, ele é o atendente; com vários, quem abre tem de
-- escolher um deles (a tela já obriga). Escrita de sistema sem escolha cai na fila.
create or replace function public.chamado_vai_para_o_responsavel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_resp uuid[];
begin
  if new.category_id is null then
    return new;
  end if;
  select array_agg(r.id) into v_resp from public.responsaveis_da_categoria(new.category_id) r;
  if v_resp is null or new.assigned_to = any (v_resp) then
    return new;
  end if;
  if array_length(v_resp, 1) = 1 then
    new.assigned_to := v_resp[1];
  elsif auth.uid() is not null then
    raise exception 'Esta categoria é atendida por pessoas definidas: escolha uma delas em "Quem vai atender".'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.chamado_vai_para_o_responsavel() from public, anon;
create trigger trg_chamado_vai_para_o_responsavel before insert on public.tickets
  for each row execute function public.chamado_vai_para_o_responsavel();
