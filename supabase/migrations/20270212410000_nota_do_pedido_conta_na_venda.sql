-- Nota digitada e A faturar (tópicos 2 e 3 aprovados pelo dono em 2026-11-05). O comercial informa número, valor faturado e
-- data de emissão de cada pedido; a venda entra na hora, "a confirmar", e a importação do Forteplus prevalece. A faturar
-- passa a ser o pedido aprovado que ainda não tem nota, de qualquer mês.
alter table public.ped_pedidos
  add column nota_em date,
  add column nota_valor numeric(14,2),
  add column nota_origem text check (nota_origem in ('digitada', 'importacao'));

create or replace function pg_temp.troca(p_funcao regprocedure, p_pares text[][])
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
  i int;
begin
  for i in 1 .. array_length(p_pares, 1) loop
    if position(p_pares[i][1] in v_def) = 0 then
      raise exception 'trecho não encontrado em %: %', p_funcao, left(p_pares[i][1], 80);
    end if;
    v_def := replace(v_def, p_pares[i][1], p_pares[i][2]);
  end loop;
  execute v_def;
end;
$$;

drop function public.ped_informar_nota(uuid, text);
create function public.ped_informar_nota(p_pedido uuid, p_nota text, p_valor numeric default null, p_emissao date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_ped public.ped_pedidos%rowtype;
  v_ck public.ped_checklists%rowtype;
  v_nota text := nullif(ltrim(regexp_replace(coalesce(p_nota, ''), '\D', '', 'g'), '0'), '');
begin
  select * into v_ped from public.ped_pedidos where id = p_pedido and tenant_id = public.get_user_tenant_id();
  if v_ped.id is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  select * into v_ck from public.ped_checklists where id = v_ped.checklist_id;
  if not (v_ck.vendedor_id = auth.uid() or public.ped_pode_decidir() or public.ped_pode_registrar_pagamento()) then
    raise exception 'Só quem fez o pedido ou o Financeiro informa a nota.' using errcode = '42501';
  end if;
  if public.ped_cancelado(v_ck.id) then
    raise exception 'Checklist cancelado: a nota não muda mais.' using errcode = 'P0001';
  end if;
  if public.ped_finalizado(v_ck.id) then
    raise exception 'Checklist finalizado: a nota não muda mais.' using errcode = 'P0001';
  end if;
  if v_nota is not null and v_ped.tipo = 'Venda' then
    if coalesce(p_valor, 0) <= 0 then
      raise exception 'Informe o valor faturado na nota.' using errcode = '23514';
    end if;
    if p_emissao is null or p_emissao > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'Informe a data de emissão da nota. Ela não pode ser futura.' using errcode = '23514';
    end if;
  end if;
  update public.ped_pedidos
     set nota_fiscal = v_nota,
         nota_valor = case when v_nota is null then null else p_valor end,
         nota_em = case when v_nota is null then null else p_emissao end,
         nota_origem = case when v_nota is null then null else 'digitada' end
   where id = p_pedido;
end;
$$;
revoke all on function public.ped_informar_nota(uuid, text, numeric, date) from public, anon;
grant execute on function public.ped_informar_nota(uuid, text, numeric, date) to authenticated;

-- As notas que contam agora: digitadas, ainda não importadas e posteriores à última nota importada daquela filial. Achada
-- no Forteplus, sai daqui e vale a importada. Não achada depois que a importação passou da data, sai e pede correção.
create or replace function public.com_notas_a_confirmar(p_de date default null, p_ate date default null)
returns table (pedido_id uuid, cliente_codigo text, vendedor_id uuid, filial text, nota_fiscal text, nota_em date, valor numeric)
language sql stable security definer set search_path to 'public' as $$
  select p.id, c.cliente_codigo, c.vendedor_id, p.filial, p.nota_fiscal, p.nota_em, p.nota_valor
    from public.ped_pedidos p
    join public.ped_checklists c on c.id = p.checklist_id
    join public.com_interacoes_que_contam i on i.id = c.interacao_id
   where p.tenant_id = public.get_user_tenant_id()
     and (public.has_comercial_access(auth.uid()) or public.has_diretoria_access(auth.uid()))
     and p.tipo = 'Venda' and p.nota_origem = 'digitada' and p.nota_valor > 0 and p.nota_em is not null
     and i.nota_em is null
     and (p_de is null or p.nota_em >= p_de) and (p_ate is null or p.nota_em <= p_ate)
     and p.nota_em > coalesce((select max(vi.emissao) from public.com_vendas_itens vi
                                where vi.tenant_id = p.tenant_id and vi.filial = p.filial), date '1900-01-01')
     and not exists (select 1 from public.com_vendas_itens vi
                      where vi.tenant_id = p.tenant_id and vi.filial = p.filial
                        and ltrim(regexp_replace(vi.documento, '\D', '', 'g'), '0') = p.nota_fiscal);
$$;
revoke all on function public.com_notas_a_confirmar(date, date) from public, anon;
grant execute on function public.com_notas_a_confirmar(date, date) to authenticated;

select pg_temp.troca('public.com_vendas_unificadas(text[], date, date, text)', array[
  ['and (p_filial is null or i.nota_filial = p_filial);',
   $x$and (p_filial is null or i.nota_filial = p_filial)
  union all
  select n.cliente_codigo, n.nota_em, n.valor * (1 + public.com_parte_do_cliente(n.cliente_codigo, n.nota_em))
    from public.com_notas_a_confirmar(p_de, p_ate - 1) n
   where n.cliente_codigo = any (p_codigos) and (p_filial is null or n.filial = p_filial);$x$]
]);

create or replace function public.com_venda_atribuida(p_de date, p_ate date)
returns table (vendedor_id uuid, cliente_codigo text, faturado numeric, previa numeric, corte date)
language sql stable set search_path to 'public' as $$
  with c as (select public.com_faturado_importado_ate() as d),
  fat as (
    select mb.user_id as vendedor_id, v.cliente_codigo,
           sum(v.valor_curva * (1 + public.com_parte_da_condicao(cl.tabela_preco, v.emissao))) as faturado
      from public.com_vendas_itens v
      cross join c
      join public.com_clientes cl on cl.tenant_id = v.tenant_id and cl.codigo = v.cliente_codigo
      join public.com_carteira_membros mb on mb.tenant_id = v.tenant_id and mb.carteira = cl.carteira
     where v.tenant_id = public.get_user_tenant_id()
       and c.d is not null
       and v.classe in ('venda', 'devolucao')
       and v.emissao between p_de and least(p_ate, c.d)
     group by mb.user_id, v.cliente_codigo
  ),
  prev as (
    select x.vendedor_id, x.cliente_codigo, sum(x.valor) as previa
      from (
        select i.vendedor_id, i.cliente_codigo, i.valor_venda * (1 + public.com_parte_do_cliente(i.cliente_codigo, i.nota_em)) as valor
          from public.com_interacoes_que_contam i
          cross join c
         where i.tenant_id = public.get_user_tenant_id()
           and i.nota_em between p_de and p_ate
           and (c.d is null or i.nota_em > c.d)
           and i.valor_venda > 0
           and i.cliente_codigo is not null
        union all
        select n.vendedor_id, n.cliente_codigo, n.valor * (1 + public.com_parte_do_cliente(n.cliente_codigo, n.nota_em))
          from public.com_notas_a_confirmar(p_de, p_ate) n
      ) x
     group by x.vendedor_id, x.cliente_codigo
  )
  select coalesce(f.vendedor_id, p.vendedor_id), coalesce(f.cliente_codigo, p.cliente_codigo),
         coalesce(f.faturado, 0), coalesce(p.previa, 0), (select d from c)
    from fat f
    full join prev p on p.vendedor_id = f.vendedor_id and p.cliente_codigo = f.cliente_codigo;
$$;

select pg_temp.troca('public.com_carteira_mes_a_mes(text, integer)', array[
  ['and extract(month from i.nota_em)::int = m.mes), 0) as m_venda',
   $x$and extract(month from i.nota_em)::int = m.mes), 0)
           + coalesce((select sum(n.valor * (1 + public.com_parte_da_condicao(c.tabela_preco, n.nota_em)))
                         from public.com_notas_a_confirmar(make_date(p_ano, m.mes, 1), (make_date(p_ano, m.mes, 1) + interval '1 month - 1 day')::date) n
                         join public.com_clientes c on c.tenant_id = v_tenant and c.codigo = n.cliente_codigo
                        where c.carteira = v_carteira), 0) as m_venda$x$]
]);

