-- O faturado manda nos Indicadores do Comercial, pela carteira (migration 20261202030000; decisão
-- do dono, 2026-10-03).
--
--   ana  vendedora da carteira NORTE (cliente CN)
--   bia  vendedora da carteira SUL   (cliente CS) — não lança nada
--   Notas importadas: CN 10/03 R$ 1.000; CS 31/03 R$ 500 → o corte é 31/03.
--   Lançamentos da Ana: CN 05/03 R$ 40.000 (antes do corte: NÃO conta — o período já tem nota)
--                       CN 05/04 R$ 300    (depois do corte: prévia)
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-fat-manda', 'Faturado Manda', false) as a;
create temporary table u on commit drop as
select tests.create_user('dono@fatmanda.test', (select a from f)) as dono,
       tests.create_user('ana@fatmanda.test',  (select a from f)) as ana,
       tests.create_user('bia@fatmanda.test',  (select a from f)) as bia;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_module(x, (select a from f), 'comercial')
  from (select ana x from u union all select bia from u) s;
insert into public.com_carteira_membros (tenant_id, user_id, carteira)
values ((select a from f), (select ana from u), 'NORTE'), ((select a from f), (select bia from u), 'SUL');
insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, ativo, origem)
values ((select a from f), 'CN', 'CLIENTE NORTE', 'NORTE', true, 'cadastro'),
       ((select a from f), 'CS', 'CLIENTE SUL', 'SUL', true, 'cadastro');
grant select on f, u to authenticated;

select tests.authenticate_as('dono@fatmanda.test');
-- O 3º argumento é quantas linhas o arquivo tinha (a conferência da importação).
select public.com_importar_vendas('MF', 'fixture-fatmanda.xlsx', 2, '{}'::jsonb,
  $items$[
    {"emissao":"2031-03-10","documento":"N01","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CN","cliente_nome":"CLIENTE NORTE","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-31","documento":"N02","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CS","cliente_nome":"CLIENTE SUL","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":500.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);
select tests.clear_authentication();

insert into public.com_interacoes (tenant_id, vendedor_id, cliente_codigo, data, status, valor_venda)
values ((select a from f), (select ana from u), 'CN', '2031-03-05', 'concluido', 40000),
       ((select a from f), (select ana from u), 'CN', '2031-04-05', 'concluido', 300);

select tests.authenticate_as('dono@fatmanda.test');

-- ═══ 1-2. A venda atribuída separa faturado e prévia. ═══
select is(
  (select array[faturado, previa] from public.com_venda_atribuida('2031-03-01', '2031-04-30')
    where vendedor_id = (select ana from u) and cliente_codigo = 'CN'),
  array[1000, 300]::numeric[],
  'Ana: a nota de CN (carteira dela) e o lancado depois do corte; os 40 mil antes do corte nao contam'
);
select is(
  (select corte from public.com_venda_atribuida('2031-03-01', '2031-04-30') limit 1),
  '2031-03-31'::date,
  'o corte e a ultima nota importada'
);

-- ═══ 3-4. O painel do gestor usa a venda atribuída. ═══
select is(
  (select realizado from public.com_painel_do_gestor('2031-03-01', '2031-03-01', '2031-04-30')
    where vendedor_id = (select ana from u) and metrica = 'valor_vendas'),
  1300::numeric,
  'painel da Ana: 1.000 faturado + 300 de previa (o lancado de 40 mil antes do corte nao soma)'
);
select is(
  (select realizado from public.com_painel_do_gestor('2031-03-01', '2031-03-01', '2031-04-30')
    where vendedor_id = (select bia from u) and metrica = 'valor_vendas'),
  500::numeric,
  'Bia nao lancou nada, mas a nota da carteira dela conta: 500'
);

-- ═══ 5. O resumo da carteira também. ═══
select is(
  (select valor_vendido from public.com_resumo_da_carteira('2031-03-01', '2031-03-01', '2031-04-30')
    where vendedor_id = (select ana from u)),
  1300::numeric,
  'resumo da carteira da Ana: 1.300'
);

-- ═══ 6. A carteira mês a mês: março faturado, abril prévia. ═══
select is(
  (select array_agg(venda order by mes) from public.com_carteira_mes_a_mes('NORTE', 2031) where mes in (3, 4)),
  array[1000, 300]::numeric[],
  'NORTE mes a mes: marco = nota (1.000, nao os 40 mil lancados); abril = previa (300)'
);
select tests.clear_authentication();

-- ═══ 7. A função nova não abre para anon (lição 14). ═══
select ok(not has_function_privilege('anon', 'public.com_venda_atribuida(date, date)', 'execute'), 'anon nao chama');

select * from finish();
rollback;
