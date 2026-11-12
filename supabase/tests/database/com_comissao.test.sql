-- A COMISSÃO (20270212721500; docs/regra-comissao.md).
--   1  carteira que bateu a meta com nota: 0,5% de toda a venda, garantida
--   2  carteira que só bate a meta com a prévia: nada garantido, o 0,5% fica "a confirmar"
--   3  carteira abaixo da meta: zero, e diz quanto falta
--   4  CRM, consumidor final e salão: 10%, tudo "a confirmar" (a nota da loja ainda não chega)
--   5  CRM, distribuidor sem nota: 5% do valor do Kommo, "a confirmar"
--   6  a lead da equipe (interno) não conta
--   7  quem não tem os relatórios do Comercial não vê a comissão
--   8  vários meses: cada mês contra a própria meta; a possível (o % de toda a venda) só nos meses com meta
--   9  mudar o % vale do mês escolhido em diante: outubro não muda
--  10  quem não tem a aba Comissão no perfil não muda o %
begin;
\ir _helpers.psql

select plan(11);

select ok((select garantida = 1500 and a_confirmar = 0 from public.com_comissao_da_carteira(300000, 0, 276000)),
  'bateu a meta com nota: 0,5% de toda a venda, garantida');
select ok((select garantida = 0 and a_confirmar = 1400 and falta = 0 from public.com_comissao_da_carteira(280000, 10000, 276000)),
  'só bate com a prévia: o 0,5% fica a confirmar');
select ok((select garantida = 0 and a_confirmar = 0 and falta = 200554.60 from public.com_comissao_da_carteira(75445.40, 0, 276000)),
  'abaixo da meta: zero, e quanto falta');

create temporary table f on commit drop as
select tests.create_tenant('pgtap-comissao', 'Comissão', false) as a;
create temporary table u on commit drop as
select tests.create_user('dona@comissao.test', (select a from f)) as dona,
       tests.create_user('thay@comissao.test', (select a from f)) as thay,
       tests.create_user('bia@comissao.test', (select a from f)) as bia,
       tests.create_user('dono@comissao.test', (select a from f)) as dono;
grant select on f, u to authenticated;
select tests.grant_role((select dona from u), 'admin');
select tests.grant_role((select dono from u), 'owner');

-- As porcentagens moram em com_comissao_percentuais (20270212722110); a empresa de teste nasce sem elas.
insert into public.com_comissao_percentuais (tenant_id, tipo, origem, percentual, vale_de)
select (select a from f), x.tipo, x.origem, x.pct, date '2026-01-01'
  from (values ('carteira', 'ESPECIAL', 0.5), ('crm', 'consumidor', 10), ('crm', 'salao', 10), ('crm', 'distribuidor', 5)) x(tipo, origem, pct);

insert into public.kommo_usuarios (tenant_id, kommo_id, nome, user_id) values ((select a from f), 10, 'Thayná', (select thay from u));
insert into public.kommo_leads (tenant_id, lead_id, nome, link, interno) values ((select a from f), 4, 'Da equipe', 'k/4', true);
select public.mkt_kommo_gravar_vendas((select a from f), '2026-11-01', jsonb_build_array(
  jsonb_build_object('lead_id', 1, 'nome', 'Consumidora', 'funil', 'consumidor', 'situacao', 'ganha', 'valor', 635, 'fechou', '2026-11-10', 'link', 'k/1', 'responsavel', 10),
  jsonb_build_object('lead_id', 2, 'nome', 'Salão', 'funil', 'salao', 'situacao', 'ganha', 'valor', 735, 'fechou', '2026-11-10', 'link', 'k/2', 'responsavel', 10),
  jsonb_build_object('lead_id', 3, 'nome', 'Distribuidora nova', 'funil', 'distribuidor', 'situacao', 'ganha', 'valor', 2000, 'fechou', '2026-11-10', 'link', 'k/3', 'responsavel', 10),
  jsonb_build_object('lead_id', 4, 'nome', 'Da equipe', 'funil', 'consumidor', 'situacao', 'ganha', 'valor', 999, 'fechou', '2026-11-10', 'link', 'k/4', 'responsavel', 10)));

