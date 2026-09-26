-- O farol do cashback — só o que pede uma ligação ou uma decisão
--
-- Leva D do docs/plano-geral.md, a outra metade da etapa 5: o par do farol de
-- bonificação, que já está no ar. Três perguntas, desenhadas com o dono em
-- 2026-09-26 sobre os dados reais de 2026, e confirmadas por ele:
--
--   1. quem está PERTO DE BATER  → uma ligação resolve;
--   2. quem está SEM TABELA no cadastro → conserte o cadastro;
--   3. quais TABELAS não têm faixa → é de propósito?
--
-- O analítico desta tela já existia e está completo (indicadores, grades, "com
-- direito", "não atingiram", evolução mês a mês). O que faltava era o corte: uma
-- lista de 20 nomes ordenada por distância não é farol, é relatório. Farol é o
-- que sobra depois de tirar o que não pede ação.
--
-- ══ O CORTE DO "PERTO DE BATER", E POR QUE 25% NÃO É NÚMERO INVENTADO ═══════
--
-- Medido nos 20 clientes que compraram e não atingiram nenhum mínimo em 2026:
--
--   LA BELLE D'MOC      faltou 18,2% da faixa
--   PAULA ANASTÁCIA     faltou 20,1%
--   JABNEELL ROCHA      faltou 24,2%
--   ─────────────────────────────────  ← a quebra está aqui
--   PATRICIA FIUSA      faltou 44,2%
--   JACQUELINE M. O.    faltou 65,3%
--   … e mais 15, até 99,3% (um comprou R$ 33 contra uma faixa de R$ 5.000)
--
-- Os dados têm um vão de vinte pontos entre o terceiro e o quarto. Qualquer corte
-- entre 25% e 40% devolve os mesmos três nomes — então o número não está
-- escolhendo a resposta, está descrevendo uma quebra que já existe. O dono
-- escolheu **um quarto**, que também é a frase que se fala ao telefone: "faltou
-- um quarto para você bater a faixa".
--
-- Chamar de "perto de bater" quem comprou R$ 33 contra R$ 5.000 seria mentir com
-- um rótulo gentil — e é exatamente o que uma lista sem corte faz.
--
-- ══ O MÊS, NUNCA O ANO — E ISTO É UM DEFEITO QUE ACHEI DE PASSAGEM ══════════
--
-- A faixa de cashback é MENSAL. `com_cashback_resumo` devolve `comprado` do ANO
-- e `menor_distancia` do MELHOR MÊS — dois recortes diferentes, e a tela
-- analítica os punha um ao lado do outro ("Compra no período" e "Faltou").
--
-- Para 12 dos 20 clientes isso não fecha, e o pior caso é claro: RONDINELLY
-- comprou R$ 2.461,76 no ano, em cinco meses, e no melhor deles R$ 839,74. A
-- tela mostrava R$ 2.461,76 ao lado de "faltou R$ 4.160,26" — some, e dá
-- R$ 6.622, não a faixa de R$ 5.000. Dois números verdadeiros lado a lado
-- contando uma história falsa.
--
-- Por isso este farol devolve `competencia`, `comprado_no_mes` e `minimo` — os
-- três que FECHAM: comprado_no_mes + faltou = minimo, sempre. O ano vai junto,
-- em coluna própria e com nome próprio, para quem quiser o contexto.
--
-- ══ O QUE FICA DE FORA, DE PROPÓSITO ════════════════════════════════════════
--
-- **Quem já ganha cashback e quase bateu de novo.** Um cliente que bateu a faixa
-- em janeiro e em junho faltou R$ 100 também merecia uma ligação — mas incluí-lo
-- poria quase todo bom cliente no farol todo mês, e farol que acende sempre não
-- acende nunca. O recorte é: **quem não ganhou NADA no ano** e cujo melhor mês
-- chegou perto. Se um dia o dono quiser o outro, é lista própria, com nome
-- próprio ("quase bateu de novo"), e não este farol inflado.
--
-- **Os 17 que faltaram mais de um quarto.** Continuam no analítico, na tabela
-- "Não atingiram o mínimo", que não some.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Clientes: quem está perto de bater, e quem está fora por falta de cadastro
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.com_cashback_farol_clientes(
  p_ano integer,
  p_filial text default null
)
returns table (
  cliente_codigo text,
  nome text,
  tabela_base text,
  /** O mês em que ele chegou mais perto. Nulo em `sem_tabela`, que não tem faixa. */
  competencia date,
  comprado_no_mes numeric,
  minimo numeric,
  faltou numeric,
  /** Quanto da faixa ele já comprou, em % — 82% significa "faltou 18%". */
  comprou_da_faixa numeric,
  comprado_no_ano numeric,
  motivo text
)
language sql
stable
set search_path = public
as $$
  with mensal as (
    select * from public.com_cashback_mensal(p_ano, p_filial)
  ),
  -- O mínimo de cada tabela: é a primeira faixa, a que o cliente precisa tocar
  -- para entrar no programa naquele mês.
  menor_faixa as (
    select fc.tabela_base, min(fc.valor_minimo) as minimo
    from public.com_faixas_cashback fc
    where fc.tenant_id = (select public.get_user_tenant_id())
    group by fc.tabela_base
  ),
  ano as (
    select m.cliente_codigo,
      max(m.nome) as nome,
      max(m.tabela_base) as tabela_base,
      bool_and(m.sem_programa) as sem_programa,
      bool_and(m.sem_tabela) as sem_tabela,
      sum(m.comprado) as comprado_no_ano,
      coalesce(sum(m.cashback), 0) as cashback_no_ano
    from mensal m
    group by m.cliente_codigo
  ),
  -- O MELHOR MÊS entre os que não renderam cashback: o que chegou mais perto da
  -- primeira faixa. `distinct on` com `order by comprado desc` — e o
  -- `cliente_codigo` primeiro no `order by`, que é o que o `distinct on` exige.
  melhor_mes as (
    select distinct on (m.cliente_codigo)
      m.cliente_codigo, m.competencia, m.comprado, m.tabela_base
    from mensal m
    where coalesce(m.cashback, 0) = 0 and not m.sem_programa and not m.sem_tabela
    order by m.cliente_codigo, m.comprado desc, m.competencia desc
  )
  -- PERTO DE BATER: não ganhou nada no ano, e no melhor mês comprou 75% ou mais
  -- da primeira faixa.
  select
    a.cliente_codigo, a.nome, a.tabela_base,
    mm.competencia, mm.comprado, mf.minimo,
    (mf.minimo - mm.comprado) as faltou,
    round(mm.comprado / mf.minimo * 100, 1) as comprou_da_faixa,
    a.comprado_no_ano,
    'perto_de_bater'::text as motivo
  from ano a
  join melhor_mes mm on mm.cliente_codigo = a.cliente_codigo
  join menor_faixa mf on mf.tabela_base = mm.tabela_base
  where a.cashback_no_ano = 0
    and a.comprado_no_ano > 0
    and not a.sem_programa and not a.sem_tabela
    -- O corte: faltou até um quarto da faixa. Ver o cabeçalho para a medição
    -- que sustenta o número.
    and (mf.minimo - mm.comprado) <= mf.minimo * 0.25

  union all

  -- SEM TABELA: comprou e não está no cadastro de tabela de preço, então nem
  -- entra na conta do cashback. Não é "não bateu": é "nem foi medido", e o
  -- conserto é de cadastro, não de venda. As colunas de faixa ficam nulas porque
  -- não existe faixa para quem não tem tabela — nulo aqui é ausência, não zero.
  select
    a.cliente_codigo, a.nome, a.tabela_base,
    null::date, null::numeric, null::numeric, null::numeric, null::numeric,
    a.comprado_no_ano,
    'sem_tabela'::text
  from ano a
  where a.sem_tabela and a.comprado_no_ano > 0

  -- Perto de bater primeiro, e dentro de cada motivo o que está mais perto —
  -- `comprou_da_faixa` decrescente. O `sem_tabela` vem com nulo ali e cai no
  -- fim do grupo dele, ordenado pelo que comprou.
  order by motivo desc, comprou_da_faixa desc nulls last, comprado_no_ano desc;
$$;

comment on function public.com_cashback_farol_clientes(integer, text) is
  'O farol do cashback, lado dos clientes: quem faltou ate um quarto da primeira faixa no melhor mes (perto_de_bater) e quem comprou sem ter tabela de preco no cadastro (sem_tabela). Devolve o MES, nao o ano: comprado_no_mes + faltou = minimo, sempre.';

revoke all on function public.com_cashback_farol_clientes(integer, text) from public, anon;
grant execute on function public.com_cashback_farol_clientes(integer, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Tabelas de preço sem faixa nenhuma
--
-- Agrupado por TABELA, não por cliente: a decisão é por tabela ("REVENDA tem
-- cashback ou não?"), e listar os seis clientes faria seis linhas para uma
-- pergunta só. Foi a mesma razão de o farol de bonificação ter uma lista de
-- produtos além da de clientes — a pergunta manda no recorte.
--
-- O dono decidiu (2026-09-26) que este bloco é INFORMATIVO, não alerta:
-- DIRETORIA é interno e REVENDA/SALÃO REF podem ser decisão comercial. A tela
-- mostra em cinza. Não há, hoje, onde registrar "esta tabela não tem cashback, de
-- propósito" — enquanto não houver, o bloco reaparece a cada abertura. Está
-- anotado em docs/nao-funciona.md como a pendência que o transformaria em farol
-- de verdade.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.com_cashback_farol_tabelas(
  p_ano integer,
  p_filial text default null
)
returns table (
  tabela_base text,
  clientes bigint,
  comprado numeric
)
language sql
stable
set search_path = public
as $$
  with mensal as (
    select * from public.com_cashback_mensal(p_ano, p_filial)
  ),
  ano as (
    select m.cliente_codigo,
      max(m.tabela_base) as tabela_base,
      bool_and(m.sem_programa) as sem_programa,
      sum(m.comprado) as comprado
    from mensal m
    group by m.cliente_codigo
  )
  select a.tabela_base, count(*)::bigint, sum(a.comprado)
  from ano a
  where a.sem_programa and a.comprado > 0
  group by a.tabela_base
  order by sum(a.comprado) desc;
$$;

comment on function public.com_cashback_farol_tabelas(integer, text) is
  'O farol do cashback, lado das tabelas: tabelas de preco que tem cliente comprando e nenhuma faixa cadastrada. Agrupado por tabela porque a decisao e por tabela.';

revoke all on function public.com_cashback_farol_tabelas(integer, text) from public, anon;
grant execute on function public.com_cashback_farol_tabelas(integer, text) to authenticated;
