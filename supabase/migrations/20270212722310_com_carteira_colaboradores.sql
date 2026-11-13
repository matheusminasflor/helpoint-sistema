-- CARTEIRA COLABORADORES (dono, 2026-11-13): "todos os colaboradores em uma carteira nova chamada Colaboradores [...]
-- preciso conseguir fazer essas coisas direto no helpoint". E, na mesma rodada: "CARTEIRA COLABORADORES NAO PRECISA DE
-- METAS E COMISSOES". A Jacqueline responde por ela (o membro é dado da produção, não desta migration).
--
-- Até aqui (20270212721950) o cliente interno não ficava em carteira nenhuma: o gatilho apagava a carteira em silêncio,
-- e foi assim que o Yuri (1343) e a LOJAS MINASFLOR (1167) "não salvavam". Agora:
--   * marcar "Colaborador" (interno) leva o cliente para a COLABORADORES;
--   * interno só fica na COLABORADORES ou sem carteira (as contas da própria empresa continuam sem carteira);
--   * a COLABORADORES recusa cliente que não é interno, com o motivo;
--   * só dono e admin marcam ou desmarcam "Colaborador".
-- A venda do interno continua fora da meta e da comissão: `com_venda_atribuida` passa a tirá-lo também do faturado, que
-- antes saía de graça porque ele não tinha carteira.

create or replace function public.com_cliente_interno_sem_carteira()
returns trigger language plpgsql set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.interno or tg_op = 'UPDATE' and new.interno is distinct from old.interno)
     and auth.uid() is not null and pg_trigger_depth() <= 1
     and not public.is_admin_or_higher(auth.uid()) then
    raise exception 'Só o dono e os administradores marcam um cliente como colaborador.' using errcode = '42501';
  end if;

  if new.interno and (tg_op = 'INSERT' or not old.interno) then
    new.carteira := 'COLABORADORES';
  elsif new.interno and coalesce(public.normalizar_nome_carteira(new.carteira), '') <> 'COLABORADORES' then
    new.carteira := null;
  elsif not new.interno and public.normalizar_nome_carteira(new.carteira) = 'COLABORADORES' then
    raise exception 'A carteira COLABORADORES é só de colaborador: marque "Colaborador" no cadastro do cliente.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.com_venda_atribuida(p_de date, p_ate date)
 returns table(vendedor_id uuid, cliente_codigo text, faturado numeric, previa numeric, corte date)
 language sql
 stable
 set search_path to 'public'
as $function$
  with c as (select public.com_faturado_importado_ate() as d),
  fat as (
    select mb.user_id as vendedor_id, v.cliente_codigo,
           sum(v.valor_curva * (1 + public.com_parte_no_dia(cl.periodos_condicao, v.emissao))) as faturado
      from public.com_vendas_itens v
      cross join c
      join public.com_clientes cl on cl.tenant_id = v.tenant_id and cl.codigo = v.cliente_codigo
      join public.com_carteira_membros mb on mb.tenant_id = v.tenant_id and mb.carteira = cl.carteira
     where v.tenant_id = public.get_user_tenant_id()
       and c.d is not null
       and not cl.interno
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
     where not exists (select 1 from public.com_clientes ci
                        where ci.tenant_id = public.get_user_tenant_id() and ci.codigo = x.cliente_codigo and ci.interno)
     group by x.vendedor_id, x.cliente_codigo
  )
  select coalesce(f.vendedor_id, p.vendedor_id), coalesce(f.cliente_codigo, p.cliente_codigo),
         coalesce(f.faturado, 0), coalesce(p.previa, 0), (select d from c)
    from fat f
    full join prev p on p.vendedor_id = f.vendedor_id and p.cliente_codigo = f.cliente_codigo;
$function$;
