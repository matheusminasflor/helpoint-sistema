-- ESTOQUE DE SUPRIMENTOS (dono, 2026-10-15): "setor de Compras ter estoque de ressuprimento: sempre que formos comprar
-- algo, selecionar em compras o produto que foi comprado para entrar no estoque, seja pela Caixinha, seja por compras em
-- geral; quando for saída, o usuário manualmente retira do estoque colocando a data de saída, quem retirou, hora e
-- motivo". Decisões (múltipla escolha): só os itens marcados como SUPRIMENTO no Catálogo (folhas, café, adoçante, copos,
-- papel higiênico — itens de TI e de outros setores ficam com o setor deles), com ESTOQUE MÍNIMO que avisa Compras.
--   * entrada: a compra registrada de um suprimento (inclusive pedido da Caixinha), pela quantidade aprovada; a saída
--     solta da Caixinha que diz qual suprimento comprou; e a entrada manual (ajuste);
--   * saída: manual — data e hora, quem retirou, motivo; o saldo não fica negativo;
--   * abaixo do mínimo: a equipe de Compras recebe "Repor <item>" uma vez, ao cruzar o mínimo.

alter table public.compras_produtos
  add column if not exists suprimento boolean not null default false,
  add column if not exists unidade text not null default 'un',
  add column if not exists estoque_minimo numeric(12,2) not null default 0 check (estoque_minimo >= 0);

create table if not exists public.estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  produto_id uuid not null references public.compras_produtos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  quantidade numeric(12,2) not null check (quantidade > 0),
  quando timestamptz not null default now(),
  -- Saída: quem retirou e por quê (obrigatórios). Entrada manual: o motivo do ajuste.
  retirado_por uuid references public.profiles(id) on delete set null,
  motivo text,
  purchase_request_id uuid references public.compras_solicitacoes(id) on delete cascade,
  caixinha_movimento_id uuid references public.caixinha_movimentos(id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint estoque_saida_diz_quem_e_por_que check (tipo = 'entrada' or (retirado_por is not null and nullif(btrim(motivo), '') is not null))
);
create unique index if not exists estoque_uma_entrada_por_compra on public.estoque_movimentos (purchase_request_id) where purchase_request_id is not null;
create index if not exists estoque_movimentos_produto on public.estoque_movimentos (produto_id, quando desc);
alter table public.estoque_movimentos enable row level security;

/** Ver, lançar ou apagar no estoque: o perfil de Compras (seção "Estoque"), o aprovador da Caixinha e o administrador. */
create or replace function public.pode_no_estoque(p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), 'compras', 'estoque', p_acao), false)
      or (p_acao in ('view', 'create') and auth.uid() = public.aprovador_da_caixinha(public.get_user_tenant_id()));
$$;
revoke all on function public.pode_no_estoque(text) from public, anon;
grant execute on function public.pode_no_estoque(text) to authenticated;

create policy estoque_le on public.estoque_movimentos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_estoque('view'));
create policy estoque_lanca on public.estoque_movimentos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_estoque('create')
              and purchase_request_id is null and caixinha_movimento_id is null and created_by = auth.uid());
create policy estoque_apaga on public.estoque_movimentos for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_estoque('delete')
         and purchase_request_id is null and caixinha_movimento_id is null);

create or replace function public.saldo_do_estoque(p_produto uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when tipo = 'entrada' then quantidade else -quantidade end), 0)
    from public.estoque_movimentos where produto_id = p_produto;
$$;
revoke all on function public.saldo_do_estoque(uuid) from public, anon;
grant execute on function public.saldo_do_estoque(uuid) to authenticated;

/** A saída não deixa o saldo negativo; cruzar o mínimo avisa Compras. */
create or replace function public.estoque_confere_saida()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_saldo numeric := public.saldo_do_estoque(new.produto_id);
  p public.compras_produtos%rowtype;
