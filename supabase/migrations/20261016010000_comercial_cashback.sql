-- Painel Comercial (L6c): o cliente e o cashback. Ver
-- .scratch/plano-l6c-cliente-e-cashback.md e docs/instrucoes-painel-comercial.md
-- (INSTRUCOES v7) §12 (Cashback) e §13 (Pedidos em condição, já resolvida na
-- L6b). Idempotente: pode ser reaplicada sem erro.
--
-- CORREÇÃO DE ROTA (não é a leva original que o plano descrevia): o plano
-- inicial inventava uma linha do tempo de tabela de preço por competência
-- (`com_tabela_na_competencia`, `da_epoca`) que o INSTRUCOES v7 não pede — o
-- documento é claro que a tabela do cliente é um atributo ATUAL
-- (`com_clientes.tabela_base`, do `CLIENTESXTABELA` mais recente), não uma
-- linha do tempo. Esta migration usa `com_clientes.tabela_base` direto, sem
-- histórico por competência.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. com_faixas_cashback — a grade. §12 do INSTRUCOES v7 traz as três grades
-- completas, escritas pelo dono: são dado dele, semeadas aqui (idempotente,
-- `on conflict do nothing`) para cada empresa já existente — mas continuam
-- editáveis pela tela de configuração, porque a grade muda. REVENDA, SALÃO
-- REF e DIRETORIA não recebem linha nenhuma: "ainda não têm grade definida"
-- é o próprio documento dizendo que não há minimo/percentual para elas —
-- nenhum código lista essas tabelas por nome, um cliente cai em "sem
-- programa" só por não existir linha aqui para a tabela_base dele.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.com_faixas_cashback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tabela_base text not null,
  valor_minimo numeric(14,2) not null check (valor_minimo >= 0),
  percentual numeric(5,2) not null check (percentual > 0 and percentual <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, tabela_base, valor_minimo)
);

-- Molde de `crm_price_tables` (a irmã mais próxima: tabela de configuração
-- que o dono edita direto, não um fato importado) — tenant_id por trigger,
-- não por default de coluna, e `updated_at` por trigger na escrita.
drop trigger if exists inject_tenant_id_com_faixas_cashback on public.com_faixas_cashback;
create trigger inject_tenant_id_com_faixas_cashback before insert on public.com_faixas_cashback
  for each row execute function public.inject_tenant_id();
drop trigger if exists handle_com_faixas_cashback_updated_at on public.com_faixas_cashback;
create trigger handle_com_faixas_cashback_updated_at before update on public.com_faixas_cashback
  for each row execute function public.handle_updated_at();

alter table public.com_faixas_cashback enable row level security;

drop policy if exists com_faixas_cashback_select on public.com_faixas_cashback;
create policy com_faixas_cashback_select on public.com_faixas_cashback for select
  using (tenant_id = (select public.get_user_tenant_id())
     and (select public.has_comercial_access(auth.uid())));

drop policy if exists com_faixas_cashback_insert on public.com_faixas_cashback;
create policy com_faixas_cashback_insert on public.com_faixas_cashback for insert
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'cashback', 'configurar'))));

drop policy if exists com_faixas_cashback_update on public.com_faixas_cashback;
create policy com_faixas_cashback_update on public.com_faixas_cashback for update
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'cashback', 'configurar'))))
  with check (tenant_id = (select public.get_user_tenant_id())
          and ((select public.is_admin_or_higher(auth.uid()))
            or (select public.tem_permissao(auth.uid(), 'comercial', 'cashback', 'configurar'))));

drop policy if exists com_faixas_cashback_delete on public.com_faixas_cashback;
create policy com_faixas_cashback_delete on public.com_faixas_cashback for delete
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.is_admin_or_higher(auth.uid()))
       or (select public.tem_permissao(auth.uid(), 'comercial', 'cashback', 'configurar'))));

