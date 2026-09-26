-- A lista de clientes do Comercial passa a marcar CONDIÇÃO
--
-- Leva F, item 5. O §11 linha 325 do documento do dono pede a marca, e
-- `DiretoriaClientes.tsx` já a mostra — `(condição)` ao lado do nome. A MESMA
-- lista no Comercial (`ComercialClientes.tsx`) não mostrava, porque
-- `com_clientes_a_trabalhar` não devolvia o campo. Quem abre a ficha vê
-- "(condição)" no título; quem só passa os olhos na lista, não via.
--
-- POR QUE NO BANCO E NÃO NA TELA. Dava para derivar no navegador: a coluna
-- `com_clientes.tabela_base` é gerada por
-- `regexp_replace(tabela_preco, '\s*CONDICAO$', '')`, então "em condição" é
-- `tabela_preco <> tabela_base`. Escrever essa regex no TypeScript seria a
-- segunda cópia da mesma regra — e a primeira coisa que acontece com duas cópias
-- é uma ser corrigida sozinha. A coluna `com_clientes.em_condicao` já existe e é
-- de onde `com_faturamento_por_cliente`, `com_ficha_identificacao` e
-- `com_pedidos_em_condicao` leem. Esta função passa a ler do mesmo lugar.
--
-- `drop` antes do `create` porque o tipo de retorno muda — `create or replace`
-- recusa acrescentar coluna ao `returns table`.
--
-- O CORPO É O DA MIGRATION DE ORIGEM (20261015020000), copiado por script e não
-- à mão, com DUAS mudanças: a coluna no `returns table` e a expressão no select
-- final. Conferido com `scripts/diff-corpo-funcao.mjs`, que existe por causa da
-- vez em que eu reescrevi `com_ficha_indicadores` de cabeça e apaguei uma regra
-- (CI #103).

drop function if exists public.com_clientes_a_trabalhar(int, text);

create or replace function public.com_clientes_a_trabalhar(p_ano int, p_filial text default null)
returns table (
  cliente_codigo text, nome text, tabela_preco text,
  ultima_compra date, valor_ultimos_3m numeric, em_condicao boolean
)
language plpgsql stable security invoker
set search_path = public
as $$
-- Mesmo motivo do `com_curva_abc`: `cliente_codigo`/`nome`/... são nomes de
-- saída do `returns table` e, sem esta diretiva, uma referência não
-- qualificada a um deles que também exista como coluna de tabela/CTE é
-- recusada com "column reference is ambiguous" (42702), só ao CHAMAR a
-- função.
#variable_conflict use_column
declare
  v_ultimo_mes date;
  v_fim_ancora date;
  v_m1 date;
  v_m2 date;
  v_m3 date;
begin
  select max(competencia) into v_ultimo_mes
  from public.com_vendas_itens
  where classe = 'venda'
    and extract(year from competencia) = p_ano
    and (p_filial is null or filial = p_filial);

  if v_ultimo_mes is null then
    return;
  end if;

  v_m1 := (v_ultimo_mes - interval '1 month')::date;
  v_m2 := (v_ultimo_mes - interval '2 month')::date;
  v_m3 := (v_ultimo_mes - interval '3 month')::date;
  -- A6: fim do mês-âncora — o teto que `ultima_compra` respeita agora.
  v_fim_ancora := (v_ultimo_mes + interval '1 month' - interval '1 day')::date;

  return query
  with meses_venda as (
    select distinct tenant_id, cliente_codigo, competencia
    from public.com_vendas_itens
    where classe = 'venda'
      and competencia in (v_m1, v_m2, v_m3)
      and (p_filial is null or filial = p_filial)
  ),
  contagem as (
    select tenant_id, cliente_codigo, count(*) as meses
    from meses_venda
    group by tenant_id, cliente_codigo
  ),
  valor_3m as (
    select tenant_id, cliente_codigo, coalesce(sum(valor_curva), 0) as valor
    from public.com_vendas_itens
    where classe in ('venda', 'devolucao')
      and competencia in (v_m1, v_m2, v_m3)
      and (p_filial is null or filial = p_filial)
    group by tenant_id, cliente_codigo
  ),
  -- A7: tenant_id explícito, como as demais CTEs desta função.
  compradores_ultimo_mes as (
    select distinct tenant_id, cliente_codigo
    from public.com_vendas_itens
    where classe = 'venda'
      and competencia = v_ultimo_mes
      and (p_filial is null or filial = p_filial)
  ),
  -- A6: `emissao <= v_fim_ancora` — nunca mais todo o histórico do cliente.
  ultima as (
    select tenant_id, cliente_codigo, max(emissao) as ultima_compra
    from public.com_vendas_itens
    where classe = 'venda'
      and emissao <= v_fim_ancora
      and (p_filial is null or filial = p_filial)
    group by tenant_id, cliente_codigo
  )
  select
    ct.cliente_codigo,
    coalesce(max(c.razao_social), ct.cliente_codigo) as nome,
    max(c.tabela_preco) as tabela_preco,
    max(u.ultima_compra) as ultima_compra,
    coalesce(max(v3.valor), 0) as valor_ultimos_3m,
    -- A MARCA DE CONDIÇÃO (leva F, 2026-09-26): a mesma expressão que
    -- `com_faturamento_por_cliente` já usa, sobre a MESMA coluna
    -- `com_clientes.em_condicao`. A regra do que é condição continua morando num
    -- lugar só — no banco, na coluna — e esta função passa a devolvê-la porque a
    -- lista do Comercial precisava dela e não tinha.
    coalesce(bool_or(c.em_condicao), false) as em_condicao
  from contagem ct
  left join valor_3m v3 on v3.tenant_id = ct.tenant_id and v3.cliente_codigo = ct.cliente_codigo
  left join ultima u on u.tenant_id = ct.tenant_id and u.cliente_codigo = ct.cliente_codigo
  left join public.com_clientes c on c.tenant_id = ct.tenant_id and c.codigo = ct.cliente_codigo
  where ct.meses >= 2
    -- A7: o anti-join agora casa tenant_id + cliente_codigo, não só o código.
    and not exists (
      select 1 from compradores_ultimo_mes cum
      where cum.tenant_id = ct.tenant_id and cum.cliente_codigo = ct.cliente_codigo
    )
  group by ct.tenant_id, ct.cliente_codigo
  order by nome;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- E O REVOKE, QUE EU ESQUECI E O CI #115 PEGOU.
--
-- `drop` + `create` NÃO preserva privilégio: a função renasce com o padrão do
-- schema, que inclui `execute` para PUBLIC (e `anon` é público). A migration
-- 20261028010000 tinha fechado as 146 funções não-gatilho para `anon`; esta,
-- rodando depois, reabriu UMA — justamente a que ela recria.
--
-- A asserção 1 de `anon_so_nas_portas_publicas.test.sql` acusou, com o nome dela
-- na mensagem: "have: {com_clientes_a_trabalhar, crm_form_publico, …}". É para
-- isso que a catraca existe, e é a segunda vez no dia que ela paga o preço de ter
-- sido escrita.
--
-- **A regra que fica:** toda migration que faz `drop function` + `create` de uma
-- função do schema `public` termina com este par. `create or replace` sozinho
-- preserva a ACL e não precisa — o que reabre é o `drop`.
-- ═══════════════════════════════════════════════════════════════════════════
revoke all on function public.com_clientes_a_trabalhar(int, text) from public, anon;
grant execute on function public.com_clientes_a_trabalhar(int, text) to authenticated;
