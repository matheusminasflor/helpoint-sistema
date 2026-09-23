-- Frente 3 — a organização que o dono descreveu
-- (.scratch/plano-frente3-organizacao.md). Idempotente: `create or replace
-- function` e `drop policy if exists` podem ser reaplicados sem erro.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Vendas + Curva ABC vão fundir numa página só (item 1 do plano). Hoje
-- `com_painel_totais`/`com_faturamento_mensal` só filtram por `p_ano`
-- (ano inteiro); `com_curva_abc` já filtra por `p_de`/`p_ate`. Fundir as
-- páginas sem dar o mesmo filtro às duas deixaria o topo da página (os
-- indicadores) ignorando o período enquanto o meio (a curva) responde —
-- pior que o estado atual.
--
-- `p_de`/`p_ate` entram como parâmetros NOVOS, opcionais, no fim da lista —
-- nenhuma chamada existente (por posição ou por nome) quebra. Quando os dois
-- vêm preenchidos, filtram por `emissao` (o mesmo campo que `com_curva_abc`
-- usa); `p_ano` continua valendo como conveniência para quem não os informar
-- — é a mesma tela hoje, sem seletor de período, que continua funcionando.
-- ═══════════════════════════════════════════════════════════════════════════
-- `drop function` primeiro: `p_de`/`p_ate` são parâmetros NOVOS, e Postgres
-- trata assinatura diferente como função diferente — sem o drop, a
-- assinatura antiga (3 parâmetros) fica no catálogo ao lado da nova (5
-- parâmetros) e uma chamada com 3 argumentos passa a bater com as DUAS
-- (a nova tem `p_de`/`p_ate` com default), o que o Postgres recusa como
-- "function is not unique" — confirmado ao aplicar contra o test-helpoint.
drop function if exists public.com_painel_totais(integer, text, text);
drop function if exists public.com_faturamento_mensal(integer, text, text);

create or replace function public.com_painel_totais(
  p_ano integer,
  p_filial text default null,
  p_serie text default null,
  p_de date default null,
  p_ate date default null
)
returns table(venda numeric, devolucao numeric, liquido numeric, bonificacao numeric, unidades numeric, clientes_ativos bigint, skus_vendidos bigint)
language sql stable
set search_path to 'public'
as $function$
  select
    coalesce(sum(i.valor_nota) filter (where i.classe = 'venda'), 0),
    coalesce(sum(abs(i.valor_nota)) filter (where i.classe = 'devolucao'), 0),
    coalesce(sum(i.valor_curva) filter (where i.classe in ('venda','devolucao')), 0),
    coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0),
    coalesce(sum(i.quantidade_curva) filter (where i.classe in ('venda','devolucao')), 0),
    count(distinct i.cliente_codigo) filter (where i.classe = 'venda'),
    count(distinct i.produto_codigo) filter (where i.classe = 'venda')
  from public.com_vendas_itens i
  where (
      case
        when p_de is not null and p_ate is not null then i.emissao between p_de and p_ate
        else extract(year from i.competencia) = p_ano
      end
    )
    and (p_filial is null or i.filial = p_filial)
    and (p_serie is null or i.serie = p_serie);
$function$;

create or replace function public.com_faturamento_mensal(
  p_ano integer,
  p_filial text default null,
  p_serie text default null,
  p_de date default null,
  p_ate date default null
)
returns table(competencia date, filial text, serie text, venda numeric, devolucao numeric, liquido numeric, bonificacao numeric, unidades numeric, clientes_ativos bigint, skus_vendidos bigint)
language sql stable
set search_path to 'public'
as $function$
  select
    i.competencia, i.filial, i.serie,
    coalesce(sum(i.valor_nota) filter (where i.classe = 'venda'), 0) as venda,
    coalesce(sum(abs(i.valor_nota)) filter (where i.classe = 'devolucao'), 0) as devolucao,
    coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as liquido,
    coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao'), 0) as bonificacao,
    coalesce(sum(i.quantidade) filter (where i.classe = 'venda'), 0) as unidades,
    count(distinct i.cliente_codigo) filter (where i.classe = 'venda') as clientes_ativos,
    count(distinct i.produto_codigo) filter (where i.classe = 'venda') as skus_vendidos
  from public.com_vendas_itens i
  where (
      case
        when p_de is not null and p_ate is not null then i.emissao between p_de and p_ate
        else extract(year from i.competencia) = p_ano
      end
    )
    and (p_filial is null or i.filial = p_filial)
    and (p_serie is null or i.serie = p_serie)
  group by i.competencia, i.filial, i.serie
  order by i.competencia, i.filial, i.serie;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Item 3 do plano — faturamento por cliente, evolução por faixa, matriz
-- produto × cliente, tendência produto a produto e detalhe do produto vão
-- para a Diretoria (§14 do documento do dono). `/diretoria` abre para módulo
-- Diretoria OU gestor (has_diretoria_access com fallback de cargo) — e essas
-- telas leem `com_vendas_itens`, `com_clientes` e `com_produtos`, protegidas
-- só por `has_comercial_access`. Um diretor com só o módulo Diretoria
-- chegaria e veria tabela vazia, sem erro nenhum.
--
-- Decisão do dono (registrada no plano, não minha): o SELECT das três passa
-- a aceitar `has_comercial_access OR has_diretoria_access`. Mesmo padrão já
-- usado em com_carteiras/com_carteira_membros (migration
-- 20261017030000_comercial_diretor_enxerga_carteira.sql) — nenhuma tabela
-- nova, nenhuma policy de escrita tocada.
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists com_vendas_itens_select on public.com_vendas_itens;
create policy com_vendas_itens_select on public.com_vendas_itens for select
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.has_comercial_access(auth.uid()))
       or (select public.has_diretoria_access(auth.uid()))));

drop policy if exists com_clientes_select on public.com_clientes;
create policy com_clientes_select on public.com_clientes for select
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.has_comercial_access(auth.uid()))
       or (select public.has_diretoria_access(auth.uid()))));

drop policy if exists com_produtos_select on public.com_produtos;
create policy com_produtos_select on public.com_produtos for select
  using (tenant_id = (select public.get_user_tenant_id())
     and ((select public.has_comercial_access(auth.uid()))
       or (select public.has_diretoria_access(auth.uid()))));