begin
  select * into p from public.compras_produtos where id = new.produto_id;
  if not p.suprimento then
    raise exception '"%" não é suprimento: marque "controla estoque" no Catálogo de Produtos.', p.name using errcode = '23514';
  end if;
  if new.tipo = 'saida' and v_saldo - new.quantidade < 0 then
    raise exception 'O estoque de "%" tem % %: não dá para tirar %.', p.name, v_saldo, p.unidade, new.quantidade using errcode = '23514';
  end if;
  if new.tipo = 'saida' and p.estoque_minimo > 0 and v_saldo >= p.estoque_minimo and v_saldo - new.quantidade < p.estoque_minimo then
    insert into public.notifications (tenant_id, user_id, type, reference_type, title, message, email_sent)
    select new.tenant_id, u, 'reminder', 'estoque',
           'Repor ' || p.name,
           'O estoque de ' || p.name || ' ficou em ' || (v_saldo - new.quantidade) || ' ' || p.unidade
             || ' (mínimo ' || p.estoque_minimo || '). Abra o pedido de compra em Nova solicitação › Compras.',
           false
      from unnest(public.notification_team(new.tenant_id, 'compras')) u;
  end if;
  return new;
end;
$$;
revoke all on function public.estoque_confere_saida() from public, anon, authenticated;
drop trigger if exists trg_estoque_confere_saida on public.estoque_movimentos;
create trigger trg_estoque_confere_saida before insert on public.estoque_movimentos
  for each row execute function public.estoque_confere_saida();

-- A compra registrada de um suprimento entra no estoque; desfeita, sai.
create or replace function public.compra_entra_no_estoque()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is null or new.status is not distinct from old.status then
    return null;
  end if;
  if old.status::text = 'completed' and new.status::text <> 'completed' then
    delete from public.estoque_movimentos where purchase_request_id = new.id;
    return null;
  end if;
  if new.status::text = 'completed'
     and exists (select 1 from public.compras_produtos p where p.id = new.product_id and p.suprimento) then
    insert into public.estoque_movimentos (tenant_id, produto_id, tipo, quantidade, motivo, purchase_request_id, created_by)
    values (new.tenant_id, new.product_id, 'entrada', coalesce(new.quantidade_aprovada, new.quantidade),
            'Compra registrada', new.id, new.executed_by)
    on conflict (purchase_request_id) where purchase_request_id is not null do nothing;
  end if;
  return null;
end;
$$;
revoke all on function public.compra_entra_no_estoque() from public, anon, authenticated;
drop trigger if exists trg_compra_entra_no_estoque on public.compras_solicitacoes;
create trigger trg_compra_entra_no_estoque after update of status on public.compras_solicitacoes
  for each row execute function public.compra_entra_no_estoque();

-- A saída solta da Caixinha pode dizer qual suprimento comprou (e quanto): entra no estoque.
alter table public.caixinha_movimentos
  add column if not exists produto_id uuid references public.compras_produtos(id) on delete set null,
  add column if not exists quantidade numeric(12,2) check (quantidade is null or quantidade > 0);

create or replace function public.caixinha_entra_no_estoque()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'saida' and new.produto_id is not null and new.quantidade is not null and new.purchase_request_id is null
     and exists (select 1 from public.compras_produtos p where p.id = new.produto_id and p.suprimento) then
    insert into public.estoque_movimentos (tenant_id, produto_id, tipo, quantidade, motivo, caixinha_movimento_id, created_by)
    values (new.tenant_id, new.produto_id, 'entrada', new.quantidade, 'Comprado pela Caixinha: ' || new.descricao, new.id, new.created_by);
  end if;
  return null;
end;
$$;
revoke all on function public.caixinha_entra_no_estoque() from public, anon, authenticated;
drop trigger if exists trg_caixinha_entra_no_estoque on public.caixinha_movimentos;
create trigger trg_caixinha_entra_no_estoque after insert on public.caixinha_movimentos
  for each row execute function public.caixinha_entra_no_estoque();

-- O perfil de Compras ganha a seção Estoque: o Gestor inteira, o Operador vê e lança.
update public.access_profiles
   set permissions = permissions || '{"estoque": {"view": true, "create": true, "delete": true}}'::jsonb
 where department = 'compras' and name = 'Gestor';
update public.access_profiles
   set permissions = permissions || '{"estoque": {"view": true, "create": true, "delete": false}}'::jsonb
 where department = 'compras' and name = 'Operador';
