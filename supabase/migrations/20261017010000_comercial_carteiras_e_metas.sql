-- Carteiras e metas do Comercial (L6d). Ver .scratch/plano-l6d-metas-e-
-- carteiras.md e docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §14/§15.
-- Idempotente: pode ser reaplicada sem erro.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Acesso à Diretoria (molde literal de has_comercial_access/has_fin_
-- access): a Diretoria (L5, decisão D6) nasceu "visão", sem tabela própria,
-- e por isso nunca precisou de um `has_X_access` — a concessão do módulo
-- bastava para abrir a tela. `com_metas` muda isso: quem só tem a Diretoria
-- concedida (sem o módulo Comercial) também precisa ENXERGAR a meta. Sem
-- esta função, a única porta de leitura seria `has_comercial_access`, e um
-- diretor sem acesso ao Comercial veria a aba Metas vazia dentro do próprio
-- painel da Diretoria.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.has_diretoria_access(_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_module_access
    where user_id = _user_id and module = 'diretoria'
  ) or public.is_supervisor_or_higher(_user_id)
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. com_carteiras — nasce com as quatro do dono, pelo MESMO trigger de
-- criação de empresa que a L6c usou para a grade de cashback (`after insert
-- on tenants`). Um `insert … from tenants` reprovaria de novo a auditoria: no
-- go-live a migration roda ANTES de a empresa existir (docs/deploy.md, passo
-- 1 antes do passo 6) — aquele insert não acharia tenant nenhum.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.com_carteiras (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id(),
  nome text not null,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, nome)
);

create table if not exists public.com_carteira_membros (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id(),
  carteira_id uuid not null references public.com_carteiras(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Uma pessoa tem UMA carteira; uma carteira tem várias pessoas — "cada um
  -- do comercial e sua respectiva carteira" (palavras do dono).
  unique (tenant_id, user_id)
);

alter table public.com_clientes
  add column if not exists carteira_id uuid references public.com_carteiras(id) on delete set null;

-- `com_importar_clientes` (20261014010000) NÃO lista `carteira_id` entre as
-- colunas do `on conflict do update set` — de propósito, não por omissão.
-- Reimportar o CSV do Forteplus não pode apagar o trabalho de quem atribuiu
-- a carteira: a coluna é atributo do SISTEMA (decisão do dono), a tabela de
-- preço é atributo do CSV. O teste 5 da suíte prova isto reimportando.
comment on column public.com_clientes.carteira_id is
  'Atribuída pelo supervisor/admin (RPC com_atribuir_carteira), nunca pelo CSV. com_importar_clientes não toca esta coluna.';

create or replace function public.com_semear_carteiras(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.com_carteiras (tenant_id, nome)
  values
    (p_tenant_id, 'VIP'),
    (p_tenant_id, 'MG'),
    (p_tenant_id, 'Demais Estados'),
    (p_tenant_id, 'Berçário')
  on conflict (tenant_id, nome) do nothing;
end;
$$;
revoke all on function public.com_semear_carteiras(uuid) from public, anon, authenticated;

create or replace function public.com_semear_carteiras_on_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.com_semear_carteiras(new.id);
  return new;
end;
$$;

drop trigger if exists trg_com_semear_carteiras on public.tenants;
create trigger trg_com_semear_carteiras
  after insert on public.tenants
  for each row execute function public.com_semear_carteiras_on_tenant();

-- Backfill: tenants que já existem (test-helpoint incluso) também recebem as
-- quatro carteiras, sem duplicar (on conflict do nothing).
do $$
declare t record;
begin
  for t in select id from public.tenants loop
    perform public.com_semear_carteiras(t.id);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. com_metas — `carteira_id` nulo é a meta TOTAL da empresa (o §15 tem as
-- duas: o total no topo e a grade por carteira). O índice único comum não
-- pega duplicata em coluna nula (NULL nunca é igual a NULL no Postgres); por
-- isso o índice usa `coalesce` para um sentinela — é isso que faz o teste 4
-- (duas metas totais no mesmo mês) reprovar de verdade.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.com_metas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id(),
  ano int not null check (ano between 2020 and 2100),
  mes int not null check (mes between 1 and 12),
  carteira_id uuid references public.com_carteiras(id) on delete cascade,
  valor numeric(14,2) not null check (valor >= 0),
  definida_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists com_metas_unica
  on public.com_metas (tenant_id, ano, mes, coalesce(carteira_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.com_carteiras enable row level security;
alter table public.com_carteira_membros enable row level security;
alter table public.com_metas enable row level security;

drop policy if exists com_carteiras_select on public.com_carteiras;
create policy com_carteiras_select on public.com_carteiras for select
  using (tenant_id = (select public.get_user_tenant_id())
     and (select public.has_comercial_access(auth.uid())));

drop policy if exists com_carteiras_insert on public.com_carteiras;
create policy com_carteiras_insert on public.com_carteiras for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'carteiras', 'gerir'))));

