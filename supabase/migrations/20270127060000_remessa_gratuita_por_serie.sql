-- REMESSA GRATUITA SEPARADA PELA SÉRIE (dono, 2026-10-16). O CFOP 5910/6910 (remessa em bonificação) nunca é venda; a
-- SÉRIE diz o que ela é:
--   série 1  → PUBLICIDADE
--   série 75 → BONIFICAÇÃO (até 2026-10 levava também o cashback)
--   série 76 → CASHBACK (criada pelo dono em 2026-10-16)
-- Série 75 com CFOP de venda continua venda (a "condição metade sem nota").
--
-- Revoga a decisão de 2026-09-25 (migration 20261026050000, "publicidade sai"): na época a medição mostrou que a
-- publicidade da série 1 é quase toda produto de linha, e a publicidade ficou dentro da bonificação. O dono, agora:
-- "Série 1 tem CFOP 6910 e 5910? Seria publicidade" — e confirmou, sabendo do histórico. Vale a regra da empresa.
--
-- COMO: `classe` continua 'bonificacao' para todo 5910/6910 (venda não muda em nada), e a coluna gerada `remessa`
-- separa o tipo. Toda conta que chamava de "bonificação" a soma de `classe = 'bonificacao'` passa a somar só
-- `remessa = 'bonificacao'`; as caixas do faturamento ganham Publicidade e Cashback ao lado.

alter table public.com_vendas_itens
  add column if not exists remessa text generated always as (
    case when classe = 'bonificacao' then
      case serie when '1' then 'publicidade' when '76' then 'cashback' else 'bonificacao' end
    end) stored;

create or replace function pg_temp.troca(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'trecho não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

-- "Bonificação" passa a ser só a bonificação (série 75). `replace` troca todas as ocorrências da função.
select pg_temp.troca('public.com_bonificacao_farol_clientes(date, date, text)'::regprocedure,
  $$i.classe = 'bonificacao'$$, $$i.remessa = 'bonificacao'$$);
select pg_temp.troca('public.com_bonificacao_farol_produtos(date, date, text)'::regprocedure,
  $$i.classe = 'bonificacao'$$, $$i.remessa = 'bonificacao'$$);
select pg_temp.troca('public.com_bonificacao_por_cliente(date, date, text, text)'::regprocedure,
  $$i.classe = 'bonificacao'$$, $$i.remessa = 'bonificacao'$$);
select pg_temp.troca('public.com_ficha_bonificado(text, date, date, text)'::regprocedure,
  $$i.classe = 'bonificacao'$$, $$i.remessa = 'bonificacao'$$);
select pg_temp.troca('public.com_ficha_indicadores'::regproc::regprocedure,
  $$i.classe = 'bonificacao'$$, $$i.remessa = 'bonificacao'$$);
select pg_temp.troca('public.com_faturamento_por_cliente(date, date, text, text)'::regprocedure,
  $$i.classe = 'bonificacao'$$, $$i.remessa = 'bonificacao'$$);
select pg_temp.troca('public.com_faturamento_mensal(integer, text, text, date, date)'::regprocedure,
  $$i.classe = 'bonificacao'$$, $$i.remessa = 'bonificacao'$$);
select pg_temp.troca('public.com_painel_totais(integer, text, text, date, date)'::regprocedure,
  $$i.classe = 'bonificacao'$$, $$i.remessa = 'bonificacao'$$);
select pg_temp.troca('public.com_conciliacao'::regproc::regprocedure,
  $$i.classe = 'bonificacao'$$, $$i.remessa = 'bonificacao'$$);
select pg_temp.troca('public.com_pedidos_em_condicao'::regproc::regprocedure,
  $$i.classe = 'bonificacao'$$, $$i.remessa = 'bonificacao'$$);

-- As caixas do faturamento: Publicidade e Cashback ao lado da Bonificação, e o fechamento continua exato.
drop function if exists public.com_caixas(integer, text, date, date);
create function public.com_caixas(p_ano integer, p_filial text default null, p_de date default null, p_ate date default null)
returns table(venda_com_nota numeric, venda_sem_nota numeric, venda_total numeric, devolucao numeric,
  faturamento_liquido numeric, bonificacao numeric, publicidade numeric, cashback numeric, industrializacao numeric,
  outros numeric, total_importado numeric, fora_das_caixas numeric, unidades_vendidas numeric, unidades_bonificadas numeric,
  clientes_ativos bigint, skus_vendidos bigint)
language sql stable set search_path to 'public' as $function$
  with base as (
    select i.*
    from public.com_vendas_itens i
    -- A MESMA janela de `com_painel_totais`: ou as duas concordam, ou uma tela mostra um número e a outra outro.
    where (case when p_de is not null and p_ate is not null then i.emissao between p_de and p_ate
                else extract(year from i.competencia) = p_ano end)
      and (p_filial is null or i.filial = p_filial)
  ),
  caixas as (
    select
      coalesce(sum(abs(b.valor_nota)) filter (where b.classe = 'venda' and b.serie = '1'), 0) as venda_com_nota,
      coalesce(sum(abs(b.valor_nota)) filter (where b.classe = 'venda' and b.serie <> '1'), 0) as venda_sem_nota,
      coalesce(sum(abs(b.valor_nota)) filter (where b.classe = 'devolucao'), 0) as devolucao,
      coalesce(sum(abs(b.valor_nota)) filter (where b.remessa = 'bonificacao'), 0) as bonificacao,
      coalesce(sum(abs(b.valor_nota)) filter (where b.remessa = 'publicidade'), 0) as publicidade,
      coalesce(sum(abs(b.valor_nota)) filter (where b.remessa = 'cashback'), 0) as cashback,
      coalesce(sum(abs(b.valor_nota)) filter (where b.classe = 'industrializacao'), 0) as industrializacao,
      coalesce(sum(abs(b.valor_nota)) filter (where b.classe = 'outros'), 0) as outros,
      coalesce(sum(abs(b.valor_nota)), 0) as total_importado,
      coalesce(sum(b.quantidade_curva) filter (where b.classe in ('venda','devolucao')), 0) as unidades_vendidas,
      coalesce(sum(abs(b.quantidade)) filter (where b.remessa = 'bonificacao'), 0) as unidades_bonificadas,
      count(distinct b.cliente_codigo) filter (where b.classe = 'venda') as clientes_ativos,
      count(distinct b.produto_codigo) filter (where b.classe = 'venda') as skus_vendidos
    from base b
  )
  select
    c.venda_com_nota, c.venda_sem_nota, c.venda_com_nota + c.venda_sem_nota as venda_total, c.devolucao,
    c.venda_com_nota + c.venda_sem_nota - c.devolucao as faturamento_liquido,
    c.bonificacao, c.publicidade, c.cashback, c.industrializacao, c.outros, c.total_importado,
    c.total_importado - (c.venda_com_nota + c.venda_sem_nota + c.devolucao + c.bonificacao + c.publicidade
      + c.cashback + c.industrializacao + c.outros) as fora_das_caixas,
    c.unidades_vendidas, c.unidades_bonificadas, c.clientes_ativos, c.skus_vendidos
  from caixas c;
$function$;
revoke all on function public.com_caixas(integer, text, date, date) from public, anon;
grant execute on function public.com_caixas(integer, text, date, date) to authenticated, service_role;
