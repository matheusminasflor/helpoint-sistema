-- Painel Comercial (L6a): a base de vendas do Forteplus e a porta.
-- Ver .scratch/plano-painel-comercial.md — §3 (achados), §4 (decisões), §6 (L6a).
-- Idempotente: pode ser reaplicada sem erro.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Acesso ao módulo Comercial (molde literal de has_fin_access)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.has_comercial_access(_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_module_access
    where user_id = _user_id and module = 'comercial'
  ) or public.is_supervisor_or_higher(_user_id)
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. tem_permissao — a peça que faltava (§4.6): a primeira policy deste
-- sistema a consultar o perfil de acesso. Espelha a mesma precedência de
-- `resolvePermission` em src/config/access-profile-schemas.ts: override do
-- usuário primeiro, permissão do perfil depois, `false` quando nada foi dito.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.tem_permissao(_user_id uuid, _departamento text, _modulo text, _acao text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (
      select (uap.overrides -> _modulo ->> _acao)::boolean
      from public.user_access_profiles uap
      where uap.user_id = _user_id and uap.department = _departamento
        and (uap.overrides -> _modulo ->> _acao) is not null
    ),
    (
      select (ap.permissions -> _modulo ->> _acao)::boolean
      from public.user_access_profiles uap
      join public.access_profiles ap on ap.id = uap.profile_id
      where uap.user_id = _user_id and uap.department = _departamento
    ),
    false
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Tabelas
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.com_vendas_importacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id(),
  tipo text not null check (tipo in ('vendas', 'clientes', 'metas')),
  filial text check (filial in ('INBRAS', 'MF')),
  file_name text not null,
  linhas_lidas int not null,
  itens_gravados int not null default 0,
  descartes jsonb not null default '{}',
  outros_linhas int not null default 0,
  outros_valor numeric not null default 0,
  cfops_outros text[] not null default '{}',
  substituiu boolean not null default false,
  imported_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.com_vendas_competencias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id(),
  filial text not null check (filial in ('INBRAS', 'MF')),
  competencia date not null,
  importacao_id uuid not null references public.com_vendas_importacoes(id) on delete cascade,
  linhas int not null,
  total_venda numeric not null,
  created_at timestamptz not null default now()
);

-- A trava contra reimportar o mesmo mês da mesma filial (§4.2) — é esta linha
-- que faz a decisão inteira valer. Vive no banco, não na tela.
create unique index if not exists com_vendas_competencias_unica
  on public.com_vendas_competencias (tenant_id, filial, competencia);

create table if not exists public.com_clientes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id(),
  codigo text not null,
  razao_social text not null,
  fantasia text,
  tabela_preco text,
  ativo boolean not null default true,
  origem text not null default 'cadastro' check (origem in ('cadastro', 'venda')),
  -- Duas colunas geradas que matam a classe de bug do sufixo "CONDICAO"
  -- (§3.8b): a condição nunca se decide comparando string à mão de novo.
  em_condicao boolean generated always as (
    tabela_preco is not null and tabela_preco like '%CONDICAO') stored,
  tabela_base text generated always as (
    nullif(btrim(regexp_replace(coalesce(tabela_preco, ''), '\s*CONDICAO$', '')), '')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, codigo)
);

create table if not exists public.com_clientes_tabela_historico (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id(),
  cliente_codigo text not null,
  tabela_preco text,
  -- Regra 10 do pgTAP: o dia é o do Brasil, não o do servidor.
  vigente_desde date not null default (now() at time zone 'America/Sao_Paulo')::date,
  importacao_id uuid references public.com_vendas_importacoes(id),
  created_at timestamptz not null default now()
);

create table if not exists public.com_produtos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id(),
  codigo text not null,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, codigo)
);

