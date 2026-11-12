-- ATINGIMENTO SÓ NOS MESES QUE TÊM META (decisão do dono, 2026-11-12). As metas das carteiras começam em out/2026; no
-- período "Ano" os Indicadores comparavam a venda de jan–nov (R$ 1,83 mi do Fenicio) com a meta de out–dez (R$ 947 mil)
-- e diziam "193% · Na meta". Agora o % e o farol comparam a meta com a venda DOS MESES QUE TÊM META (cada mês recortado
-- pelo período). A linha "venda do período" continua mostrando a venda inteira. Num mês só nada muda: o mês com meta
-- é ele mesmo.
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

-- 1) A venda de cada vendedora nos meses em que a carteira dela tem meta.
select pg_temp.troca('public.com_painel_do_gestor(date, date, date)'::regprocedure,
  $$  linhas as ($$,
  $$  meses_com_meta as (
    select distinct m.user_id as vendedor_id, make_date(cm.ano, cm.mes, 1) as mes
      from public.com_carteira_membros m
      cross join janela
      join public.com_metas cm
        on cm.tenant_id = m.tenant_id
       and cm.carteira is not null
       and public.normalizar_nome_carteira(cm.carteira) = m.carteira
       and make_date(cm.ano, cm.mes, 1) >= date_trunc('month', janela.de)::date
       and make_date(cm.ano, cm.mes, 1) < janela.ate
       and cm.valor > 0
     where m.tenant_id = public.get_user_tenant_id()
  ),
  venda_com_meta as (
    select mm.vendedor_id, sum(a.faturado + a.previa) as valor
      from (select distinct mes from meses_com_meta) ms
      cross join janela
      cross join lateral public.com_venda_atribuida(greatest(ms.mes, janela.de),
                                                    least((ms.mes + interval '1 month - 1 day')::date, janela.ate - 1)) a
      join meses_com_meta mm on mm.mes = ms.mes and mm.vendedor_id = a.vendedor_id
     group by mm.vendedor_id
  ),
  linhas as ($$);

-- 2) O % e o farol olham essa venda.
select pg_temp.troca('public.com_painel_do_gestor(date, date, date)'::regprocedure,
  $$then case when mc.meta > 0 then round(coalesce(vd.valor, 0) / mc.meta * 100, 1) end$$,
  $$then case when mc.meta > 0 then round(coalesce(vm.valor, 0) / mc.meta * 100, 1) end$$);
select pg_temp.troca('public.com_painel_do_gestor(date, date, date)'::regprocedure,
  $$when 'valor_vendas' then public.com_cor_do_farol(l.realizado, mc.meta)
           when 'pct_meta' then public.com_cor_do_farol(coalesce(vd.valor, 0), mc.meta)$$,
  $$when 'valor_vendas' then public.com_cor_do_farol(coalesce(vm.valor, 0), mc.meta)
           when 'pct_meta' then public.com_cor_do_farol(coalesce(vm.valor, 0), mc.meta)$$);
select pg_temp.troca('public.com_painel_do_gestor(date, date, date)'::regprocedure,
  $$    left join vendas vd on vd.vendedor_id = l.vendedor_id
   order by$$,
  $$    left join vendas vd on vd.vendedor_id = l.vendedor_id
    left join venda_com_meta vm on vm.vendedor_id = l.vendedor_id
   order by$$);
