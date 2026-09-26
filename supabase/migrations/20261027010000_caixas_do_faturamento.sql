-- As CAIXAS do faturamento — uma conta só, num lugar só
--
-- Pedido do dono (2026-09-25): "o relatório de insights comercial e diretor
-- precisa estar 100% preciso e funcional. Me preocupo com os dados fugirem da
-- realidade. O diretor e o comercial precisam saber quanto foi faturado, o que
-- foi de bonificação, o que foi de cashback. As coisas precisam estar bem
-- claras."
--
-- O QUE ESTAVA ERRADO, medido na base de teste (4 anos, R$ 15.784.604,32
-- importados):
--
--   classe             série    valor           aparece na tela?
--   venda                1       9.391.575,53   sim
--   venda               75         888.952,28   sim (misturada na anterior)
--   bonificacao         75       3.078.433,78   sim
--   bonificacao          1       2.181.653,04   sim (misturada na anterior)
--   industrializacao     1         241.515,58   NÃO
--   outros              75           2.474,11   NÃO
--   outros               1               0,00   NÃO
--
-- `com_painel_totais` e `com_faturamento_mensal` só têm caixa para `venda`,
-- `devolucao` e `bonificacao`. As outras duas classes que `com_classe_do_cfop`
-- sabe produzir — `industrializacao` e `outros` — não têm caixa em nenhuma
-- tela: R$ 243.989,69 entram pela importação e não saem em lugar nenhum. E o
-- pior não é o valor de hoje, é o silêncio: no dia em que a Minasflor mandar
-- industrializar de verdade, o dinheiro evapora da tela sem nada acusar.
--
-- A RESPOSTA. Uma função que devolve TODAS as caixas de uma janela, mais o
-- total importado dela, mais a sobra entre os dois. Nada se perde porque a
-- sobra é uma coluna: se um dia der diferente de zero, a tela mostra em vez de
-- esconder, e o pgTAP reprova antes de chegar na tela.
--
-- TRÊS DECISÕES QUE PRECISAM DE EXPLICAÇÃO:
--
-- 1. NÃO EXISTE `p_serie` aqui, de propósito. A série é COLUNA do resultado
--    (`venda_com_nota` × `venda_sem_nota`), nunca filtro. Com filtro de série,
--    uma das duas viraria zero e as caixas deixariam de fechar contra o total
--    importado — que é exatamente a propriedade que esta função existe para
--    garantir. Quem precisa de uma série só continua usando
--    `com_painel_totais`/`com_faturamento_mensal`, que têm `p_serie`.
--
-- 2. AS CAIXAS SÃO BRUTAS (`abs(valor_nota)`) — "quanto dinheiro passou por
--    esta porta". Só assim a soma delas é idêntica ao total importado, seja
--    qual for o sinal que o Forteplus imprima na devolução. O número de
--    NEGÓCIO com sinal continua existindo, em `faturamento_liquido`, que é
--    venda menos devolução. Conferido na base: nenhuma linha tem `valor_nota`
--    negativo ou nulo hoje, então bruto e com sinal dão o mesmo — a escolha é
--    para quando a primeira devolução chegar.
--
-- 3. `outros` É A CLASSE `outros`, não "todo o resto". Escrever
--    `classe not in (...)` faria as caixas fecharem sempre, por construção, e
--    o teste de fechamento nunca acusaria nada. Como está, uma classe nova que
--    alguém acrescente ao `com_classe_do_cfop` sem caixa aqui aparece na sobra
--    e reprova o pgTAP. O teste só vale porque a soma PODE não fechar.
--
-- O CASHBACK NÃO É CAIXA e não entra aqui. Cashback é apuração — o direito que
-- o cliente acumulou, calculado a partir da venda por `com_cashback_resumo`.
-- O que saiu de produto por causa dele já está dentro de `bonificacao`. Somar
-- os dois contaria a mesma mercadoria duas vezes. As telas mostram os dois
-- lado a lado (apurado × entregue), que é a comparação útil, e nunca somados.

