-- O FAROL DA BONIFICAÇÃO — as três perguntas que a apuração de 2026-09-25
-- mostrou que valem a pena, e que hoje ninguém faz sem procurar.
--
-- O que a apuração achou, na INBRAS: a bonificação saiu de 6-11% da venda
-- (jan-mar/2025) para 44% em abril/2025 e daí subiu até passar de 100% em
-- alguns meses de 2026. Não é um cliente nem um mês — são 21 a 56 clientes
-- por mês. Mas dentro disso há casos que pedem decisão:
--
--   • 10 clientes receberam R$ 117.799,63 em 2026 SEM COMPRAR NADA;
--   • 21 receberam mais do que compraram;
--   • o STYLO REPARADOR DE PONTAS saiu 21.117 unidades de graça contra 2.961
--     vendidas, e a ÁGUA OXIGENADA 20 VOL, 4.246 contra 135.
--
-- SÓ A SÉRIE 75 ENTRA AQUI. A série 1 no mesmo CFOP é publicidade (regra do
-- dono, 2026-09-25) — material de propaganda é gasto de marketing, outra
-- pergunta, outro dono. Misturar as duas foi o que escondeu isto até agora.
--
-- AS FUNÇÕES DEVOLVEM SÓ QUEM ACENDE O FAROL, não a base inteira: é o que
-- dispensa o teto de 500 linhas (`buscarComTeto`) e, mais importante, o que
-- faz a tela ser um farol em vez de mais uma tabela para o dono varrer.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Por cliente — quem recebe demais, e por quê.
--
-- `comprado` soma as DUAS séries, porque as duas são faturamento (a série 75
-- é sem nota mas é cobrada). Comparar bonificação da série 75 contra a venda
-- só da série 75 daria um percentual inventado — e é exatamente o que
-- `com_bonificacao_por_cliente` faz quando recebe `p_serie`, razão de esta
-- função existir separada em vez de eu mexer naquela: lá o `p_serie` é o
-- filtro da TELA analítica, e tem de continuar filtrando os dois lados.
--
-- `motivo` em vez de dois `returns` ou duas funções: a tela precisa das duas
-- listas na mesma seção, e uma coluna resolve sem duplicar a conta.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_bonificacao_farol_clientes(
  p_de date, p_ate date, p_filial text default null
)
returns table (
  cliente_codigo text, nome text, tabela_preco text,
  bonificacao numeric, comprado numeric, percentual numeric, motivo text
)
language sql stable security invoker
set search_path = public
as $$
  with base as (
    select
      i.cliente_codigo,
      coalesce(max(c.razao_social), i.cliente_codigo) as nome,
      max(c.tabela_preco) as tabela_preco,
      coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao' and i.serie <> '1'), 0) as bonificacao,
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as comprado
    from public.com_vendas_itens i
    left join public.com_clientes c on c.tenant_id = i.tenant_id and c.codigo = i.cliente_codigo
    where i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.cliente_codigo
  )
  select
    b.cliente_codigo, b.nome, b.tabela_preco, b.bonificacao, b.comprado,
    -- Nulo quando não comprou nada: dividir por zero não dá "infinito por
    -- cento", dá uma pergunta diferente — e é o `motivo` que a responde.
    (case when b.comprado <= 0 then null else round(b.bonificacao / b.comprado * 100, 2) end) as percentual,
    (case when b.comprado <= 0 then 'sem_compra' else 'recebe_mais' end) as motivo
  from base b
  where b.bonificacao > 0
    and (b.comprado <= 0 or b.bonificacao > b.comprado)
  order by b.bonificacao desc;
$$;

grant execute on function public.com_bonificacao_farol_clientes(date, date, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Por produto — o que sai mais de graça do que vendido.
--
-- A QUANTIDADE vai junto do valor de propósito. O valor da nota de
-- bonificação é praticamente o de tabela (R$ 18,82 contra R$ 22,56 no
-- reparador de pontas), então o valor sozinho não diz se o que saiu foi
-- muito produto barato ou pouco produto caro — e é essa a pergunta de quem
-- vai decidir se a política continua.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.com_bonificacao_farol_produtos(
  p_de date, p_ate date, p_filial text default null
)
returns table (
  produto_codigo text, nome text,
  vendido numeric, bonificado numeric,
  quantidade_vendida numeric, quantidade_bonificada numeric,
  vezes numeric
)
language sql stable security invoker
set search_path = public
as $$
  with base as (
    select
      i.produto_codigo,
      coalesce(max(p.nome), max(i.produto_nome), i.produto_codigo) as nome,
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as vendido,
      coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao' and i.serie <> '1'), 0) as bonificado,
      coalesce(sum(i.quantidade_curva) filter (where i.classe in ('venda', 'devolucao')), 0) as quantidade_vendida,
      coalesce(sum(i.quantidade) filter (where i.classe = 'bonificacao' and i.serie <> '1'), 0) as quantidade_bonificada
    from public.com_vendas_itens i
    left join public.com_produtos p on p.tenant_id = i.tenant_id and p.codigo = i.produto_codigo
    where i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.produto_codigo
  )
  select
    b.produto_codigo, b.nome, b.vendido, b.bonificado,
    b.quantidade_vendida, b.quantidade_bonificada,
    -- "Quantas vezes mais saiu de graça", em QUANTIDADE — é o número que o
    -- dono lê sem traduzir. Nulo quando não vendeu nenhuma unidade: aí não
    -- existe "quantas vezes", existe "nunca foi vendido", e a tela diz isso
    -- com palavra em vez de número.
    (case when b.quantidade_vendida <= 0 then null
          else round(b.quantidade_bonificada / b.quantidade_vendida, 1) end) as vezes
  from base b
  where b.bonificado > 0 and b.quantidade_bonificada > b.quantidade_vendida
  order by b.bonificado desc;
$$;

grant execute on function public.com_bonificacao_farol_produtos(date, date, text) to authenticated;