drop policy if exists com_carteiras_update on public.com_carteiras;
create policy com_carteiras_update on public.com_carteiras for update
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'carteiras', 'gerir'))))
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'carteiras', 'gerir'))));

drop policy if exists com_carteiras_delete on public.com_carteiras;
create policy com_carteiras_delete on public.com_carteiras for delete
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'carteiras', 'gerir'))));

drop policy if exists com_carteira_membros_select on public.com_carteira_membros;
create policy com_carteira_membros_select on public.com_carteira_membros for select
  using (tenant_id = (select public.get_user_tenant_id())
     and (select public.has_comercial_access(auth.uid())));

drop policy if exists com_carteira_membros_insert on public.com_carteira_membros;
create policy com_carteira_membros_insert on public.com_carteira_membros for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'carteiras', 'gerir'))));

drop policy if exists com_carteira_membros_update on public.com_carteira_membros;
create policy com_carteira_membros_update on public.com_carteira_membros for update
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'carteiras', 'gerir'))))
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'carteiras', 'gerir'))));

drop policy if exists com_carteira_membros_delete on public.com_carteira_membros;
create policy com_carteira_membros_delete on public.com_carteira_membros for delete
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'carteiras', 'gerir'))));

-- A atribuição de carteira ao CLIENTE é uma segunda policy de UPDATE sobre
-- `com_clientes`, ao lado da que já existe (`com_clientes_update`, gate por
-- `vendas.importar`). Postgres combina policies permissivas do MESMO comando
-- com OR — então quem só tem `carteiras.gerir` também consegue este UPDATE,
-- sem abrir a policy antiga (que fica intocada) para uma permissão que não é
-- dela. É o "com a mesma permissão" do plano, e é o que faz `com_atribuir_
-- carteira` (§4) dispensar checagem manual: RLS decide, e regra 12 vale — um
-- UPDATE sem permissão afeta zero linhas, não levanta erro.
drop policy if exists com_clientes_carteira_update on public.com_clientes;
create policy com_clientes_carteira_update on public.com_clientes for update
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'carteiras', 'gerir'))))
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'carteiras', 'gerir'))));

drop policy if exists com_metas_select on public.com_metas;
create policy com_metas_select on public.com_metas for select
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.has_comercial_access(auth.uid()))
       or (select public.has_diretoria_access(auth.uid()))));

drop policy if exists com_metas_insert on public.com_metas;
create policy com_metas_insert on public.com_metas for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