-- Semente — só para empresa que já existe quando esta migration roda; uma
-- vez só, `on conflict do nothing` (o índice único da tabela). Empresa nova
-- não ganha grade sozinha (o Helpoint fechou o cadastro público na ADR-010 —
-- tenant novo só nasce pelo service_role, no seed da implantação — então não
-- há "próxima empresa" pedindo uma regra de semeadura automática aqui).
insert into public.com_faixas_cashback (tenant_id, tabela_base, valor_minimo, percentual)
select t.id, g.tabela_base, g.valor_minimo, g.percentual
from public.tenants t
cross join (values
  ('ATACADISTA', 5000.00, 2.00),
  ('ATACADISTA', 7500.00, 2.50),
  ('ATACADISTA', 10000.00, 3.00),
  ('ATACADISTA', 15000.00, 3.50),
  ('ATACADISTA', 20000.00, 4.00),
  ('ATACADISTA', 30000.00, 4.50),
  ('ATACADISTA', 40000.00, 5.00),
  ('ATACADISTA', 60000.00, 5.50),
  ('ATACADISTA', 80000.00, 6.00),
  ('ATACADISTA', 100000.00, 6.50),
  ('ATACADISTA', 120000.00, 7.00),
  ('VIP', 5000.00, 4.00),
  ('VIP', 8000.00, 5.00),
  ('VIP', 15000.00, 6.00),
  ('VIP', 25000.00, 7.00),
  ('VIP', 40000.00, 8.00),
  ('VIP', 60000.00, 9.00),
  ('VIP', 120000.00, 10.00),
  ('VIP MAIS', 3000.00, 4.00),
  ('VIP MAIS', 5000.00, 5.00),
  ('VIP MAIS', 10000.00, 6.00),
  ('VIP MAIS', 20000.00, 7.00),
  ('VIP MAIS', 35000.00, 8.00),
  ('VIP MAIS', 50000.00, 9.00),
  ('VIP MAIS', 80000.00, 10.00)
) as g(tabela_base, valor_minimo, percentual)
on conflict (tenant_id, tabela_base, valor_minimo) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. com_cashback_mensal — a apuração mês a mês (§12: "a faixa de cada mês
-- depende do quanto o cliente comprou NAQUELE mês"). `tabela_base` vem
-- direto de `com_clientes` (atributo atual, sem histórico); o sufixo
-- CONDIÇÃO já sai fora dela (coluna gerada da L6a) — então um cliente em
-- "ATACADISTA CONDICAO" cai na grade de "ATACADISTA" sem tratamento especial
-- aqui. `sem_programa` é decidido por EXISTÊNCIA de linha em
-- `com_faixas_cashback` para a tabela do cliente — nunca por nome de tabela
-- hardcoded.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_cashback_mensal(p_ano int, p_filial text default null)
returns table (
  cliente_codigo text, nome text, competencia date, tabela_base text,
  comprado numeric, percentual numeric, cashback numeric, sem_programa boolean
)
language sql stable security invoker
set search_path = public
as $$
  with base as (
    select
      i.cliente_codigo,
      i.competencia,
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as comprado
    from public.com_vendas_itens i
    where extract(year from i.competencia) = p_ano
      and i.classe in ('venda', 'devolucao')
      and (p_filial is null or i.filial = p_filial)
    group by i.cliente_codigo, i.competencia
  ),
  com_tabela as (
    select b.cliente_codigo, b.competencia, b.comprado, c.razao_social, c.tabela_base
    from base b
    left join public.com_clientes c
      on c.tenant_id = (select public.get_user_tenant_id()) and c.codigo = b.cliente_codigo
  ),
  com_faixa as (
    select
      ct.*,
      exists (
        select 1 from public.com_faixas_cashback g
        where g.tenant_id = (select public.get_user_tenant_id())
          and g.tabela_base = ct.tabela_base
      ) as tem_programa,
      f.percentual as faixa_percentual
    from com_tabela ct
    left join lateral (
      select fc.percentual
      from public.com_faixas_cashback fc
      where fc.tenant_id = (select public.get_user_tenant_id())
        and fc.tabela_base = ct.tabela_base
        and fc.valor_minimo <= ct.comprado
      order by fc.valor_minimo desc
      limit 1
    ) f on true
  )
  select
    cf.cliente_codigo,
    coalesce(cf.razao_social, cf.cliente_codigo) as nome,
    cf.competencia,
    cf.tabela_base,
    cf.comprado,
    -- Nunca zero, nunca estimado (§12): sem programa, percentual e cashback
    -- são NULOS. Com programa mas abaixo do mínimo do mês, cashback é ZERO
    -- (tem direito, não atingiu naquele mês) e percentual fica nulo (não há
    -- faixa que se aplique). As duas nunca se confundem (regra do CLAUDE.md).
    (case when cf.tem_programa then cf.faixa_percentual else null end) as percentual,
    (case
       when not cf.tem_programa then null
       when cf.faixa_percentual is null then 0
       else round(cf.comprado * cf.faixa_percentual / 100, 2)
     end) as cashback,
    not cf.tem_programa as sem_programa
  from com_faixa cf
  order by nome, cf.competencia;
$$;

grant execute on function public.com_cashback_mensal(int, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. com_cashback_resumo — uma linha por cliente no recorte (ano + filial),
-- para as seções "com direito" e "não atingiram" do §12. Soma as apurações
-- MENSAIS de `com_cashback_mensal` (nunca o percentual sobre o acumulado —
-- é a mesma regra da asserção 1, aplicada aqui de novo porque a tela
-- também precisa do total do período, e essa soma mora no banco, não no
-- navegador — regra do CLAUDE.md, "a conta mora no banco").
--
-- `meta_para_ativar` é literalmente "50% da compra" (§12) — a compra é a do
-- PERÍODO inteiro, a mesma coluna que a seção mostra ao lado.
-- `falta_proxima_faixa` olha o ÚLTIMO mês com movimento do cliente (não o
-- período somado, porque a faixa é mensal): quanto falta, a partir do que
-- ele comprou nesse último mês, para o próximo degrau da grade da tabela
-- dele. `menor_distancia` é o menor "faltou isso" entre os meses em que ele
-- NÃO atingiu nenhuma faixa (tem programa, comprou menos que o mínimo) — é
-- o que ordena "não atingiram" pela menor distância.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_cashback_resumo(p_ano int, p_filial text default null)
returns table (
  cliente_codigo text, nome text, tabela_base text, sem_programa boolean,
  comprado numeric, cashback numeric, meses_com_direito bigint,
  ultima_competencia date, ultima_faixa numeric,
  meta_para_ativar numeric, falta_proxima_faixa numeric, menor_distancia numeric
)
language sql stable security invoker
set search_path = public
as $$
  with mensal as (
    select * from public.com_cashback_mensal(p_ano, p_filial)
  ),
  agregado as (
    select
      m.cliente_codigo,
      max(m.nome) as nome,
      max(m.tabela_base) as tabela_base,
      bool_and(m.sem_programa) as sem_programa,
      sum(m.comprado) as comprado,
      sum(m.cashback) as cashback,
      count(*) filter (where m.cashback > 0) as meses_com_direito
    from mensal m
    group by m.cliente_codigo
  ),
  ultimo_mes as (
    select distinct on (m.cliente_codigo)
      m.cliente_codigo, m.competencia, m.comprado, m.percentual, m.tabela_base
    from mensal m
    order by m.cliente_codigo, m.competencia desc
  ),
  proxima_faixa as (
    select
      um.cliente_codigo,
      (
        select min(fc.valor_minimo)
        from public.com_faixas_cashback fc
        where fc.tenant_id = (select public.get_user_tenant_id())
          and fc.tabela_base = um.tabela_base
          and fc.valor_minimo > um.comprado
      ) as proximo_minimo
    from ultimo_mes um
  ),
  menor_faixa as (
    select tabela_base, min(valor_minimo) as minimo
    from public.com_faixas_cashback
    where tenant_id = (select public.get_user_tenant_id())
    group by tabela_base
  ),
  distancia_por_mes as (
    select m.cliente_codigo, (mf.minimo - m.comprado) as distancia
    from mensal m
    join menor_faixa mf on mf.tabela_base = m.tabela_base
    where m.cashback = 0 and not m.sem_programa and m.comprado < mf.minimo
  ),
  menor_dist as (
    select cliente_codigo, min(distancia) as menor_distancia
    from distancia_por_mes
    group by cliente_codigo
  )
  select
    a.cliente_codigo, a.nome, a.tabela_base, a.sem_programa,
    a.comprado, a.cashback, a.meses_com_direito, um.competencia as ultima_competencia,
    um.percentual as ultima_faixa,
    round(a.comprado * 0.5, 2) as meta_para_ativar,
    (pf.proximo_minimo - um.comprado) as falta_proxima_faixa,
    md.menor_distancia
  from agregado a
  left join ultimo_mes um on um.cliente_codigo = a.cliente_codigo
  left join proxima_faixa pf on pf.cliente_codigo = a.cliente_codigo
  left join menor_dist md on md.cliente_codigo = a.cliente_codigo
  order by a.nome;
$$;

grant execute on function public.com_cashback_resumo(int, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. com_cashback_indicadores — os quatro números do topo da seção (§12),
-- numa linha só. Mesmo motivo de `com_painel_totais` na L6a (achado 1
-- daquela auditoria): somar por cliente no navegador é somar apuração fora
-- do banco. `percentual` divide só pelo comprado de quem TEM programa — o
-- comprado de REVENDA/SALÃO REF/DIRETORIA não pode diluir a eficiência do
-- que é, por definição, incapaz de gerar cashback.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_cashback_indicadores(p_ano int, p_filial text default null)
returns table (
  cashback_total numeric, comprado_total numeric, percentual numeric,
  clientes_nao_atingiram bigint, clientes_sem_programa bigint
)
language sql stable security invoker
set search_path = public
as $$
  with resumo as (
    select * from public.com_cashback_resumo(p_ano, p_filial)
  ),
  com_programa as (
    select * from resumo where not sem_programa
  )
  select
    coalesce((select sum(cashback) from com_programa), 0) as cashback_total,
    coalesce((select sum(comprado) from resumo), 0) as comprado_total,
    (case when coalesce((select sum(comprado) from com_programa), 0) = 0 then null
      else round((select sum(cashback) from com_programa) / (select sum(comprado) from com_programa) * 100, 2)
    end) as percentual,
    (select count(*) from com_programa where coalesce(cashback, 0) = 0 and comprado > 0) as clientes_nao_atingiram,
    (select count(*) from resumo where sem_programa) as clientes_sem_programa;
$$;

grant execute on function public.com_cashback_indicadores(int, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. com_ficha_cliente — o que compra, o que veio bonificado, parou de
-- comprar e nunca comprou. Uma função, quatro blocos num jsonb só (é uma
-- ficha, não quatro idas ao banco).
--
-- A âncora de "parou de comprar"/"nunca comprou" é o ÚLTIMO MÊS COM
-- MOVIMENTO DO PRÓPRIO CLIENTE dentro de [p_de, p_ate] — nunca
-- `current_date` (regra 10 do pgTAP; mesmo raciocínio de
-- `com_clientes_a_trabalhar`, na granularidade de produto em vez de
-- cliente). Sem nenhuma venda no período, os dois blocos voltam vazios.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_ficha_cliente(p_codigo text, p_de date, p_ate date)
returns jsonb
language plpgsql stable security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.get_user_tenant_id());
  v_ultimo_mes date;
  v_m1 date;
  v_m2 date;
  v_m3 date;
  v_comprou jsonb;
  v_bonificado jsonb;
  v_parou jsonb;
  v_nunca jsonb;
  v_nunca_total int;
begin
  select max(competencia) into v_ultimo_mes
  from public.com_vendas_itens
  where tenant_id = v_tenant_id and cliente_codigo = p_codigo
    and classe = 'venda' and emissao between p_de and p_ate;

  select coalesce(jsonb_agg(x order by x.valor desc), '[]'::jsonb) into v_comprou
  from (
    select i.produto_codigo, coalesce(max(p.nome), i.produto_codigo) as nome,
           sum(i.valor_curva) as valor, sum(i.quantidade_curva) as quantidade
    from public.com_vendas_itens i
    left join public.com_produtos p on p.tenant_id = i.tenant_id and p.codigo = i.produto_codigo
    where i.tenant_id = v_tenant_id and i.cliente_codigo = p_codigo
      and i.classe in ('venda', 'devolucao') and i.emissao between p_de and p_ate
    group by i.produto_codigo
  ) x;

  select coalesce(jsonb_agg(x order by x.valor desc), '[]'::jsonb) into v_bonificado
  from (
    select i.produto_codigo, coalesce(max(p.nome), i.produto_codigo) as nome,
           sum(i.valor_nota) as valor, sum(i.quantidade) as quantidade
    from public.com_vendas_itens i
    left join public.com_produtos p on p.tenant_id = i.tenant_id and p.codigo = i.produto_codigo
    where i.tenant_id = v_tenant_id and i.cliente_codigo = p_codigo
      and i.classe = 'bonificacao' and i.emissao between p_de and p_ate
    group by i.produto_codigo
  ) x;

  if v_ultimo_mes is not null then
    v_m1 := (v_ultimo_mes - interval '1 month')::date;
    v_m2 := (v_ultimo_mes - interval '2 month')::date;
    v_m3 := (v_ultimo_mes - interval '3 month')::date;

    -- >= 2 dos 3 meses anteriores ao último mês com movimento, e sem venda
    -- nesse último mês — por produto, não por cliente (com_clientes_a_
    -- trabalhar já resolve a versão por cliente, na L6b).
    select coalesce(jsonb_agg(x order by x.nome), '[]'::jsonb) into v_parou
    from (
      with meses3 as (
        select distinct produto_codigo, competencia
        from public.com_vendas_itens
        where tenant_id = v_tenant_id and cliente_codigo = p_codigo
          and classe = 'venda' and competencia in (v_m1, v_m2, v_m3)
      ),
      contagem as (
        select produto_codigo, count(*) as meses from meses3 group by produto_codigo
      ),
      comprou_ultimo as (
        select distinct produto_codigo
        from public.com_vendas_itens
        where tenant_id = v_tenant_id and cliente_codigo = p_codigo
          and classe = 'venda' and competencia = v_ultimo_mes
      )
      select ct.produto_codigo, coalesce(max(p.nome), ct.produto_codigo) as nome
      from contagem ct
      left join public.com_produtos p on p.tenant_id = v_tenant_id and p.codigo = ct.produto_codigo
      where ct.meses >= 2
        and not exists (select 1 from comprou_ultimo cu where cu.produto_codigo = ct.produto_codigo)
      group by ct.produto_codigo
    ) x;
  else
    v_parou := '[]'::jsonb;
  end if;

  -- O total ANTES do teto de 100 — para a tela dizer "mostrando 100 de N".
  select count(*) into v_nunca_total
  from public.com_produtos pr
  where pr.tenant_id = v_tenant_id
    and not exists (
      select 1 from public.com_vendas_itens i
      where i.tenant_id = v_tenant_id and i.produto_codigo = pr.codigo
        and i.cliente_codigo = p_codigo and i.emissao between p_de and p_ate
    );

  -- Ordenado pelo que o produto vendeu no período para os OUTROS clientes
  -- (o que ele está deixando de comprar que mais gira) — nunca este cliente.
  select coalesce(jsonb_agg(x order by x.valor_outros desc), '[]'::jsonb) into v_nunca
  from (
    select pr.codigo as produto_codigo, pr.nome,
           coalesce(sum(i2.valor_curva) filter (
             where i2.classe in ('venda', 'devolucao') and i2.cliente_codigo <> p_codigo
           ), 0) as valor_outros
    from public.com_produtos pr
    left join public.com_vendas_itens i2
      on i2.tenant_id = v_tenant_id and i2.produto_codigo = pr.codigo and i2.emissao between p_de and p_ate
    where pr.tenant_id = v_tenant_id
      and not exists (
        select 1 from public.com_vendas_itens i
        where i.tenant_id = v_tenant_id and i.produto_codigo = pr.codigo
          and i.cliente_codigo = p_codigo and i.emissao between p_de and p_ate
      )
    group by pr.codigo, pr.nome
    order by valor_outros desc
    limit 100
  ) x;

  return jsonb_build_object(
    'comprou', v_comprou,
    'bonificado', v_bonificado,
    'parou_de_comprar', v_parou,
    'nunca_comprou', v_nunca,
    'nunca_comprou_total', v_nunca_total
  );
end;
$$;

grant execute on function public.com_ficha_cliente(text, date, date) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Perfis de acesso: a seção "cashback" entra no schema (src/config/access-
-- profile-schemas.ts, editado junto) e nos perfis padrão de tenant novo. Só
-- a ação `configurar`, e só no perfil "Gestor" (mesmo padrão de
-- `payroll.approve` no RH: ação sensível fica de fora de "Operador" e
-- "Somente leitura"). `clientes.atribuir_carteira` é da L6d — não se
-- antecipa aqui.
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