-- Sem `security definer`: a policy de SELECT de `com_vendas_itens` já libera
-- para quem tem acesso ao Comercial **ou** à Diretoria, que são exatamente os
-- dois lados que leem esta função. `anon` cai fora sozinho —
-- `get_user_tenant_id()` volta nulo e nenhuma linha casa. Uma
-- `security definer` aqui seria uma porta a mais para vigiar sem nada em troca
-- (ver `com_conciliacao`, que precisa dela por causa de `metas_ano`).
create or replace function public.com_caixas(
  p_ano integer,
  p_filial text default null,
  p_de date default null,
  p_ate date default null
)
returns table (
  venda_com_nota numeric,
  venda_sem_nota numeric,
  venda_total numeric,
  devolucao numeric,
  faturamento_liquido numeric,
  bonificacao numeric,
  industrializacao numeric,
  outros numeric,
  total_importado numeric,
  fora_das_caixas numeric,
  unidades_vendidas numeric,
  unidades_bonificadas numeric,
  clientes_ativos bigint,
  skus_vendidos bigint
)
language sql
stable
set search_path = public
as $$
  with base as (
    select i.*
    from public.com_vendas_itens i
    -- A MESMA janela de `com_painel_totais`, copiada palavra por palavra: ou as
    -- duas concordam, ou uma tela mostra um número e a outra mostra outro para
    -- o mesmo período. O pgTAP compara as duas funções justamente aqui.
    where (case when p_de is not null and p_ate is not null then i.emissao between p_de and p_ate
                else extract(year from i.competencia) = p_ano end)
      and (p_filial is null or i.filial = p_filial)
  ),
  caixas as (
    select
      coalesce(sum(abs(b.valor_nota)) filter (where b.classe = 'venda' and b.serie = '1'), 0) as venda_com_nota,
      coalesce(sum(abs(b.valor_nota)) filter (where b.classe = 'venda' and b.serie <> '1'), 0) as venda_sem_nota,
      coalesce(sum(abs(b.valor_nota)) filter (where b.classe = 'devolucao'), 0) as devolucao,
      coalesce(sum(abs(b.valor_nota)) filter (where b.classe = 'bonificacao'), 0) as bonificacao,
      coalesce(sum(abs(b.valor_nota)) filter (where b.classe = 'industrializacao'), 0) as industrializacao,
      coalesce(sum(abs(b.valor_nota)) filter (where b.classe = 'outros'), 0) as outros,
      coalesce(sum(abs(b.valor_nota)), 0) as total_importado,
      -- Unidades pela coluna gerada, como `com_painel_totais` — nunca por
      -- `quantidade` crua, que é o que `com_faturamento_mensal` usa e que dá o
      -- mesmo resultado só enquanto não existir devolução nenhuma.
      coalesce(sum(b.quantidade_curva) filter (where b.classe in ('venda','devolucao')), 0) as unidades_vendidas,
      coalesce(sum(abs(b.quantidade)) filter (where b.classe = 'bonificacao'), 0) as unidades_bonificadas,
      count(distinct b.cliente_codigo) filter (where b.classe = 'venda') as clientes_ativos,
      count(distinct b.produto_codigo) filter (where b.classe = 'venda') as skus_vendidos
    from base b
  )
  select
    c.venda_com_nota,
    c.venda_sem_nota,
    c.venda_com_nota + c.venda_sem_nota as venda_total,
    c.devolucao,
    c.venda_com_nota + c.venda_sem_nota - c.devolucao as faturamento_liquido,
    c.bonificacao,
    c.industrializacao,
    c.outros,
    c.total_importado,
    c.total_importado
      - (c.venda_com_nota + c.venda_sem_nota + c.devolucao + c.bonificacao
         + c.industrializacao + c.outros) as fora_das_caixas,
    c.unidades_vendidas,
    c.unidades_bonificadas,
    c.clientes_ativos,
    c.skus_vendidos
  from caixas c;
$$;

comment on function public.com_caixas(integer, text, date, date) is
  'Todas as caixas do faturamento de uma janela, mais o total importado e a sobra entre os dois. Sem p_serie de propósito: a série é coluna, não filtro. Caixas brutas (abs) para fecharem contra o total; faturamento_liquido é o número com sinal. Cashback não é caixa — é apuração, e já está dentro de bonificacao.';

-- `revoke ... from public` NÃO basta, e isto foi medido: o Supabase tem
-- `alter default privileges` dando `execute` a `anon`, `authenticated` e
-- `service_role` em toda função nova do schema `public`. O grant para `anon` é
-- DIRETO, não herdado de `public` — revogar de `public` deixa
-- `has_function_privilege('anon', …)` valendo `true`. É por isso que as 50 e
-- tantas RPCs do Comercial estão hoje abertas para `anon` (leva B do
-- docs/plano-geral.md). Esta função nasce fora dessa dívida, e o pgTAP prende:
-- a próxima vez que alguém recriar a função sem este revoke, o teste acusa.
revoke all on function public.com_caixas(integer, text, date, date) from public;
revoke all on function public.com_caixas(integer, text, date, date) from anon;
grant execute on function public.com_caixas(integer, text, date, date) to authenticated;

-- ── A MESMA conta de unidades nas duas funções ──────────────────────────────
-- `com_painel_totais` conta unidades por `quantidade_curva` (a coluna gerada,
-- que já soma a venda e SUBTRAI a devolução); `com_faturamento_mensal` contava
-- por `quantidade` crua filtrando só `classe = 'venda'`. As duas dão o mesmo
-- resultado exatamente enquanto não existir devolução nenhuma — que é o caso da
-- base de hoje, e é o que escondeu a divergência. Com uma devolução no mês, o
-- cartão do topo mostraria 11 unidades e a tabela do meio 12, sem nada explicar.
--
-- Nada mais muda: o corpo abaixo é o da migration de origem, com UMA expressão
-- trocada (conferido com scripts/diff-corpo-funcao.mjs).
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
    coalesce(sum(i.quantidade_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as unidades,
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
