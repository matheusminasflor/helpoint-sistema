-- ESTOQUE DO MARKETING (dono, 2026-10-19): "Marketing precisa de Estoque e não inventário, pois precisa por quantidade
-- dos produtos e entrada e saída, ou seja controle do estoque". Decisões (múltipla escolha): estoque PRÓPRIO do Marketing
-- (cadastro e saldo separados do estoque de suprimentos de Compras); o Inventário sai do menu do Marketing e o Estoque
-- entra no lugar; a entrada é manual E pela compra registrada.
--   * produto: nome, unidade, categoria, local, estoque mínimo; opcionalmente ligado a um produto do Catálogo de Compras
--     — a compra registrada desse produto entra sozinha no estoque, pela quantidade aprovada (como os suprimentos);
--   * saída: data e hora, quem retirou, motivo; o saldo não fica negativo;
--   * abaixo do mínimo: o Marketing recebe "Repor <item>" uma vez, ao cruzar o mínimo.
-- Os 10 itens que a equipe lançou no Inventário em 2026-10-16 (a quantidade escrita nas observações: "3 unidades") passam
-- para cá com essa quantidade de saldo inicial. `mkt_assets` fica como está (só sai do menu).

create table if not exists public.mkt_estoque_produtos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  unidade text not null default 'un' check (btrim(unidade) <> ''),
  categoria text,
  local text,
  estoque_minimo numeric(12,2) not null default 0 check (estoque_minimo >= 0),
  compras_produto_id uuid references public.compras_produtos(id) on delete set null,
  ativo boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists mkt_estoque_produto_nome_unico on public.mkt_estoque_produtos (tenant_id, lower(btrim(nome)));
create unique index if not exists mkt_estoque_um_por_produto_de_compra on public.mkt_estoque_produtos (compras_produto_id)
  where compras_produto_id is not null;
alter table public.mkt_estoque_produtos enable row level security;

create table if not exists public.mkt_estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  produto_id uuid not null references public.mkt_estoque_produtos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  quantidade numeric(12,2) not null check (quantidade > 0),
  quando timestamptz not null default now(),
  retirado_por uuid references public.profiles(id) on delete set null,
  motivo text,
  purchase_request_id uuid references public.compras_solicitacoes(id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint mkt_estoque_saida_diz_quem_e_por_que
    check (tipo = 'entrada' or (retirado_por is not null and nullif(btrim(motivo), '') is not null))
);
create unique index if not exists mkt_estoque_uma_entrada_por_compra on public.mkt_estoque_movimentos (purchase_request_id)
  where purchase_request_id is not null;
create index if not exists mkt_estoque_movimentos_produto on public.mkt_estoque_movimentos (produto_id, quando desc);
alter table public.mkt_estoque_movimentos enable row level security;

/** A seção "Estoque" do perfil do Marketing (Ver / Criar / Editar / Excluir), e o administrador. */
create or replace function public.pode_no_estoque_mkt(p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), 'marketing', 'estoque', p_acao), false);
$$;
revoke all on function public.pode_no_estoque_mkt(text) from public, anon;
grant execute on function public.pode_no_estoque_mkt(text) to authenticated;

-- Produto: ver com "Ver"; cadastrar e mudar com "Editar" (o cadastro do item é decisão de quem cuida do estoque, lançar
-- entrada e saída é o dia a dia — "Criar"). Não se apaga: inativa (o histórico de movimentos aponta para ele).
create policy mkt_estoque_produtos_le on public.mkt_estoque_produtos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_estoque_mkt('view'));
create policy mkt_estoque_produtos_cria on public.mkt_estoque_produtos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_estoque_mkt('edit'));
create policy mkt_estoque_produtos_muda on public.mkt_estoque_produtos for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_estoque_mkt('edit'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_estoque_mkt('edit'));

create policy mkt_estoque_le on public.mkt_estoque_movimentos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_estoque_mkt('view'));
create policy mkt_estoque_lanca on public.mkt_estoque_movimentos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_estoque_mkt('create')
              and purchase_request_id is null and created_by = auth.uid());
create policy mkt_estoque_apaga on public.mkt_estoque_movimentos for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_estoque_mkt('delete')
         and purchase_request_id is null);

create or replace function public.saldo_do_estoque_mkt(p_produto uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when tipo = 'entrada' then quantidade else -quantidade end), 0)
    from public.mkt_estoque_movimentos where produto_id = p_produto;
$$;
revoke all on function public.saldo_do_estoque_mkt(uuid) from public, anon;
grant execute on function public.saldo_do_estoque_mkt(uuid) to authenticated;