create table if not exists public.com_vendas_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id(),
  importacao_id uuid not null references public.com_vendas_importacoes(id) on delete cascade,
  filial text not null check (filial in ('INBRAS', 'MF')),
  emissao date not null,
  -- Não existe o caso de a competência discordar da data da nota: é sempre o
  -- mês da emissão, gerado, nunca digitado (§4.9 e a nota da §6/L6a).
  -- `emissao::timestamp` (não `timestamptz`): sem o cast explícito o Postgres
  -- resolve `date_trunc` para o overload de fuso (STABLE) e recusa a coluna
  -- gerada com "generation expression is not immutable".
  competencia date generated always as (date_trunc('month', emissao::timestamp)::date) stored,
  documento text not null,
  serie text not null,
  tipo_documento text,
  cfop text not null check (cfop ~ '^[0-9]{4}$'),
  classe text not null check (classe in ('venda', 'devolucao', 'bonificacao', 'industrializacao', 'outros')),
  cliente_codigo text not null,
  produto_codigo text not null,
  produto_nome text not null,
  quantidade numeric not null,
  valor_nota numeric not null,
  desconto numeric not null default 0,
  vendedor_codigo text,
  vendedor_nome text,
  -- O sinal da devolução é do banco, não do importador (§4.9): nestes
  -- arquivos não há nenhuma devolução, então ninguém sabe se o Forteplus
  -- imprime com sinal de menos. `-abs(...)` acerta nos dois casos, sempre.
  valor_curva numeric generated always as (
    case classe
      when 'venda' then valor_nota
      when 'devolucao' then -abs(valor_nota)
      else 0
    end) stored,
  quantidade_curva numeric generated always as (
    case classe
      when 'venda' then quantidade
      when 'devolucao' then -abs(quantidade)
      else 0
    end) stored,
  created_at timestamptz not null default now()
);

comment on column public.com_vendas_itens.vendedor_codigo is
  'Do relatório, sem tratamento. Os códigos 1638 (FINANCEIRO APROVADO) e 1610 (CONECTA) não são vendedores reais — não construa análise por vendedor sem resolver isso.';

create index if not exists com_vendas_itens_competencia_filial_idx
  on public.com_vendas_itens (tenant_id, competencia, filial);
create index if not exists com_vendas_itens_cliente_competencia_idx
  on public.com_vendas_itens (tenant_id, cliente_codigo, competencia);
create index if not exists com_vendas_itens_produto_competencia_idx
  on public.com_vendas_itens (tenant_id, produto_codigo, competencia);
create index if not exists com_vendas_itens_classe_idx
  on public.com_vendas_itens (tenant_id, classe);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS — padrão de fin_imports, estendido às seis tabelas. `importar` e
-- `substituir` são permissões separadas (§4.6): substituir apaga dado.
-- `is_admin_or_higher` fica no `or` de propósito — sem ele, ligar a
-- permissão trancaria todo mundo, porque `user_access_profiles` está vazio.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.com_vendas_importacoes enable row level security;
alter table public.com_vendas_competencias enable row level security;
alter table public.com_clientes enable row level security;
alter table public.com_clientes_tabela_historico enable row level security;
alter table public.com_produtos enable row level security;
alter table public.com_vendas_itens enable row level security;

drop policy if exists com_vendas_importacoes_select on public.com_vendas_importacoes;
create policy com_vendas_importacoes_select on public.com_vendas_importacoes for select
  using (tenant_id = (select public.get_user_tenant_id())
     and (select public.has_comercial_access(auth.uid())));

drop policy if exists com_vendas_importacoes_insert on public.com_vendas_importacoes;
create policy com_vendas_importacoes_insert on public.com_vendas_importacoes for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))));

drop policy if exists com_vendas_competencias_select on public.com_vendas_competencias;
create policy com_vendas_competencias_select on public.com_vendas_competencias for select
  using (tenant_id = (select public.get_user_tenant_id())
     and (select public.has_comercial_access(auth.uid())));

drop policy if exists com_vendas_competencias_insert on public.com_vendas_competencias;
create policy com_vendas_competencias_insert on public.com_vendas_competencias for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))));

drop policy if exists com_vendas_competencias_delete on public.com_vendas_competencias;
create policy com_vendas_competencias_delete on public.com_vendas_competencias for delete
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'substituir'))));