select pg_temp.troca('public.dir_realizado_carteiras(integer[])', array[
  ['and extract(year from i.nota_em)::int = any (p_anos)',
   $x$and extract(year from i.nota_em)::int = any (p_anos)
    union all
    select extract(year from n.nota_em)::int, extract(month from n.nota_em)::int, cl.carteira,
           n.valor * (1 + public.com_parte_da_condicao(cl.tabela_preco, n.nota_em))
      from public.com_notas_a_confirmar() n
      join public.com_clientes cl on cl.tenant_id = public.get_user_tenant_id() and cl.codigo = n.cliente_codigo
     where cl.carteira is not null and extract(year from n.nota_em)::int = any (p_anos)$x$]
]);
select pg_temp.troca('public.dir_realizado_total(integer[])', array[
  ['and extract(year from i.nota_em)::int = any (p_anos)',
   $x$and extract(year from i.nota_em)::int = any (p_anos)
    union all
    select extract(year from n.nota_em)::int, extract(month from n.nota_em)::int,
           n.valor * (1 + public.com_parte_do_cliente(n.cliente_codigo, n.nota_em))
      from public.com_notas_a_confirmar() n
     where extract(year from n.nota_em)::int = any (p_anos)$x$]
]);

-- A faturar: pedido aprovado sem nota, com a parte da condição, mesmo que o mês já tenha virado.
select pg_temp.troca('public.com_acompanhamento_da_carteira(text, date, date, date, text)', array[
  ['select cl.chave, sum(p.valor) as valor',
   'select cl.chave, sum(p.valor * (1 + public.com_parte_da_condicao(cl.tabela_preco, v_ref))) as valor'],
  ['where i.nota_fiscal is null and i.data >= v_de and i.data < v_ate',
   $x$where p.nota_fiscal is null and i.data < v_ate and public.ped_decisao_vigente(ck.id) = 'Aprovado'$x$]
]);

