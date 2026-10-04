-- INFORMADO × FATURADO, LADO A LADO (migration 20261202020000; decisão do dono, 2026-10-03)
--
-- O faturado só existe até a última nota importada (o corte). O lançado se divide em "até o
-- corte", que compara com o faturado, e "prévia", depois dele, que fica de fora da diferença.
--
--   O cenário (março de 2031; datas longe de hoje — lição 10):
--     notas: CA 10/03 R$ 1.000 e 20/03 R$ 500; CB 12/03 R$ 200; CZ 15/03 R$ 300.
--            O corte é 20/03, a maior emissão.
--     Ana (carteira NORTE): CA 05/03 R$ 900 (antes do corte), CA 25/03 R$ 400 (depois: prévia),
--                           CA 10/02 R$ 999 (fora do período).
--     Bia (carteira SUL):   CB 12/03 R$ 250; CA 10/03 R$ 100 (fora da carteira dela).
--     CZ faturou e ninguém lançou.
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-lancado-faturado', 'Lancado x Faturado', false) as a;

create temporary table u on commit drop as
select tests.create_user('dono@lxf.test', (select a from f)) as dono,
       tests.create_user('ana@lxf.test',  (select a from f)) as ana,
       tests.create_user('bia@lxf.test',  (select a from f)) as bia;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_module((select ana from u), (select a from f), 'comercial');
select tests.grant_module((select bia from u), (select a from f), 'comercial');
grant select on f, u to authenticated;

insert into public.com_carteira_membros (tenant_id, user_id, carteira)
values ((select a from f), (select ana from u), 'NORTE'),
       ((select a from f), (select bia from u), 'SUL');

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, ativo, origem)
values ((select a from f), 'CA', 'CLIENTE A', 'NORTE', true, 'cadastro'),
       ((select a from f), 'CB', 'CLIENTE B', 'SUL', true, 'cadastro'),
       ((select a from f), 'CZ', 'CLIENTE Z', null, true, 'cadastro');

-- As notas (o dono importa, como a tela). 3º argumento = itens + descartes (a conferência).
select tests.authenticate_as('dono@lxf.test');
select public.com_importar_vendas('MF', 'fixture-lxf.xlsx', 4, '{}'::jsonb,
  $items$[
    {"emissao":"2031-03-10","documento":"L01","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CA","cliente_nome":"CLIENTE A","produto_codigo":"LP","produto_nome":"Produto L","quantidade":1,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-20","documento":"L02","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CA","cliente_nome":"CLIENTE A","produto_codigo":"LP","produto_nome":"Produto L","quantidade":1,"valor_nota":500.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-12","documento":"L03","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB","cliente_nome":"CLIENTE B","produto_codigo":"LP","produto_nome":"Produto L","quantidade":1,"valor_nota":200.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-15","documento":"L04","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CZ","cliente_nome":"CLIENTE Z","produto_codigo":"LP","produto_nome":"Produto L","quantidade":1,"valor_nota":300.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);
select tests.clear_authentication();

insert into public.com_interacoes (tenant_id, vendedor_id, cliente_codigo, data, status, valor_venda, fora_da_carteira)
values ((select a from f), (select ana from u), 'CA', '2031-03-05', 'concluido', 900, false),
       ((select a from f), (select ana from u), 'CA', '2031-03-25', 'concluido', 400, false),
       ((select a from f), (select ana from u), 'CA', '2031-02-10', 'concluido', 999, false),
       ((select a from f), (select bia from u), 'CB', '2031-03-12', 'concluido', 250, false),
       ((select a from f), (select bia from u), 'CA', '2031-03-10', 'concluido', 100, true);

-- ═══ Como o gestor (dono) vê ═══
select tests.authenticate_as('dono@lxf.test');

select is(
  public.com_faturado_importado_ate(),
  '2031-03-20'::date,
  'o corte e a maior emissao importada'
);

select is(
  (select array[lancado_ate_corte, lancado_previa, faturado, diferenca]
     from public.com_lancado_x_faturado('2031-03-01', '2031-03-31')
    where vendedor_id = (select ana from u) and cliente_codigo = 'CA'),
  array[900, 400, 1500, -600]::numeric[],
  'Ana em CA: 900 ate o corte contra 1.500 faturado; os 400 de 25/03 ficam na previa, fora da diferenca'
);

select is(
  (select corte from public.com_lancado_x_faturado('2031-03-01', '2031-03-31') limit 1),
  '2031-03-20'::date,
  'cada linha diz ate quando o faturado foi importado'
);

select is(
  (select array[lancado_ate_corte, faturado, diferenca]
     from public.com_lancado_x_faturado('2031-03-01', '2031-03-31')
    where cliente_codigo = 'CZ' and vendedor_id is null),
  array[0, 300, -300]::numeric[],
  'cliente com faturado e sem lancamento aparece, sem vendedora'
);

select is(
  (select array_agg(compartilhado order by vendedor_id = (select ana from u))
     from public.com_lancado_x_faturado('2031-03-01', '2031-03-31')
    where cliente_codigo = 'CA'),
  array[true, true],
  'duas vendedoras lancaram para CA: as duas linhas mostram o faturado do cliente, marcadas como compartilhado'
);

select is(
  (select count(*)::int from public.com_lancado_x_faturado('2031-03-01', '2031-03-31')),
  4,
  'o gestor ve as quatro linhas: Ana/CA, Bia/CA, Bia/CB e CZ sem lancamento'
);

-- Período inteiro depois do corte: nada faturado ainda, tudo é prévia.
select is(
  (select array[lancado_ate_corte, lancado_previa, faturado]
     from public.com_lancado_x_faturado('2031-03-21', '2031-03-31')
    where vendedor_id = (select ana from u) and cliente_codigo = 'CA'),
  array[0, 400, 0]::numeric[],
  'periodo depois do corte: o lancado inteiro e previa e o faturado e zero, nunca diferenca'
);

select throws_ok(
  $$ select * from public.com_lancado_x_faturado('2031-03-31', '2031-03-01') $$,
  '22023', null,
  'periodo invertido e recusado'
);
select tests.clear_authentication();

-- ═══ A vendedora vê só as dela ═══
select tests.authenticate_as('ana@lxf.test');
select is(
  (select array_agg(coalesce(vendedor_id::text, 'sem') || '|' || cliente_codigo)
     from public.com_lancado_x_faturado('2031-03-01', '2031-03-31')),
  array[(select ana from u)::text || '|CA'],
  'Ana ve so a linha dela: nem a da Bia, nem a de cliente sem lancamento'
);
select tests.clear_authentication();

-- ═══ Nada novo executa como anon (lição 14) ═══
select is(
  (select count(*)::int
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('com_lancado_x_faturado', 'com_faturado_importado_ate')
      and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'as funcoes do informado x faturado nao executam como anon'
);

select * from finish();
rollback;
