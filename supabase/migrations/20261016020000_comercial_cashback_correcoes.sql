-- Correções da auditoria da L6c (cashback e ficha do cliente). Ver
-- .scratch/plano-l6c-correcoes.md e docs/instrucoes-painel-comercial.md
-- (INSTRUCOES v7) §12. Idempotente: pode ser reaplicada sem erro.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 (GRAVE) — a grade nasce junto com a empresa.
--
-- `20261016010000` semeava as 25 faixas com um único INSERT sobre
-- `select t.id from public.tenants t` — só funciona se a empresa já existir
-- QUANDO a migration roda. `docs/deploy.md` põe o `db push` (passo 1) antes
-- de a linha em `tenants` existir (passo 6): num banco do zero — CI e
-- produção — aquele INSERT não encontra nenhum tenant e insere ZERO linhas.
-- O dono abriria a tela e encontraria a grade vazia, para digitar 25 faixas
-- à mão — o erro exato que ele mandou corrigir.
--
-- A correção: a semente vira uma função reaproveitável, chamada por um
-- trigger `after insert on public.tenants` (molde de `seed_crm_stages_on_
-- tenant`, em `20260910010000_crm_comercial_base.sql`) — mesmo padrão já
-- usado neste repositório para "o tenant novo nasce com X". `on conflict do
-- nothing` na chave única da tabela torna a função idempotente: chamável de
-- novo no backfill (tenant que já existe) sem duplicar nada.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_semear_faixas_cashback(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.com_faixas_cashback (tenant_id, tabela_base, valor_minimo, percentual)
  values
    (p_tenant_id, 'ATACADISTA', 5000.00, 2.00),
    (p_tenant_id, 'ATACADISTA', 7500.00, 2.50),
    (p_tenant_id, 'ATACADISTA', 10000.00, 3.00),
    (p_tenant_id, 'ATACADISTA', 15000.00, 3.50),
    (p_tenant_id, 'ATACADISTA', 20000.00, 4.00),
    (p_tenant_id, 'ATACADISTA', 30000.00, 4.50),
    (p_tenant_id, 'ATACADISTA', 40000.00, 5.00),
    (p_tenant_id, 'ATACADISTA', 60000.00, 5.50),
    (p_tenant_id, 'ATACADISTA', 80000.00, 6.00),
    (p_tenant_id, 'ATACADISTA', 100000.00, 6.50),
    (p_tenant_id, 'ATACADISTA', 120000.00, 7.00),
    (p_tenant_id, 'VIP', 5000.00, 4.00),
    (p_tenant_id, 'VIP', 8000.00, 5.00),
    (p_tenant_id, 'VIP', 15000.00, 6.00),
    (p_tenant_id, 'VIP', 25000.00, 7.00),
    (p_tenant_id, 'VIP', 40000.00, 8.00),
    (p_tenant_id, 'VIP', 60000.00, 9.00),
    (p_tenant_id, 'VIP', 120000.00, 10.00),
    (p_tenant_id, 'VIP MAIS', 3000.00, 4.00),
    (p_tenant_id, 'VIP MAIS', 5000.00, 5.00),
    (p_tenant_id, 'VIP MAIS', 10000.00, 6.00),
    (p_tenant_id, 'VIP MAIS', 20000.00, 7.00),
    (p_tenant_id, 'VIP MAIS', 35000.00, 8.00),
    (p_tenant_id, 'VIP MAIS', 50000.00, 9.00),
    (p_tenant_id, 'VIP MAIS', 80000.00, 10.00)
  on conflict (tenant_id, tabela_base, valor_minimo) do nothing;
end;
$$;
revoke all on function public.com_semear_faixas_cashback(uuid) from public, anon, authenticated;

create or replace function public.com_semear_faixas_cashback_on_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.com_semear_faixas_cashback(new.id);
  return new;
end;
$$;

drop trigger if exists trg_com_semear_faixas_cashback on public.tenants;
create trigger trg_com_semear_faixas_cashback
  after insert on public.tenants
  for each row execute function public.com_semear_faixas_cashback_on_tenant();

-- Backfill: tenants que já existem (é o caso do test-helpoint) também
-- recebem a grade, sem duplicar (on conflict do nothing).
do $$
declare t record;
begin
  for t in select id from public.tenants loop
    perform public.com_semear_faixas_cashback(t.id);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 — "SEM TABELA" deixa de ficar escondido dentro de "sem programa" (§8:
-- "Cliente sem correspondência entra como SEM TABELA e é registrado no
-- evento" — é anomalia a apontar, não um estado normal, e hoje sai igual a
-- REVENDA/SALÃO REF/DIRETORIA no mesmo número).
--
-- `sem_tabela` é `tabela_base is null` (cliente sem linha em `com_clientes`,
-- ou com `tabela_preco` nula) — sempre FALSO quando o cliente tem uma tabela
-- de preço, mesmo que essa tabela não tenha grade (aí quem liga é
-- `sem_programa`, sem mudança de sentido). As duas flags nunca se sobrepõem.
-- ═══════════════════════════════════════════════════════════════════════════
-- As três funções abaixo ganham uma coluna no fim do `returns table` — o
-- Postgres não deixa isso passar como simples `create or replace` (o tipo de
-- linha, definido pelos parâmetros OUT, mudou): `drop function` primeiro,
-- nas três, e a ordem de recriação é a de dependência (mensal → resumo →
-- indicadores, cada uma chamando a anterior).
drop function if exists public.com_cashback_indicadores(int, text);
drop function if exists public.com_cashback_resumo(int, text);
drop function if exists public.com_cashback_mensal(int, text);

create or replace function public.com_cashback_mensal(p_ano int, p_filial text default null)
returns table (
  cliente_codigo text, nome text, competencia date, tabela_base text,
  comprado numeric, percentual numeric, cashback numeric, sem_programa boolean,
  sem_tabela boolean
)
language sql stable security invoker
set search_path = public
as $$
  with base as (
    select
      i.cliente_codigo,
      i.competencia,
      -- Achado 6.6 da auditoria: o `filter` era redundante — o `where`
      -- desta CTE já restringe a `classe in ('venda', 'devolucao')`, então
      -- todo grupo já chega filtrado. `coalesce` fica porque nunca é demais
      -- contra a soma vazia, mas o filtro duplicado saiu.
      coalesce(sum(i.valor_curva), 0) as comprado
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
    (case when cf.tem_programa then cf.faixa_percentual else null end) as percentual,
    (case
       when not cf.tem_programa then null
       when cf.faixa_percentual is null then 0
       else round(cf.comprado * cf.faixa_percentual / 100, 2)
     end) as cashback,
    -- `sem_programa` só é verdadeiro quando o cliente TEM tabela e ela não
    -- tem grade (REVENDA/SALÃO REF/DIRETORIA) — nunca quando ele não tem
    -- tabela nenhuma, que agora é `sem_tabela`.
    (cf.tabela_base is not null and not cf.tem_programa) as sem_programa,
    (cf.tabela_base is null) as sem_tabela
  from com_faixa cf
  order by nome, cf.competencia;
$$;

grant execute on function public.com_cashback_mensal(int, text) to authenticated;

create or replace function public.com_cashback_resumo(p_ano int, p_filial text default null)
returns table (
  cliente_codigo text, nome text, tabela_base text, sem_programa boolean,
  comprado numeric, cashback numeric, meses_com_direito bigint,
  ultima_competencia date, ultima_faixa numeric,
  meta_para_ativar numeric, falta_proxima_faixa numeric, menor_distancia numeric,
  sem_tabela boolean
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
      -- `tabela_base` é atributo ATUAL do cliente (§0), o mesmo em todo mês
      -- dele no recorte — `bool_and` nunca varia de um mês para outro.
      bool_and(m.sem_tabela) as sem_tabela,
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
    md.menor_distancia,
    a.sem_tabela
  from agregado a
  left join ultimo_mes um on um.cliente_codigo = a.cliente_codigo
  left join proxima_faixa pf on pf.cliente_codigo = a.cliente_codigo
  left join menor_dist md on md.cliente_codigo = a.cliente_codigo
  order by a.nome;
$$;

grant execute on function public.com_cashback_resumo(int, text) to authenticated;

create or replace function public.com_cashback_indicadores(p_ano int, p_filial text default null)
returns table (
  cashback_total numeric, comprado_total numeric, percentual numeric,
  clientes_nao_atingiram bigint, clientes_sem_programa bigint,
  clientes_sem_tabela bigint
)
language sql stable security invoker
set search_path = public
as $$
  with resumo as (
    select * from public.com_cashback_resumo(p_ano, p_filial)
  ),
  com_programa as (
    -- `sem_tabela` entrou na exclusão: antes de existir a coluna, todo
    -- cliente sem tabela já saía com `sem_programa = true` e ficava fora
    -- daqui por tabela; agora as duas flags são exclusivas, então os dois
    -- filtros precisam continuar excluindo quem não gera cashback.
    select * from resumo where not sem_programa and not sem_tabela
  )
  select
    coalesce((select sum(cashback) from com_programa), 0) as cashback_total,
    coalesce((select sum(comprado) from resumo), 0) as comprado_total,
    (case when coalesce((select sum(comprado) from com_programa), 0) = 0 then null
      else round((select sum(cashback) from com_programa) / (select sum(comprado) from com_programa) * 100, 2)
    end) as percentual,
    (select count(*) from com_programa where coalesce(cashback, 0) = 0 and comprado > 0) as clientes_nao_atingiram,
    (select count(*) from resumo where sem_programa) as clientes_sem_programa,
    (select count(*) from resumo where sem_tabela) as clientes_sem_tabela;
$$;

grant execute on function public.com_cashback_indicadores(int, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 — a ficha do cliente ganha `p_filial` (§1a/§11: ao filtrar por empresa,
-- o painel INTEIRO recalcula, fichas inclusive — `null` continua sendo "as
-- duas", como nas funções irmãs). Assinatura muda (parâmetro novo): `drop`
-- explícito antes do `create or replace`, porque só anexar um parâmetro no
-- fim NÃO substitui a função de 3 argumentos — cria uma segunda, e quem
-- chama com 3 continuaria na antiga (mesmo padrão já usado em
-- `20261001020000_whatsapp_correcoes_da_auditoria.sql`).
--
-- Também corrige o achado 6.1: `nunca_comprou`/`nunca_comprou_total`
-- passam a usar o MESMO critério de `comprou` (classe in ('venda',
-- 'devolucao')) para decidir se o cliente já teve o produto — bonificação
-- não conta como compra em nenhum dos dois lugares agora. Um produto só
-- bonificado (nunca vendido a este cliente) continua aparecendo em
-- `nunca_comprou`: ele nunca foi COMPRADO, só recebido — `bonificado` é o
-- balde certo para isso, e não substitui a pergunta de `nunca_comprou`.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.com_ficha_cliente(text, date, date);

create or replace function public.com_ficha_cliente(p_codigo text, p_de date, p_ate date, p_filial text default null)
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
    and classe = 'venda' and emissao between p_de and p_ate
    and (p_filial is null or filial = p_filial);

  select coalesce(jsonb_agg(x order by x.valor desc), '[]'::jsonb) into v_comprou
  from (
    select i.produto_codigo, coalesce(max(p.nome), i.produto_codigo) as nome,
           sum(i.valor_curva) as valor, sum(i.quantidade_curva) as quantidade
    from public.com_vendas_itens i
    left join public.com_produtos p on p.tenant_id = i.tenant_id and p.codigo = i.produto_codigo
    where i.tenant_id = v_tenant_id and i.cliente_codigo = p_codigo
      and i.classe in ('venda', 'devolucao') and i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
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
      and (p_filial is null or i.filial = p_filial)
    group by i.produto_codigo
  ) x;

  if v_ultimo_mes is not null then
    v_m1 := (v_ultimo_mes - interval '1 month')::date;
    v_m2 := (v_ultimo_mes - interval '2 month')::date;
    v_m3 := (v_ultimo_mes - interval '3 month')::date;

    select coalesce(jsonb_agg(x order by x.nome), '[]'::jsonb) into v_parou
    from (
      with meses3 as (
        select distinct produto_codigo, competencia
        from public.com_vendas_itens
        where tenant_id = v_tenant_id and cliente_codigo = p_codigo
          and classe = 'venda' and competencia in (v_m1, v_m2, v_m3)
          and (p_filial is null or filial = p_filial)
      ),
      contagem as (
        select produto_codigo, count(*) as meses from meses3 group by produto_codigo
      ),
      comprou_ultimo as (
        select distinct produto_codigo
        from public.com_vendas_itens
        where tenant_id = v_tenant_id and cliente_codigo = p_codigo
          and classe = 'venda' and competencia = v_ultimo_mes
          and (p_filial is null or filial = p_filial)
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

  select count(*) into v_nunca_total
  from public.com_produtos pr
  where pr.tenant_id = v_tenant_id
    and not exists (
      select 1 from public.com_vendas_itens i
      where i.tenant_id = v_tenant_id and i.produto_codigo = pr.codigo
        and i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
        and i.emissao between p_de and p_ate
        and (p_filial is null or i.filial = p_filial)
    );

  select coalesce(jsonb_agg(x order by x.valor_outros desc), '[]'::jsonb) into v_nunca
  from (
    select pr.codigo as produto_codigo, pr.nome,
           coalesce(sum(i2.valor_curva) filter (
             where i2.classe in ('venda', 'devolucao') and i2.cliente_codigo <> p_codigo
           ), 0) as valor_outros
    from public.com_produtos pr
    left join public.com_vendas_itens i2
      on i2.tenant_id = v_tenant_id and i2.produto_codigo = pr.codigo and i2.emissao between p_de and p_ate
      and (p_filial is null or i2.filial = p_filial)
    where pr.tenant_id = v_tenant_id
      and not exists (
        select 1 from public.com_vendas_itens i
        where i.tenant_id = v_tenant_id and i.produto_codigo = pr.codigo
          and i.cliente_codigo = p_codigo and i.classe in ('venda', 'devolucao')
          and i.emissao between p_de and p_ate
          and (p_filial is null or i.filial = p_filial)
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

grant execute on function public.com_ficha_cliente(text, date, date, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 — `useTabelasBase` deixa de trazer `com_clientes` inteira para o
-- navegador (`select('tabela_base')` sem teto, distinct em JS: o PostgREST
-- corta em 1000 em silêncio, e numa empresa com mais de mil clientes as
-- tabelas somem do seletor sem aviso). A conta mora no banco: `distinct` já
-- aqui, sem teto — o resultado é, no máximo, o número de tabelas de preço
-- que existem, nunca o de clientes.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_tabelas_base()
returns table (tabela_base text)
language sql stable security invoker
set search_path = public
as $$
  select distinct c.tabela_base
  from public.com_clientes c
  where c.tenant_id = (select public.get_user_tenant_id())
    and c.tabela_base is not null
  order by c.tabela_base;
$$;

grant execute on function public.com_tabelas_base() to authenticated;