drop policy if exists com_metas_update on public.com_metas;
create policy com_metas_update on public.com_metas for update
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))))
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'metas', 'definir'))));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. com_atribuir_carteira — atribui em lote, por código OU por tabela de
-- preço (nunca as duas fundidas: OR explícito no where). `p_carteira_id`
-- nulo TIRA a carteira (o cliente volta a "sem carteira"). SECURITY INVOKER
-- de propósito (§3 acima): a permissão inteira é a policy de UPDATE de
-- `com_clientes`, não uma checagem duplicada aqui dentro.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_atribuir_carteira(
  p_carteira_id uuid,
  p_codigos text[] default null,
  p_tabela_base text default null
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_qtd int;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  if p_codigos is null and p_tabela_base is null then
    raise exception 'Informe uma lista de códigos ou uma tabela de preço.';
  end if;

  -- A FK de `carteira_id` não sabe de tenant (é só id → id): sem esta
  -- conferência, um `p_carteira_id` de OUTRA empresa passaria pela RLS de
  -- `com_clientes` (que olha o tenant do CLIENTE, não o da carteira) e
  -- misturaria dado entre empresas — a mesma classe de furo que a regra de
  -- isolamento deste sistema nunca permite (teste 10).
  if p_carteira_id is not null and not exists (
    select 1 from public.com_carteiras where id = p_carteira_id and tenant_id = v_tenant_id
  ) then
    raise exception 'Carteira não pertence a esta empresa.';
  end if;

  with atualizados as (
    update public.com_clientes
    set carteira_id = p_carteira_id
    where tenant_id = v_tenant_id
      and (
        (p_codigos is not null and codigo = any(p_codigos))
        or (p_tabela_base is not null and tabela_base = p_tabela_base)
      )
    returning id
  )
  select count(*) into v_qtd from atualizados;

  return v_qtd;
end;
$$;

grant execute on function public.com_atribuir_carteira(uuid, text[], text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. com_metas_x_realizado — por (competência, carteira). "Realizado" é a
-- MESMA venda líquida do resto do painel (valor_curva sobre venda+devolução:
-- molde de com_faturamento_mensal) — bonificação nunca entra aqui, só na
-- conciliação (§6). Enumera os 12 meses do ano (a grade não desaparece num
-- mês sem venda) × carteiras reais + o balde "Sem carteira".
--
-- Cuidado que não é óbvio: `carteira_id is null` significa DUAS coisas
-- diferentes em DUAS tabelas. Em `com_clientes`, é "cliente sem carteira".
-- Em `com_metas`, é "meta TOTAL da empresa" (§2 acima) — outra grandeza, não
-- o alvo do balde "Sem carteira". Por isso o `meta` do balde "Sem carteira"
-- é SEMPRE nulo: a junção com `com_metas` só acontece quando `g.carteira_id`
-- não é nulo. Não existe forma de definir meta para "Sem carteira" nesta
-- função — a meta total da empresa é outra linha, lida direto de `com_metas`
-- pela tela (é dado do dono, não precisa de RPC para um select simples).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_metas_x_realizado(p_ano int, p_filial text default null)
returns table (
  competencia date,
  carteira_id uuid,
  carteira_nome text,
  meta numeric,
  realizado numeric,
  cobertura numeric,
  peso numeric
)
language sql stable security invoker
set search_path = public
as $$
  with meses as (
    select generate_series(make_date(p_ano, 1, 1), make_date(p_ano, 12, 1), interval '1 month')::date as competencia
  ),
  carteiras_do_tenant as (
    select id, nome from public.com_carteiras where tenant_id = (select public.get_user_tenant_id())
    union all
    select null::uuid, 'Sem carteira'
  ),
  realizado_por_carteira as (
    select
      i.competencia,
      c.carteira_id,
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as realizado
    from public.com_vendas_itens i
    left join public.com_clientes c
      on c.tenant_id = (select public.get_user_tenant_id()) and c.codigo = i.cliente_codigo
    where extract(year from i.competencia) = p_ano
      and (p_filial is null or i.filial = p_filial)
    group by i.competencia, c.carteira_id
  ),
  total_por_mes as (
    select competencia, sum(realizado) as total from realizado_por_carteira group by competencia
  ),
  metas_do_ano as (
    select mes, carteira_id, valor from public.com_metas
    where tenant_id = (select public.get_user_tenant_id()) and ano = p_ano
  ),
  grade as (
    select m.competencia, ct.id as carteira_id, ct.nome as carteira_nome
    from meses m cross join carteiras_do_tenant ct
  )
  select
    g.competencia,
    g.carteira_id,
    g.carteira_nome,
    mm.valor as meta,
    coalesce(rp.realizado, 0) as realizado,
    (case when mm.valor is null or mm.valor = 0 then null
      else round(coalesce(rp.realizado, 0) / mm.valor, 4) end) as cobertura,
    (case when tm.total is null or tm.total = 0 then null
      else round(coalesce(rp.realizado, 0) / tm.total, 4) end) as peso
  from grade g
  left join realizado_por_carteira rp
    on rp.competencia = g.competencia
   and coalesce(rp.carteira_id::text, '') = coalesce(g.carteira_id::text, '')
  left join total_por_mes tm on tm.competencia = g.competencia
  -- Só carteira REAL casa com meta — "Sem carteira" (g.carteira_id nulo)
  -- nunca junta com a meta TOTAL (mm.carteira_id nulo): são coisas diferentes.
  left join metas_do_ano mm
    on g.carteira_id is not null and mm.carteira_id = g.carteira_id and mm.mes = extract(month from g.competencia)
  order by g.competencia, g.carteira_nome;
$$;

grant execute on function public.com_metas_x_realizado(int, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. com_conciliacao — o quadro obrigatório do §15. `p_apresentacao` é
-- digitado pelo diretor (ele tem o número na planilha); a função NUNCA o
-- deriva, nunca arredonda a diferença e nunca a esconde — é o que "não tente
-- fechar a diferença ajustando número" exige.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_conciliacao(p_ano int, p_filial text default null, p_apresentacao numeric default null)
returns table (venda_liquida numeric, bonificacao numeric, soma numeric, diferenca numeric)
language sql stable security invoker
set search_path = public
as $$
  select
    coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as venda_liquida,
    coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as bonificacao,
    coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0)
      + coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as soma,
    (case when p_apresentacao is null then null
      else p_apresentacao - (
        coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0)
        + coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0)
      ) end) as diferenca
  from public.com_vendas_itens i
  where extract(year from i.competencia) = p_ano
    and (p_filial is null or i.filial = p_filial);