select tests.authenticate_as('dona@comissao.test');
create temporary table c on commit drop as select * from public.com_comissao('2026-11-01', '2026-11-30');
select ok((select bool_and(garantida = 0) and sum(a_confirmar) filter (where origem = 'Consumidor final') = 63.50
                  and sum(a_confirmar) filter (where origem = 'Salão') = 73.50
             from c where tipo = 'crm' and origem <> 'Novo distribuidor'),
  'consumidor e salão: 10%, a confirmar');
select ok((select garantida = 0 and a_confirmar = 100 from c where origem = 'Novo distribuidor'),
  'distribuidor sem nota: 5% do valor do Kommo, a confirmar');
select is((select sum(base_a_confirmar)::int from c where tipo = 'crm' and origem = 'Consumidor final'), 635, 'o lead interno não soma');
select tests.clear_authentication();

select tests.authenticate_as('bia@comissao.test');
select throws_ok($$ select * from public.com_comissao('2026-11-01', '2026-11-30') $$, '42501', null, 'sem os relatórios do Comercial não vê');
select tests.clear_authentication();


-- 8  a carteira fecha MÊS A MÊS (20270212721980): num período de vários meses, cada mês contra a própria meta. Janeiro
--    vende 5.000 sem meta, outubro 1.500 com meta de 1.000 (bateu), novembro 200 com meta de 1.000 (não bateu). Somando
--    o período (6.700 × 2.000) daria 33,50; mês a mês, só outubro paga: 7,50.
insert into public.com_carteira_membros (tenant_id, user_id, carteira) values ((select a from f), (select bia from u), 'ESPECIAL');
insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, ativo, origem)
values ((select a from f), 'CE', 'CLIENTE ESPECIAL', 'ESPECIAL', true, 'cadastro');
insert into public.com_metas (tenant_id, ano, mes, carteira, valor)
values ((select a from f), 2031, 10, 'ESPECIAL', 1000), ((select a from f), 2031, 11, 'ESPECIAL', 1000);
select tests.authenticate_as('dono@comissao.test');
select public.com_importar_vendas('MF', 'fixture-comissao.xlsx', 3, '{}'::jsonb,
  $items$[
    {"emissao":"2031-01-10","documento":"C01","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CE","cliente_nome":"CLIENTE ESPECIAL","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":5000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-10-10","documento":"C02","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CE","cliente_nome":"CLIENTE ESPECIAL","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":1500.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-11-10","documento":"C03","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CE","cliente_nome":"CLIENTE ESPECIAL","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":200.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);
select tests.clear_authentication();
select tests.authenticate_as('dona@comissao.test');
select results_eq(
  $$ select garantida, a_confirmar, base_garantida, falta from public.com_comissao('2031-01-01', '2031-11-30') where origem = 'ESPECIAL' $$,
  $$ values (7.50::numeric, 1.00::numeric, 6700.00::numeric, null::numeric) $$,
  'vários meses: cada mês contra a própria meta (só outubro paga) e sem "quanto falta"');
select tests.clear_authentication();

select tests.authenticate_as('dono@comissao.test');
select lives_ok(
  $$ insert into public.com_comissao_percentuais (tipo, origem, percentual, vale_de) values ('carteira', 'ESPECIAL', 1, '2031-11-01') returning id $$,
  'quem tem a aba Comissão (aqui, o dono) muda o %');
select results_eq(
  $$ select garantida, a_confirmar from public.com_comissao('2031-01-01', '2031-11-30') where origem = 'ESPECIAL' $$,
  $$ values (7.50::numeric, 2.00::numeric) $$,
  'o % novo vale de novembro em diante: outubro continua 7,50 (0,5%), novembro possível 2,00 (1%)');
select tests.clear_authentication();

select tests.authenticate_as('bia@comissao.test');
select throws_ok(
  $$ insert into public.com_comissao_percentuais (tipo, origem, percentual, vale_de) values ('crm', 'salao', 50, '2031-12-01') returning id $$,
  '42501', null, 'sem a aba Comissão no perfil, não muda o %');
select tests.clear_authentication();
select * from finish();
rollback;