-- O que o comercial tem de resolver: falta a nota, ou a nota digitada não bateu com o Forteplus.
create or replace function public.ped_notas_do_comercial()
returns table (
  pedido_id uuid, checklist_id uuid, interacao_id uuid, protocolo text, cliente_codigo text, cliente text, vendedor_id uuid, vendedor text,
  filial text, numero text, tipo text, valor_pedido numeric, aprovado_em timestamptz, situacao text,
  nota_fiscal text, nota_valor numeric, nota_em date, forteplus_valor numeric
) language sql stable security definer set search_path to 'public' as $$
  with base as (
    select p.*, c.protocolo, c.cliente_codigo, c.cliente_nome, c.vendedor_id, c.interacao_id,
           (select max(d.registrado_em) from public.ped_decisoes d where d.checklist_id = c.id and d.status = 'Aprovado') as aprovado_em,
           (select sum(vi.valor_nota) filter (where vi.classe = 'venda') from public.com_vendas_itens vi
             where vi.tenant_id = p.tenant_id and vi.filial = p.filial
               and ltrim(regexp_replace(vi.documento, '\D', '', 'g'), '0') = p.nota_fiscal) as forteplus,
           exists (select 1 from public.com_vendas_itens vi
                    where vi.tenant_id = p.tenant_id and vi.filial = p.filial
                      and ltrim(regexp_replace(vi.documento, '\D', '', 'g'), '0') = p.nota_fiscal) as achada,
           coalesce((select max(vi.emissao) from public.com_vendas_itens vi
                      where vi.tenant_id = p.tenant_id and vi.filial = p.filial), date '1900-01-01') as corte
      from public.ped_pedidos p
      join public.ped_checklists c on c.id = p.checklist_id
     where p.tenant_id = public.get_user_tenant_id()
       and p.tipo = 'Venda'
       and (c.vendedor_id = auth.uid() or public.ped_ve_todos())
       and public.ped_decisao_vigente(c.id) = 'Aprovado'
       and not public.ped_cancelado(c.id) and not public.ped_finalizado(c.id)
  ),
  marcado as (
    select b.*, case
      when b.nota_fiscal is null then 'falta_nota'
      when b.nota_origem = 'digitada' and not b.achada and b.nota_em <= b.corte then 'corrigir'
      when b.nota_origem = 'digitada' and b.achada and abs(coalesce(b.forteplus, 0) - coalesce(b.nota_valor, 0)) > 1
       and b.nota_em >= (now() at time zone 'America/Sao_Paulo')::date - 30 then 'valor_diferente'
    end as situacao
      from base b
  )
  select m.id, m.checklist_id, m.interacao_id, m.protocolo, m.cliente_codigo, m.cliente_nome, m.vendedor_id, pr.full_name, m.filial, m.numero, m.tipo,
         m.valor, m.aprovado_em, m.situacao, m.nota_fiscal, m.nota_valor, m.nota_em, m.forteplus
    from marcado m
    left join public.profiles pr on pr.id = m.vendedor_id
   where m.situacao is not null
   order by m.aprovado_em nulls last;
$$;
revoke all on function public.ped_notas_do_comercial() from public, anon;
grant execute on function public.ped_notas_do_comercial() to authenticated;