$$;

grant execute on function public.com_conciliacao(int, text, numeric) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Aviso pelo sino — meta de CARTEIRA avisa quem está nela; meta TOTAL
-- (carteira_id nulo) não avisa ninguém, porque é da empresa, não de uma
-- pessoa. Reusa `notify_users` (20260908020000) — o mesmo insert em lote que
-- todo aviso do sistema já usa.
-- ═══════════════════════════════════════════════════════════════════════════
alter type public.notification_type add value if not exists 'meta_definida';

create or replace function public.notify_on_meta_definida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membros uuid[];
  v_nome_carteira text;
begin
  if new.carteira_id is null then
    return new;
  end if;

  select array_agg(user_id) into v_membros
  from public.com_carteira_membros
  where carteira_id = new.carteira_id;

  select nome into v_nome_carteira from public.com_carteiras where id = new.carteira_id;

  perform public.notify_users(
    new.tenant_id,
    v_membros,
    'meta_definida'::public.notification_type,
    'com_meta',
    new.id,
    format('Meta de %s/%s definida', new.mes, new.ano),
    format('A meta da carteira %s para %s/%s é %s.', coalesce(v_nome_carteira, ''), new.mes, new.ano, new.valor)
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_on_meta_definida on public.com_metas;
create trigger trg_notify_on_meta_definida
  after insert or update of valor on public.com_metas
  for each row execute function public.notify_on_meta_definida();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Perfis de acesso: duas ações novas em "comercial", só no perfil
-- "Gestor" (mesmo padrão de `cashback.configurar` — ação sensível fica de
-- fora de "Operador" e "Somente leitura").
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.seed_default_access_profiles(p_tenant_id uuid, p_department text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_full jsonb;
  v_operator jsonb;
  v_viewer jsonb;
begin
  if p_department not in ('ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'comercial', 'educacional') then
    raise exception 'Departamento inválido: %', p_department;
  end if;

  if p_department = 'ti' then
    v_full := '{
      "tickets": {"view": true, "create": true, "edit": true, "delete": true, "assign": true, "close": true, "internal_notes": true},
      "inventory": {"view": true, "create": true, "edit": true, "delete": true},
      "contracts": {"view": true, "create": true, "edit": true, "delete": true},
      "licenses": {"view": true, "create": true, "edit": true, "delete": true, "view_keys": true},
      "maintenances": {"view": true, "create": true, "edit": true, "delete": true},
      "knowledge": {"view": true, "create": true, "edit": true, "delete": true},
      "reports": {"view": true},
      "settings": {"view": true, "edit": true}
    }'::jsonb;
    v_operator := '{
      "tickets": {"view": true, "create": true, "edit": true, "assign": true, "close": true, "internal_notes": true},
      "inventory": {"view": true, "create": true, "edit": true},
      "contracts": {"view": true},
      "licenses": {"view": true, "create": true, "edit": true},
      "maintenances": {"view": true, "create": true, "edit": true},
      "knowledge": {"view": true, "create": true, "edit": true},
      "reports": {"view": true},
      "settings": {"view": true}
    }'::jsonb;
    v_viewer := '{
      "tickets": {"view": true},
      "inventory": {"view": true},
      "contracts": {"view": true},
      "licenses": {"view": true},
      "maintenances": {"view": true},
      "knowledge": {"view": true},
      "reports": {"view": true}
    }'::jsonb;

  elsif p_department = 'marketing' then
    v_full := '{
      "tickets": {"view": true, "create": true, "edit": true, "delete": true, "assign": true, "close": true},
      "calendar": {"view": true, "create": true, "edit": true, "delete": true, "publish": true},
      "campaigns": {"view": true, "create": true, "edit": true, "delete": true},
      "suppliers": {"view": true, "create": true, "edit": true, "delete": true},
      "inventory": {"view": true, "create": true, "edit": true, "delete": true},
      "reports": {"view": true},
      "settings": {"view": true, "edit": true}
    }'::jsonb;
    v_operator := '{
      "tickets": {"view": true, "create": true, "edit": true, "close": true},
      "calendar": {"view": true, "create": true, "edit": true},
      "campaigns": {"view": true, "create": true, "edit": true},
      "suppliers": {"view": true, "create": true, "edit": true},
      "inventory": {"view": true, "create": true, "edit": true},
      "reports": {"view": true}
    }'::jsonb;
    v_viewer := '{
      "tickets": {"view": true},
      "calendar": {"view": true},
      "campaigns": {"view": true},
      "suppliers": {"view": true},
      "inventory": {"view": true},
      "reports": {"view": true}
    }'::jsonb;

  elsif p_department = 'rh' then
    v_full := '{
      "tickets": {"view": true, "create": true, "edit": true, "delete": true, "assign": true, "close": true},
      "employees": {"view": true, "create": true, "edit": true, "delete": true, "view_salary": true},
      "payroll": {"view": true, "create": true, "edit": true, "approve": true},
      "vacations": {"view": true, "create": true, "edit": true, "approve": true},
      "absences": {"view": true, "create": true, "edit": true, "approve": true},
      "benefits": {"view": true, "create": true, "edit": true, "delete": true},
      "documents": {"view": true, "create": true, "edit": true, "delete": true},
      "reports": {"view": true},
      "settings": {"view": true, "edit": true}
    }'::jsonb;
    v_operator := '{
      "tickets": {"view": true, "create": true, "edit": true, "close": true},
      "employees": {"view": true, "create": true, "edit": true},
      "payroll": {"view": true, "create": true, "edit": true},
      "vacations": {"view": true, "edit": true},
      "absences": {"view": true, "create": true, "edit": true},
      "benefits": {"view": true, "create": true, "edit": true},
      "documents": {"view": true, "create": true, "edit": true},
      "reports": {"view": true}
    }'::jsonb;
    v_viewer := '{
      "tickets": {"view": true},
      "employees": {"view": true},
      "vacations": {"view": true},
      "absences": {"view": true},
      "benefits": {"view": true},
      "documents": {"view": true},
      "reports": {"view": true}
    }'::jsonb;

  elsif p_department = 'qualidade' then
    v_full := '{
      "tickets": {"view": true, "create": true, "edit": true, "delete": true, "assign": true, "close": true},
      "pops": {"view": true, "create": true, "edit": true, "delete": true, "approve": true, "publish": true},
      "audits": {"view": true, "create": true, "edit": true, "delete": true},
      "ncs": {"view": true, "create": true, "edit": true, "delete": true},
      "reports": {"view": true},
      "settings": {"view": true, "edit": true}
    }'::jsonb;
    v_operator := '{
      "tickets": {"view": true, "create": true, "edit": true, "close": true},
      "pops": {"view": true, "create": true, "edit": true},
      "audits": {"view": true, "create": true, "edit": true},
      "ncs": {"view": true, "create": true, "edit": true},
      "reports": {"view": true}
    }'::jsonb;
    v_viewer := '{
      "tickets": {"view": true},
      "pops": {"view": true},
      "audits": {"view": true},
      "ncs": {"view": true},
      "reports": {"view": true}
    }'::jsonb;

  elsif p_department = 'comercial' then
    v_full := '{
      "tickets": {"view": true, "create": true, "edit": true, "delete": true, "assign": true, "close": true, "internal_notes": true},
      "dashboard": {"view": true},
      "vendas": {"view": true, "importar": true, "substituir": true},
      "cashback": {"configurar": true},
      "carteiras": {"gerir": true},
      "metas": {"definir": true},
      "reports": {"view": true},
      "settings": {"view": true, "edit": true}
    }'::jsonb;
    v_operator := '{
      "tickets": {"view": true, "create": true, "edit": true, "assign": true, "close": true, "internal_notes": true},
      "dashboard": {"view": true},
      "vendas": {"view": true},
      "reports": {"view": true}
    }'::jsonb;
    v_viewer := '{
      "tickets": {"view": true},
      "dashboard": {"view": true},
      "vendas": {"view": true},
      "reports": {"view": true}
    }'::jsonb;

  else
    v_full := '{
      "tickets": {"view": true, "create": true, "edit": true, "delete": true, "assign": true, "close": true, "internal_notes": true},
      "dashboard": {"view": true},
      "reports": {"view": true},
      "settings": {"view": true, "edit": true}
    }'::jsonb;
    v_operator := '{
      "tickets": {"view": true, "create": true, "edit": true, "assign": true, "close": true, "internal_notes": true},
      "dashboard": {"view": true},
      "reports": {"view": true}
    }'::jsonb;
    v_viewer := '{
      "tickets": {"view": true},
      "dashboard": {"view": true},
      "reports": {"view": true}
    }'::jsonb;
  end if;

  insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  select p_tenant_id, p_department, 'Gestor', 'Acesso completo ao departamento', false, v_full
  where not exists (
    select 1 from public.access_profiles
    where tenant_id = p_tenant_id and department = p_department and name = 'Gestor'
  );

  insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  select p_tenant_id, p_department, 'Operador', 'Trabalho do dia a dia: ver, criar e editar', true, v_operator
  where not exists (
    select 1 from public.access_profiles
    where tenant_id = p_tenant_id and department = p_department and name = 'Operador'
  );

  insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  select p_tenant_id, p_department, 'Somente leitura', 'Visualização sem permitir alterações', false, v_viewer
  where not exists (
    select 1 from public.access_profiles
    where tenant_id = p_tenant_id and department = p_department and name = 'Somente leitura'
  );
end;
$function$;

-- Backfill: perfis "Gestor" que já existem em `comercial` ganham as duas
-- ações novas sem perder o que já tinham — só quando ainda não têm a chave
-- (`jsonb_set` sobrescreveria um `true`/`false` que alguém já tenha mudado).
update public.access_profiles
   set permissions = jsonb_set(permissions, '{carteiras}', '{"gerir": true}'::jsonb)
 where department = 'comercial' and name = 'Gestor'
   and not (permissions ? 'carteiras');

update public.access_profiles
   set permissions = jsonb_set(permissions, '{metas}', '{"definir": true}'::jsonb)
 where department = 'comercial' and name = 'Gestor'
   and not (permissions ? 'metas');
