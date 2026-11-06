-- Correções da revisão de 2026-11-05 no Raio-X, na condição e na nota do pedido.
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

-- Apagar o lançamento limpa a ligação da dor por chave estrangeira: isso é escrita do sistema, não correção de texto.
select pg_temp.troca('public.com_raio_x_so_o_gestor_corrige()',
  'new.updated_at := now();',
  $x$new.updated_at := now();
  if pg_trigger_depth() > 1 then
    return new;
  end if;$x$);

-- O grupo só responde pelos códigos que a pessoa pode ver.
select pg_temp.troca('public.com_codigos_do_grupo(text)',
  'where c.tenant_id = public.get_user_tenant_id() and c.codigo = p_codigo;',
  $x$where c.tenant_id = public.get_user_tenant_id() and c.codigo = p_codigo
     and public.com_pode_ver_carteira(coalesce(o.carteira, ''));$x$);

-- Só pedido aprovado conta, cada pessoa lê o que pode ver e a mesma nota em dois pedidos soma uma vez.
create or replace function public.com_notas_a_confirmar(p_de date default null, p_ate date default null)
returns table (pedido_id uuid, cliente_codigo text, vendedor_id uuid, filial text, nota_fiscal text, nota_em date, valor numeric)
language sql stable security definer set search_path to 'public' as $$
  select distinct on (p.filial, p.nota_fiscal) p.id, c.cliente_codigo, c.vendedor_id, p.filial, p.nota_fiscal, p.nota_em, p.nota_valor
    from public.ped_pedidos p
    join public.ped_checklists c on c.id = p.checklist_id
    join public.com_interacoes_que_contam i on i.id = c.interacao_id
   where p.tenant_id = public.get_user_tenant_id()
     and (public.has_comercial_access(auth.uid()) or public.has_diretoria_access(auth.uid()))
     and (c.vendedor_id = auth.uid() or public.com_pode_ver_cliente(c.cliente_codigo))
     and public.ped_decisao_vigente(c.id) = 'Aprovado'
     and p.tipo = 'Venda' and p.nota_origem = 'digitada' and p.nota_valor > 0 and p.nota_em is not null
     and i.nota_em is null
     and (p_de is null or p.nota_em >= p_de) and (p_ate is null or p.nota_em <= p_ate)
     and p.nota_em > coalesce((select max(vi.emissao) from public.com_vendas_itens vi
                                where vi.tenant_id = p.tenant_id and vi.filial = p.filial), date '1900-01-01')
     and not exists (select 1 from public.com_vendas_itens vi
                      where vi.tenant_id = p.tenant_id and vi.filial = p.filial
                        and ltrim(regexp_replace(vi.documento, '\D', '', 'g'), '0') = p.nota_fiscal)
   order by p.filial, p.nota_fiscal, p.id;
$$;

select pg_temp.troca('public.ped_achar_notas_importadas(uuid)',
  'and not public.ped_cancelado(c.id)',
  $x$and not public.ped_cancelado(c.id) and public.ped_decisao_vigente(c.id) = 'Aprovado'$x$);

-- Nota digitada em pedido finalizado continua na lista, e dá para corrigir enquanto não existir no Forteplus.
select pg_temp.troca('public.ped_notas_do_comercial()',
  'and not public.ped_cancelado(c.id) and (p.nota_fiscal is null or not public.ped_finalizado(c.id))',
  'and not public.ped_cancelado(c.id)');
select pg_temp.troca('public.ped_informar_nota(uuid, text, numeric, date)',
  'if public.ped_finalizado(v_ck.id) and v_ped.nota_fiscal is not null then',
  $x$if public.ped_finalizado(v_ck.id) and exists (
    select 1 from public.com_vendas_itens vi
     where vi.tenant_id = v_ped.tenant_id and vi.filial = v_ped.filial
       and ltrim(regexp_replace(vi.documento, '\D', '', 'g'), '0') = v_ped.nota_fiscal) then$x$);

-- A nota é do pedido, não da posição: se o número ou a filial mudam ao regravar, ela não passa para outro pedido.
select pg_temp.troca('public.ped_salvar_checklist(uuid, jsonb)',
  'numero = excluded.numero, valor = excluded.valor,',
  $x$numero = excluded.numero, valor = excluded.valor,
           nota_fiscal = case when (p.numero, p.filial) = (excluded.numero, excluded.filial) then p.nota_fiscal end,
           nota_valor = case when (p.numero, p.filial) = (excluded.numero, excluded.filial) then p.nota_valor end,
           nota_em = case when (p.numero, p.filial) = (excluded.numero, excluded.filial) then p.nota_em end,
           nota_origem = case when (p.numero, p.filial) = (excluded.numero, excluded.filial) then p.nota_origem end,$x$);