-- A importação encontra a nota do pedido sem nota. O arquivo do Forteplus não traz o número do pedido, então o encontro é
-- por cliente, filial e valor (até 2% de diferença), e cada nota serve a um pedido só. O que não encontrar fica na lista.
create or replace function public.ped_achar_notas_importadas(p_tenant uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_ped record;
  v_nota record;
  v_achadas int := 0;
begin
  for v_ped in
    select p.id, p.filial, p.valor, c.cliente_codigo, i.data
      from public.ped_pedidos p
      join public.ped_checklists c on c.id = p.checklist_id
      join public.com_interacoes_que_contam i on i.id = c.interacao_id
     where p.tenant_id = p_tenant and p.tipo = 'Venda' and p.nota_fiscal is null
       and not public.ped_cancelado(c.id) and not public.ped_finalizado(c.id)
     order by i.data, p.ordem
  loop
    select n.num, n.emissao, n.total into v_nota
      from (
        select ltrim(regexp_replace(vi.documento, '\D', '', 'g'), '0') as num, min(vi.emissao) as emissao, sum(vi.valor_nota) as total
          from public.com_vendas_itens vi
         where vi.tenant_id = p_tenant and vi.cliente_codigo = v_ped.cliente_codigo and vi.filial = v_ped.filial
           and vi.classe = 'venda' and vi.emissao >= v_ped.data - 3
         group by 1
      ) n
     where abs(n.total - v_ped.valor) <= greatest(1, v_ped.valor * 0.02)
       and not exists (select 1 from public.ped_pedidos o
                        where o.tenant_id = p_tenant and o.filial = v_ped.filial and o.nota_fiscal = n.num)
     order by n.emissao
     limit 1;
    if v_nota.num is not null then
      update public.ped_pedidos
         set nota_fiscal = v_nota.num, nota_valor = v_nota.total, nota_em = v_nota.emissao, nota_origem = 'importacao'
       where id = v_ped.id;
      v_achadas := v_achadas + 1;
    end if;
    v_nota := null;
  end loop;
  return v_achadas;
end;
$$;
revoke all on function public.ped_achar_notas_importadas(uuid) from public, anon, authenticated;

create or replace function public.ped_ao_concluir_importacao()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.ped_achar_notas_importadas(new.tenant_id);
  return null;
end;
$$;
revoke all on function public.ped_ao_concluir_importacao() from public, anon, authenticated;
create trigger ped_acha_notas_na_importacao
  after update of status on public.com_vendas_importacoes
  for each row when (new.status = 'concluida' and old.status is distinct from 'concluida')
  execute function public.ped_ao_concluir_importacao();

-- A composição mostra também o que ainda está a confirmar.
drop function public.com_composicao_da_venda(date, date, text, text, text);
create function public.com_composicao_da_venda(
  p_de date, p_ate date, p_carteira text default null, p_filial text default null, p_codigo text default null
) returns table (faturado numeric, condicao numeric, venda_total numeric, clientes integer, a_confirmar numeric)
language plpgsql stable security definer set search_path to 'public' as $$
#variable_conflict use_column
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_carteira text := nullif(public.normalizar_nome_carteira(coalesce(p_carteira, '')), '');
  v_filial text := nullif(upper(btrim(p_filial)), '');
  v_codigos text[];
begin
  select array_agg(c.codigo) into v_codigos
    from public.com_clientes c
   where c.tenant_id = v_tenant
     and public.com_pode_ver_carteira(coalesce(c.carteira, ''))
     and (v_carteira is null or c.carteira = v_carteira)
     and (p_codigo is null or c.codigo = any (public.com_codigos_do_grupo(p_codigo)));
  return query
  with v as (
    select u.codigo, u.valor, 1 + public.com_parte_da_condicao(cl.tabela_preco, u.dia) as fator
      from public.com_vendas_unificadas(v_codigos, p_de, p_ate + 1, v_filial) u
      left join public.com_clientes cl on cl.tenant_id = v_tenant and cl.codigo = u.codigo
  )
  select round(coalesce(sum(v.valor / v.fator), 0), 2),
         round(coalesce(sum(v.valor - v.valor / v.fator), 0), 2),
         round(coalesce(sum(v.valor), 0), 2),
         (count(distinct v.codigo) filter (where v.fator > 1))::int,
         (select round(coalesce(sum(n.valor * (1 + public.com_parte_do_cliente(n.cliente_codigo, n.nota_em))), 0), 2)
            from public.com_notas_a_confirmar(p_de, p_ate) n
           where n.cliente_codigo = any (v_codigos) and (v_filial is null or n.filial = v_filial))
    from v;
end;
$$;
revoke all on function public.com_composicao_da_venda(date, date, text, text, text) from public, anon;
grant execute on function public.com_composicao_da_venda(date, date, text, text, text) to authenticated;
