-- Correção de 2026-09-22: só um comentário — nenhuma coluna, parâmetro ou
-- comportamento muda. Registra por que `p_criterio` decide quais células
-- `com_matriz_produto_cliente` devolve, para não virar "achado de bug" seis
-- meses depois. `create or replace` serve aqui porque o retorno não muda
-- de forma — comparar com 20261019020000, que precisou de `drop` por
-- adicionar coluna. Idempotente: pode ser reaplicada sem erro.
create or replace function public.com_matriz_produto_cliente(
  p_de date, p_ate date, p_filial text default null, p_criterio text default 'valor'
)
returns table (
  produto_codigo text, produto_nome text, cliente_codigo text, cliente_nome text,
  valor numeric, quantidade numeric, maximo numeric
)
language plpgsql stable security invoker
set search_path = public
as $$
-- Mesmo motivo do `com_curva_abc`: os nomes de saída também são nomes de
-- coluna nas CTEs abaixo, e sem esta diretiva o Postgres recusa com
-- "column reference is ambiguous" (42702), só ao CHAMAR a função.
#variable_conflict use_column
-- POR QUE `p_criterio` MUDA QUAIS CÉLULAS APARECEM (não é bug, é a
-- definição de "célula com movimento"):
--
-- `valor` e `quantidade` SEMPRE vêm os dois em toda célula devolvida — o
-- critério nunca escolhe qual coluna mostrar, isso é decisão da TELA
-- (ela reusa o mesmo seletor de critério das telas irmãs, de propósito:
-- duas alavancas para a mesma pergunta seria pior). O que o critério
-- decide, dentro desta função, é (1) o que conta como "teve movimento" —
-- o filtro que decide se a célula aparece — e (2) qual é o `maximo`
-- devolvido para a escala de cor.
--
-- Exemplo real do lote de teste (`comercial_visao_do_diretor.test.sql`):
-- PGRATIS×CLI1 tem `valor = 0` (a nota saiu com `valor_nota = 0`, uma
-- amostra/brinde) e `quantidade = 50` (50 unidades saíram de fato). Sob
-- `p_criterio = 'valor'` essa célula FICA DE FORA da matriz (não houve
-- faturamento); sob `p_criterio = 'quantidade'` ela ENTRA (50 unidades é
-- movimento). As duas respostas estão certas — são perguntas diferentes.
-- Se um dia esta célula "desaparecer e reaparecer" trocando o seletor de
-- critério na tela, isto NÃO é o bug: é o critério fazendo o que este
-- comentário descreve.
begin
  if p_criterio not in ('valor', 'quantidade') then
    raise exception 'p_criterio inválido: % — use ''valor'' ou ''quantidade''.', p_criterio;
  end if;

  return query
  with celulas as (
    select
      i.produto_codigo,
      coalesce(max(p.nome), i.produto_codigo) as produto_nome,
      i.cliente_codigo,
      coalesce(max(c.razao_social), i.cliente_codigo) as cliente_nome,
      sum(i.valor_curva) as valor,
      sum(i.quantidade_curva) as quantidade
    from public.com_vendas_itens i
    left join public.com_produtos p on p.tenant_id = i.tenant_id and p.codigo = i.produto_codigo
    left join public.com_clientes c on c.tenant_id = i.tenant_id and c.codigo = i.cliente_codigo
    where i.classe in ('venda', 'devolucao')
      and i.emissao between p_de and p_ate
      and (p_filial is null or i.filial = p_filial)
    group by i.produto_codigo, i.cliente_codigo
  ),
  filtradas as (
    select * from celulas
    where (case when p_criterio = 'valor' then valor else quantidade end) <> 0
  )
  select
    f.produto_codigo, f.produto_nome, f.cliente_codigo, f.cliente_nome,
    f.valor, f.quantidade,
    max(case when p_criterio = 'valor' then f.valor else f.quantidade end) over () as maximo
  from filtradas f;
end;
$$;

grant execute on function public.com_matriz_produto_cliente(date, date, text, text) to authenticated;