drop policy if exists com_clientes_select on public.com_clientes;
create policy com_clientes_select on public.com_clientes for select
  using (tenant_id = (select public.get_user_tenant_id())
     and (select public.has_comercial_access(auth.uid())));

drop policy if exists com_clientes_insert on public.com_clientes;
create policy com_clientes_insert on public.com_clientes for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))));

drop policy if exists com_clientes_update on public.com_clientes;
create policy com_clientes_update on public.com_clientes for update
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))))
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))));

drop policy if exists com_clientes_tabela_historico_select on public.com_clientes_tabela_historico;
create policy com_clientes_tabela_historico_select on public.com_clientes_tabela_historico for select
  using (tenant_id = (select public.get_user_tenant_id())
     and (select public.has_comercial_access(auth.uid())));

drop policy if exists com_clientes_tabela_historico_insert on public.com_clientes_tabela_historico;
create policy com_clientes_tabela_historico_insert on public.com_clientes_tabela_historico for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))));

drop policy if exists com_produtos_select on public.com_produtos;
create policy com_produtos_select on public.com_produtos for select
  using (tenant_id = (select public.get_user_tenant_id())
     and (select public.has_comercial_access(auth.uid())));

drop policy if exists com_produtos_insert on public.com_produtos;
create policy com_produtos_insert on public.com_produtos for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))));

drop policy if exists com_produtos_update on public.com_produtos;
create policy com_produtos_update on public.com_produtos for update
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))))
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))));

drop policy if exists com_vendas_itens_select on public.com_vendas_itens;
create policy com_vendas_itens_select on public.com_vendas_itens for select
  using (tenant_id = (select public.get_user_tenant_id())
     and (select public.has_comercial_access(auth.uid())));

drop policy if exists com_vendas_itens_insert on public.com_vendas_itens;
create policy com_vendas_itens_insert on public.com_vendas_itens for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar'))));

