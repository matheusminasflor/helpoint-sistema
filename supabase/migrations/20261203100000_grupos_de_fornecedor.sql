-- GRUPOS DE FORNECEDOR (decisão do dono, 2026-10-04).
--
-- O dono: "fornecedores por grupos … ter como criar os grupos, porque aí fica mais fácil de
-- visualizar quem são os fornecedores de quê". Até aqui o fornecedor tinha UMA categoria fixa
-- (`suppliers.category`, enum `supplier_category` com 8 valores que ninguém mudava). Decisões:
--   * um fornecedor pode estar em VÁRIOS grupos (a gráfica que também faz brindes aparece nos dois);
--   * grupo é da empresa: cria, renomeia e apaga quem cria e edita fornecedor — a mesma caixinha
--     "Fornecedores" que já escreve em `suppliers` (Marketing ou Compras, a tela é a mesma);
--   * os 8 valores de hoje entram como grupos iniciais (semente = exemplo, dá para renomear e
--     apagar), e o fornecedor que já tem categoria vira membro do grupo correspondente.
-- Apagar grupo só desfaz a ligação; o fornecedor fica.
--
-- ponytail: a coluna `suppliers.category` (e o enum) fica no banco, sem uso pela tela — tirá-la
-- agora obrigaria mexer em quem ainda a lê (types, métricas) na mesma leva. Teto: duas fontes para
-- "de que é o fornecedor" enquanto ela existir. Saída: migration que faz `drop column category` e
-- `drop type supplier_category` quando nada mais a ler.

-- ─── 1. Quem escreve: a porta que já escreve em `suppliers` ───────────────────────────────────
-- Criar OU editar, no Marketing OU em Compras (as policies de `suppliers`, 20261124010000 e
-- 20261125010000). Uma função para as cinco policies abaixo não divergirem.
create or replace function public.pode_editar_fornecedores()
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select public.pode_no_setor('marketing', 'suppliers', 'create')
      or public.pode_no_setor('marketing', 'suppliers', 'edit')
      or public.pode_no_setor('compras', 'fornecedores', 'create')
      or public.pode_no_setor('compras', 'fornecedores', 'edit');
$$;
revoke all on function public.pode_editar_fornecedores() from public, anon;
grant execute on function public.pode_editar_fornecedores() to authenticated;

-- ─── 2. Os grupos ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.fornecedor_grupos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id()
    references public.tenants(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, tenant_id)
);

-- "Gráfica" e "gráfica " são o mesmo grupo.
create unique index if not exists fornecedor_grupos_nome_unico
  on public.fornecedor_grupos (tenant_id, lower(btrim(nome)));

comment on table public.fornecedor_grupos is
  'Grupos de fornecedor da empresa (decisão do dono, 2026-10-04). Um fornecedor pode estar em vários.';

alter table public.fornecedor_grupos enable row level security;
revoke all on public.fornecedor_grupos from anon;

-- Ler: como os fornecedores — a empresa toda.
drop policy if exists fornecedor_grupos_le on public.fornecedor_grupos;
create policy fornecedor_grupos_le on public.fornecedor_grupos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));

-- Criar, renomear, apagar: quem edita fornecedor. O `with check` repete o `using` (lição 15).
drop policy if exists fornecedor_grupos_altera on public.fornecedor_grupos;
create policy fornecedor_grupos_altera on public.fornecedor_grupos for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_editar_fornecedores()))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_editar_fornecedores()));

-- ─── 3. Quem está em que grupo ────────────────────────────────────────────────────────────────
create table if not exists public.fornecedor_grupo_membros (
  tenant_id uuid not null default public.get_user_tenant_id()
    references public.tenants(id) on delete cascade,
  supplier_id uuid not null,
  grupo_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (supplier_id, grupo_id),
  -- As duas pontas na MESMA empresa; apagar o grupo ou o fornecedor desfaz só a ligação.
  foreign key (supplier_id, tenant_id) references public.suppliers (id, tenant_id) on delete cascade,
  foreign key (grupo_id, tenant_id) references public.fornecedor_grupos (id, tenant_id) on delete cascade
);

create index if not exists fornecedor_grupo_membros_grupo_idx on public.fornecedor_grupo_membros (grupo_id);

alter table public.fornecedor_grupo_membros enable row level security;
revoke all on public.fornecedor_grupo_membros from anon;

drop policy if exists fornecedor_grupo_membros_le on public.fornecedor_grupo_membros;
create policy fornecedor_grupo_membros_le on public.fornecedor_grupo_membros for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));

-- Sem UPDATE: a ligação é a chave inteira; muda tirando e pondo.
drop policy if exists fornecedor_grupo_membros_liga on public.fornecedor_grupo_membros;
create policy fornecedor_grupo_membros_liga on public.fornecedor_grupo_membros for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_editar_fornecedores()));
drop policy if exists fornecedor_grupo_membros_desliga on public.fornecedor_grupo_membros;
create policy fornecedor_grupo_membros_desliga on public.fornecedor_grupo_membros for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_editar_fornecedores()));

-- ─── 4. A semente: os 8 de hoje, na empresa que existe e na que nascer ────────────────────────
-- Molde de `com_semear_familias`: rodar de novo não ressuscita o que a empresa renomeou ou apagou
-- (só cria o nome que ainda não existe).
create or replace function public.semear_grupos_de_fornecedor(p_tenant uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.fornecedor_grupos (tenant_id, nome)
  select p_tenant, s.nome
    from (values ('Gráfica'), ('Produção'), ('Mídia'), ('Eventos'), ('Brindes'), ('Digital'),
                 ('Audiovisual'), ('Outro')) as s(nome)
   where not exists (select 1 from public.fornecedor_grupos g
                      where g.tenant_id = p_tenant and lower(btrim(g.nome)) = lower(s.nome));
$$;
revoke all on function public.semear_grupos_de_fornecedor(uuid) from public, anon, authenticated;

create or replace function public.semear_grupos_de_fornecedor_on_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.semear_grupos_de_fornecedor(new.id);
  return new;
end;
$$;
revoke all on function public.semear_grupos_de_fornecedor_on_tenant() from public, anon;

drop trigger if exists trg_semear_grupos_de_fornecedor on public.tenants;
create trigger trg_semear_grupos_de_fornecedor
  after insert on public.tenants
  for each row execute function public.semear_grupos_de_fornecedor_on_tenant();

select public.semear_grupos_de_fornecedor(t.id) from public.tenants t;

-- O fornecedor que já tem categoria entra no grupo dela. "Outro" era o PADRÃO da coluna (quem não
-- escolhia caía nele), não uma escolha: esse fica "Sem grupo".
insert into public.fornecedor_grupo_membros (tenant_id, supplier_id, grupo_id)
select s.tenant_id, s.id, g.id
  from public.suppliers s
  join public.fornecedor_grupos g
    on g.tenant_id = s.tenant_id
   and lower(g.nome) = lower(case s.category::text
         when 'grafica' then 'Gráfica' when 'producao' then 'Produção' when 'midia' then 'Mídia'
         when 'eventos' then 'Eventos' when 'brindes' then 'Brindes' when 'digital' then 'Digital'
         when 'audiovisual' then 'Audiovisual' end)
 where s.category::text <> 'outro'
on conflict do nothing;
