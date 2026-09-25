-- A Conciliação passa a separar as QUATRO CAIXAS que o dono definiu em
-- 2026-09-25, depois de eu apurar no banco que a conta antiga não fechava:
--
--   | eixo        | série 1 (com nota)  | série 75 (sem nota)        |
--   |-------------|---------------------|----------------------------|
--   | CFOP venda  | venda com nota      | venda sem nota — COBRADA   |
--   | CFOP 5910/  | PUBLICIDADE         | BONIFICAÇÃO e CASHBACK     |
--   |   6910      |                     |                            |
--
-- Palavras do dono: "Série 75 é sem nota fiscal mas tem cobrança da mesma
-- forma. Às vezes há clientes que não querem nota fiscal e preferem comprar
-- sem e por isso a série 75. Bonificação usa série 75 porque não precisa de
-- nota, ou seja bonificação e cashback série 75, e publicidade seria série 1
-- junto com venda."
--
-- POR QUE A CONTA ANTIGA ESTAVA ERRADA. Ela somava `venda líquida +
-- bonificação` e comparava com o informado, sob a premissa — escrita na tela
-- — de que "a planilha de metas conta a bonificação como faturamento". Os
-- sete meses informados de 2026 dizem o contrário:
--
--   informado                R$ 2.977.764,84
--   venda COM NOTA (série 1) R$ 2.992.415,08   → diferença de R$ 14.650 (0,5%)
--   venda + bonificação      R$ 6.146.468,91   → diferença de R$ 3,1 milhões
--
-- O informado É a venda com nota fiscal, com meio por cento de folga. Somar
-- bonificação não explicava a diferença: ela FABRICAVA uma. E a premissa
-- veio junto do painel HTML antigo — que, diferente desta tela, ainda
-- avisava que "a diferença não se explica pelos dados do ERP e vale
-- conferir". Ao virar sistema, a ressalva caiu e um "não sei" virou "de
-- propósito".
--
-- DUAS DIFERENÇAS, não uma. A de baixo é a que importa para o dono: quanto
-- ele fatura (porque a série 75 é cobrada) e não aparece na apresentação
-- comercial dele.
--
-- NENHUMA REIMPORTAÇÃO FOI PRECISA. `serie` é gravada crua desde a primeira
-- migration e nunca influenciou `classe` — decisão registrada em
-- docs/decisoes.md: "série e CFOP são eixos independentes… tratar um como
-- sinônimo do outro apaga a metade que não bate com a intuição". A fundação
-- estava certa; faltava dar nome às duas metades.
--
-- O CASHBACK NÃO ENTRA AQUI, de propósito. Ele mora dentro da bonificação da
-- série 75 e só a apuração (`com_cashback_mensal`) sabe separá-lo. Trazer a
-- conta para cá seria uma segunda cópia da grade de faixas — e chamar a
-- função de cashback de dentro de uma `security definer` faria a leitura dela
-- correr sem RLS (a CTE base dela não tem filtro de tenant próprio; depende
-- da policy). A tela mostra o cashback apurado ao lado, rotulado como do ano.

drop function if exists public.com_conciliacao(integer);

create or replace function public.com_conciliacao(p_ano integer)
returns table (
  informado numeric,
  venda_com_nota numeric,
  venda_sem_nota numeric,
  venda_total numeric,
  publicidade numeric,
  bonificacao numeric,
  diferenca_com_nota numeric,
  diferenca_total numeric,
  meses_comparados int
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (public.has_comercial_access(auth.uid()) or public.has_diretoria_access(auth.uid())) then
    raise exception 'Sem acesso ao Comercial nem à Diretoria.';
  end if;

  return query
  -- Uma varredura só de `metas_ano`: as linhas informadas do ano. Os dois
  -- usos saem daqui — a lista de meses que recorta o lado do ERP, e o
  -- total informado. Duas CTEs com o mesmo filtro triplo eram duas chances
  -- de o filtro divergir numa edição futura.
  with meses_informados as (
    select ma.mes, ma.total_realizado
    from public.metas_ano ma
    where ma.tenant_id = (select public.get_user_tenant_id())
      and ma.ano = p_ano
      and ma.total_realizado is not null
  ),
  totais as (
    select
      sum(mi.total_realizado) as informado,
      count(*) as meses_comparados
    from meses_informados mi
  ),
  erp as (
    -- O join com `meses_informados` é o que restringe o lado do ERP aos
    -- mesmos meses do lado informado — sem ele, a soma volta a cobrir o
    -- ano inteiro e a armadilha dos meses desiguais reaparece.
    --
    -- `valor_curva` nas duas vendas (não `valor_nota`): é coluna gerada que
    -- já devolve a devolução com sinal negativo, então a subtração acontece
    -- sozinha. Hoje não há devolução nenhuma no importado — quatro anos,
    -- zero linhas —, e é por isso que a tela não chama mais este número de
    -- "líquido": não há o que subtrair, e o rótulo fazia crer que havia.
    select
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao') and i.serie = '1'), 0) as venda_com_nota,
      coalesce(sum(i.valor_curva) filter (where i.classe in ('venda', 'devolucao') and i.serie <> '1'), 0) as venda_sem_nota,
      -- Bonificação da série 1 é PUBLICIDADE; da série 75 é bonificação de
      -- verdade (com o cashback dentro). A regra é do dono, e o CFOP
      -- 5910/6910 é exatamente a "natureza da operação: bonificação" que ele
      -- lê no Forteplus — por isso a série é a única coisa que falta para
      -- decidir, e ela já está gravada.
      coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao' and i.serie = '1'), 0) as publicidade,
      coalesce(sum(i.valor_nota) filter (where i.classe = 'bonificacao' and i.serie <> '1'), 0) as bonificacao
    from public.com_vendas_itens i
    join meses_informados mi on extract(month from i.competencia) = mi.mes
    where i.tenant_id = (select public.get_user_tenant_id())
      and extract(year from i.competencia) = p_ano
  ),
  -- `venda_total` nasce aqui, uma vez só, e `diferenca_total` lê ESTA
  -- coluna — nunca recalcula a soma por conta própria. Com as duas contas
  -- separadas, mutar a soma não move a diferença, e a prova pgTAP ("trocar
  -- a soma por zero tem que acusar") fica cega.
  totais_erp as (
    select
      erp.venda_com_nota, erp.venda_sem_nota, erp.publicidade, erp.bonificacao,
      erp.venda_com_nota + erp.venda_sem_nota as venda_total
    from erp
  )
  select
    t.informado,
    x.venda_com_nota,
    x.venda_sem_nota,
    x.venda_total,
    x.publicidade,
    x.bonificacao,
    -- `informado` nulo = nenhum mês informado, que é "sem dado" e nunca
    -- "zero" (a regra que a Frente 2 existiu para estabelecer). As duas
    -- diferenças nascem nulas junto, sem `coalesce` por cima.
    case when t.informado is null then null else t.informado - x.venda_com_nota end as diferenca_com_nota,
    case when t.informado is null then null else t.informado - x.venda_total end as diferenca_total,
    t.meses_comparados::int as meses_comparados
  from totais t, totais_erp x;
end;
$$;

grant execute on function public.com_conciliacao(integer) to authenticated;