/** A saída não deixa o saldo negativo; cruzar o mínimo avisa o Marketing. */
create or replace function public.mkt_estoque_confere_saida()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_saldo numeric := public.saldo_do_estoque_mkt(new.produto_id);
  p public.mkt_estoque_produtos%rowtype;
begin
  if new.tipo <> 'saida' then
    return new;
  end if;
  select * into p from public.mkt_estoque_produtos where id = new.produto_id;
  if v_saldo - new.quantidade < 0 then
    raise exception 'O estoque de "%" tem % %: não dá para tirar %.', p.nome, v_saldo, p.unidade, new.quantidade using errcode = '23514';
  end if;
  if p.estoque_minimo > 0 and v_saldo >= p.estoque_minimo and v_saldo - new.quantidade < p.estoque_minimo then
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
    select new.tenant_id, u, 'reminder', 'estoque_mkt', new.produto_id,
           'Repor ' || p.nome,
           'O estoque do Marketing de ' || p.nome || ' ficou em ' || (v_saldo - new.quantidade) || ' ' || p.unidade
             || ' (mínimo ' || p.estoque_minimo || ').',
           false
      from unnest(public.notification_team(new.tenant_id, 'marketing')) u;
  end if;
  return new;
end;
$$;
revoke all on function public.mkt_estoque_confere_saida() from public, anon, authenticated;
drop trigger if exists trg_mkt_estoque_confere_saida on public.mkt_estoque_movimentos;
create trigger trg_mkt_estoque_confere_saida before insert on public.mkt_estoque_movimentos
  for each row execute function public.mkt_estoque_confere_saida();

-- A compra registrada de um produto do Catálogo ligado ao estoque do Marketing entra nele; desfeita, sai.
create or replace function public.compra_entra_no_estoque_mkt()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_produto uuid;
begin
  if new.product_id is null or new.status is not distinct from old.status then
    return null;
  end if;
  if old.status::text = 'completed' and new.status::text <> 'completed' then
    delete from public.mkt_estoque_movimentos where purchase_request_id = new.id;
    return null;
  end if;
  if new.status::text = 'completed' then
    select id into v_produto from public.mkt_estoque_produtos
     where compras_produto_id = new.product_id and tenant_id = new.tenant_id;
    if v_produto is not null then
      insert into public.mkt_estoque_movimentos (tenant_id, produto_id, tipo, quantidade, motivo, purchase_request_id, created_by)
      values (new.tenant_id, v_produto, 'entrada', coalesce(new.quantidade_aprovada, new.quantidade),
              'Compra registrada', new.id, new.executed_by)
      on conflict (purchase_request_id) where purchase_request_id is not null do nothing;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.compra_entra_no_estoque_mkt() from public, anon, authenticated;
drop trigger if exists trg_compra_entra_no_estoque_mkt on public.compras_solicitacoes;
create trigger trg_compra_entra_no_estoque_mkt after update of status on public.compras_solicitacoes
  for each row execute function public.compra_entra_no_estoque_mkt();

-- O perfil do Marketing troca a seção "Inventário MKT" pela "Estoque", com as mesmas caixinhas marcadas.
update public.access_profiles
   set permissions = (permissions - 'inventory') || jsonb_build_object('estoque', jsonb_build_object(
         'view',   coalesce((permissions -> 'inventory' ->> 'view')::boolean, false),
         'create', coalesce((permissions -> 'inventory' ->> 'create')::boolean, false),
         'edit',   coalesce((permissions -> 'inventory' ->> 'edit')::boolean, false),
         'delete', coalesce((permissions -> 'inventory' ->> 'delete')::boolean, false)))
 where department = 'marketing' and permissions ? 'inventory';
update public.user_access_profiles
   set overrides = (overrides - 'inventory') || jsonb_build_object('estoque', overrides -> 'inventory')
 where department = 'marketing' and overrides ? 'inventory';

-- Os itens do Inventário do Marketing viram produtos do estoque; a quantidade das observações vira o saldo inicial.
insert into public.mkt_estoque_produtos (tenant_id, nome, categoria, local, created_by, created_at)
select a.tenant_id, btrim(a.name), a.category, a.location, a.created_by, a.created_at
  from public.mkt_assets a
 where btrim(coalesce(a.name, '')) <> ''
on conflict do nothing;

insert into public.mkt_estoque_movimentos (tenant_id, produto_id, tipo, quantidade, quando, motivo, created_by)
select p.tenant_id, p.id, 'entrada', substring(a.notes from '(\d+)')::numeric, a.created_at,
       'Saldo inicial (vindo do Inventário)', a.created_by
  from public.mkt_assets a
  join public.mkt_estoque_produtos p on p.tenant_id = a.tenant_id and lower(p.nome) = lower(btrim(a.name))
 where substring(a.notes from '(\d+)')::numeric > 0;