drop policy if exists com_vendas_itens_delete on public.com_vendas_itens;
create policy com_vendas_itens_delete on public.com_vendas_itens for delete
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'substituir'))));
-- Sem policy de update em com_vendas_itens nesta leva: nada edita linha de
-- nota (§6/L6a). A reclassificação de CFOP fica para quando houver o
-- primeiro CFOP desconhecido de verdade (§4.10).

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. com_importar_vendas — a conferência da §4.3 é o primeiro passo, e
-- recusa a importação inteira se não fechar.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_importar_vendas(
  p_filial text,
  p_file_name text,
  p_linhas_lidas int,
  p_descartes jsonb,
  p_itens jsonb,
  p_substituir boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_descartes_total int;
  v_itens_count int;
  v_importacao_id uuid;
  v_competencias date[];
  v_competencias_resumo jsonb;
  v_gravadas int;
  v_outros_linhas int;
  v_outros_valor numeric;
  v_cfops_outros text[];
  v_conflito record;
  v_resultado jsonb;
begin
  if p_filial not in ('INBRAS', 'MF') then
    raise exception 'Filial inválida: %', p_filial;
  end if;
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  v_itens_count := coalesce(jsonb_array_length(p_itens), 0);
  select coalesce(sum((value)::int), 0) into v_descartes_total from jsonb_each_text(p_descartes);

  -- A conferência que vale é a do arquivo, não a do banco (§4.3): linhas
  -- lidas = itens gravados + linhas descartadas. Se não fechar, a
  -- importação inteira é recusada — nunca um mês "quase certo".
  if p_linhas_lidas <> v_itens_count + v_descartes_total then
    raise exception 'Conferência falhou: o arquivo tem % linhas, mas % itens + % descartes somam % — faltam %.',
      p_linhas_lidas, v_itens_count, v_descartes_total, v_itens_count + v_descartes_total,
      p_linhas_lidas - (v_itens_count + v_descartes_total);
  end if;

  if v_itens_count = 0 then
    raise exception 'Nenhum item para importar.';
  end if;

  select array_agg(distinct date_trunc('month', (item->>'emissao')::date)::date)
    into v_competencias
  from jsonb_array_elements(p_itens) as item;

  -- Resumo por competência, calculado uma vez só a partir do que o navegador
  -- mandou — usado para gravar a reserva (com_vendas_competencias) E para o
  -- retorno da tela, sem reconsultar o banco depois de escrever nele.
  select jsonb_agg(jsonb_build_object('competencia', comp, 'linhas', linhas, 'total_venda', total_venda) order by comp)
    into v_competencias_resumo
  from (
    select date_trunc('month', (item->>'emissao')::date)::date as comp,
           count(*) as linhas,
           coalesce(sum((item->>'valor_nota')::numeric) filter (where item->>'classe' = 'venda'), 0) as total_venda
    from jsonb_array_elements(p_itens) as item
    group by 1
  ) agregado;

  select count(*), coalesce(sum((item->>'valor_nota')::numeric), 0),
         coalesce(array_agg(distinct item->>'cfop'), '{}')
    into v_outros_linhas, v_outros_valor, v_cfops_outros
  from jsonb_array_elements(p_itens) as item
  where item->>'classe' = 'outros';

  if p_substituir then
    delete from public.com_vendas_itens
      where tenant_id = v_tenant_id and filial = p_filial and competencia = any(v_competencias);
    delete from public.com_vendas_competencias
      where tenant_id = v_tenant_id and filial = p_filial and competencia = any(v_competencias);
  end if;

  insert into public.com_vendas_importacoes (
    tenant_id, tipo, filial, file_name, linhas_lidas, itens_gravados, descartes,
    outros_linhas, outros_valor, cfops_outros, substituiu
  ) values (
    v_tenant_id, 'vendas', p_filial, p_file_name, p_linhas_lidas, v_itens_count, p_descartes,
    v_outros_linhas, v_outros_valor, v_cfops_outros, p_substituir
  ) returning id into v_importacao_id;

  -- Inserção prova que gravou: conta pelo RETURNING, não assume.
  with inseridos as (
    insert into public.com_vendas_itens (
      tenant_id, importacao_id, filial, emissao, documento, serie, tipo_documento,
      cfop, classe, cliente_codigo, produto_codigo, produto_nome,
      quantidade, valor_nota, desconto, vendedor_codigo, vendedor_nome
    )
    select
      v_tenant_id, v_importacao_id, p_filial,
      (item->>'emissao')::date, item->>'documento', item->>'serie', item->>'tipo_documento',
      item->>'cfop', item->>'classe',
      item->>'cliente_codigo', item->>'produto_codigo', item->>'produto_nome',
      (item->>'quantidade')::numeric, (item->>'valor_nota')::numeric,
      coalesce((item->>'desconto')::numeric, 0),
      item->>'vendedor_codigo', item->>'vendedor_nome'
    from jsonb_array_elements(p_itens) as item
    returning 1
  )
  select count(*) into v_gravadas from inseridos;

  if v_gravadas <> v_itens_count then
    raise exception 'Gravei % itens mas o arquivo tinha %.', v_gravadas, v_itens_count;
  end if;

  -- A reserva de competência: cada mês de cada filial, uma vez só (§4.2).
  -- Em unique_violation, nomeia a competência, quando e por quem — e a
  -- importação inteira falha (nada fica meio-gravado).
  begin
    insert into public.com_vendas_competencias (tenant_id, filial, competencia, importacao_id, linhas, total_venda)
    select v_tenant_id, p_filial, (r->>'competencia')::date, v_importacao_id, (r->>'linhas')::int, (r->>'total_venda')::numeric
    from jsonb_array_elements(v_competencias_resumo) as r;
  exception when unique_violation then
    select c.competencia, c.created_at, imp.file_name
      into v_conflito
    from public.com_vendas_competencias c
    join public.com_vendas_importacoes imp on imp.id = c.importacao_id
    where c.tenant_id = v_tenant_id and c.filial = p_filial and c.competencia = any(v_competencias)
    order by c.created_at desc
    limit 1;
    raise exception 'A competência % da filial % já foi importada em % (arquivo "%") — marque "substituir" para refazer.',
      to_char(v_conflito.competencia, 'MM/YYYY'), p_filial, v_conflito.created_at, v_conflito.file_name;
  end;

  -- Cliente novo (não estava no CSV) entra com origem 'venda' e tabela nula
  -- — nunca se inventa uma tabela para ele (§4.4).
  insert into public.com_clientes (tenant_id, codigo, razao_social, tabela_preco, origem)
  select distinct on (item->>'cliente_codigo')
    v_tenant_id, item->>'cliente_codigo', item->>'cliente_nome', null, 'venda'
  from jsonb_array_elements(p_itens) as item
  order by item->>'cliente_codigo'
  on conflict (tenant_id, codigo) do nothing;

  -- Nome do produto: a grafia mais frequente na base inteira (não só neste
  -- lote), recalculada a cada importação (§4.4). Depende de ver a base —
  -- se o perfil de quem importa não tiver a permissão de visualizar
  -- (`vendas.view`), este passo não atualiza nada para produtos novos; é uma
  -- lacuna estreita, registrada no relatório desta leva.
  insert into public.com_produtos (tenant_id, codigo, nome)
  select v_tenant_id, produto_codigo, mode() within group (order by produto_nome)
  from public.com_vendas_itens
  where tenant_id = v_tenant_id
    and produto_codigo in (select distinct item->>'produto_codigo' from jsonb_array_elements(p_itens) as item)
  group by produto_codigo
  on conflict (tenant_id, codigo) do update set nome = excluded.nome, updated_at = now();

  v_resultado := jsonb_build_object(
    'gravadas', v_gravadas,
    'descartes', p_descartes,
    'competencias', coalesce(v_competencias_resumo, '[]'::jsonb),
    'outros_linhas', v_outros_linhas,
    'outros_valor', v_outros_valor,
    'cfops_outros', to_jsonb(v_cfops_outros),
    'substituiu', p_substituir
  );
  return v_resultado;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. com_importar_clientes — upsert por código; historiza só quando a
-- tabela de um cliente MUDA (§4.5).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_importar_clientes(p_file_name text, p_linhas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_criados int := 0;
  v_atualizados int := 0;
  v_tabelas_alteradas int := 0;
  v_importacao_id uuid;
  v_linha jsonb;
  v_existente public.com_clientes%rowtype;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
  values (v_tenant_id, 'clientes', p_file_name, coalesce(jsonb_array_length(p_linhas), 0))
  returning id into v_importacao_id;

  for v_linha in select * from jsonb_array_elements(p_linhas)
  loop
    select * into v_existente
    from public.com_clientes
    where tenant_id = v_tenant_id and codigo = v_linha->>'codigo';

    if not found then
      v_criados := v_criados + 1;
    else
      v_atualizados := v_atualizados + 1;
      -- Compara ANTES de sobrescrever — é a única forma de saber se mudou.
      if v_existente.tabela_preco is distinct from (v_linha->>'tabela_preco') then
        v_tabelas_alteradas := v_tabelas_alteradas + 1;
        insert into public.com_clientes_tabela_historico (tenant_id, cliente_codigo, tabela_preco, importacao_id)
        values (v_tenant_id, v_linha->>'codigo', v_linha->>'tabela_preco', v_importacao_id);
      end if;
    end if;

    insert into public.com_clientes (tenant_id, codigo, razao_social, fantasia, tabela_preco, ativo, origem)
    values (
      v_tenant_id, v_linha->>'codigo', v_linha->>'razao_social', v_linha->>'fantasia',
      v_linha->>'tabela_preco', (v_linha->>'ativo')::boolean, 'cadastro'
    )
    on conflict (tenant_id, codigo) do update set
      razao_social = excluded.razao_social,
      fantasia = excluded.fantasia,
      tabela_preco = excluded.tabela_preco,
      ativo = excluded.ativo,
      origem = case when public.com_clientes.origem = 'venda' then 'cadastro' else public.com_clientes.origem end,
      updated_at = now();
  end loop;

  return jsonb_build_object('criados', v_criados, 'atualizados', v_atualizados, 'tabelas_alteradas', v_tabelas_alteradas);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Leitura do painel (§4.7): a conta mora no banco, sempre. Nenhuma tela
-- lê com_vendas_itens direto — o PostgREST corta em 1000 linhas em silêncio.
-- `p_serie` é eixo próprio, ao lado de `p_filial` (§3.8) — nunca se mistura
-- com a classe de CFOP.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_faturamento_mensal(p_ano int, p_filial text default null, p_serie text default null)
returns table (
  competencia date, filial text, serie text,
  venda numeric, devolucao numeric, liquido numeric, bonificacao numeric,
  unidades numeric, clientes_ativos bigint, skus_vendidos bigint
)
language sql stable security invoker
set search_path = public
as $$
  select
    i.competencia, i.filial, i.serie,
    coalesce(sum(i.valor_nota) filter (where i.classe = 'venda'), 0) as venda,
    coalesce(sum(abs(i.valor_nota)) filter (where i.classe = 'devolucao'), 0) as devolucao,
    coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as liquido,
    coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as bonificacao,
    coalesce(sum(i.quantidade) filter (where i.classe = 'venda'), 0) as unidades,
    count(distinct i.cliente_codigo) filter (where i.classe = 'venda') as clientes_ativos,
    -- Completa os "quatro KPIs do topo" que o §6/L6a do plano nomeia
    -- ("faturamento, clientes ativos, SKUs vendidos, bonificação sobre a
    -- venda") — o plano especificou as colunas até `clientes_ativos` e não
    -- falou de SKUs; esta é a extensão mínima e natural da mesma função
    -- para fechar o KPI que falta, não uma tabela ou função nova.
    count(distinct i.produto_codigo) filter (where i.classe = 'venda') as skus_vendidos
  from public.com_vendas_itens i
  where extract(year from i.competencia) = p_ano
    and (p_filial is null or i.filial = p_filial)
    and (p_serie is null or i.serie = p_serie)
  group by i.competencia, i.filial, i.serie
  order by i.competencia, i.filial, i.serie;
$$;

create or replace function public.com_ranking_clientes(
  p_de date, p_ate date, p_filial text default null, p_serie text default null, p_limite int default 20
)
returns table (cliente_codigo text, nome text, tabela_preco text, faturamento numeric, participacao numeric)
language sql stable security invoker
set search_path = public
as $$
  with base as (
    select i.cliente_codigo,
           coalesce(max(c.razao_social), i.cliente_codigo) as nome,
           max(c.tabela_preco) as tabela_preco,
           sum(i.valor_nota) filter (where i.classe = 'venda') as faturamento
    from public.com_vendas_itens i
    left join public.com_clientes c on c.tenant_id = i.tenant_id and c.codigo = i.cliente_codigo
    where i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
      and (p_serie is null or i.serie = p_serie)
    group by i.cliente_codigo
  ),
  total as (select coalesce(sum(faturamento), 0) as t from base)
  select b.cliente_codigo, b.nome, b.tabela_preco,
         coalesce(b.faturamento, 0) as faturamento,
         case when total.t = 0 then 0 else round(coalesce(b.faturamento, 0) / total.t * 100, 2) end as participacao
  from base b, total
  where coalesce(b.faturamento, 0) <> 0
  order by b.faturamento desc
  limit p_limite;
$$;

create or replace function public.com_cfop_fora_da_curva(p_de date, p_ate date)
returns table (cfop text, linhas bigint, valor numeric)
language sql stable security invoker
set search_path = public
as $$
  select cfop, count(*) as linhas, coalesce(sum(valor_nota), 0) as valor
  from public.com_vendas_itens
  where classe = 'outros' and emissao between p_de and p_ate
  group by cfop
  order by valor desc;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Perfis de acesso: a seção "vendas" entra no schema (src/config/access-
-- profile-schemas.ts, editado junto) e nos perfis padrão de tenant novo.
-- `comercial` tinha corpo genérico (mesmo do `educacional`, sem seção
-- própria) — agora ganha um `elsif` com a seção de vendas, sensível só no
-- perfil "Gestor" (mesmo padrão do `payroll.approve` do RH: ação sensível
-- fica de fora do "Operador" e do "Somente leitura").
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
