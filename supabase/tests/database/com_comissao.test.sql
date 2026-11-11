-- A COMISSÃO (20270212721500; docs/regra-comissao.md).
--   1  carteira que bateu a meta com nota: 0,5% de toda a venda, garantida
--   2  carteira que só bate a meta com a prévia: nada garantido, o 0,5% fica "a confirmar"
--   3  carteira abaixo da meta: zero, e diz quanto falta
--   4  CRM, consumidor final e salão: 10%, tudo "a confirmar" (a nota da loja ainda não chega)
--   5  CRM, distribuidor sem nota: 5% do valor do Kommo, "a confirmar"
--   6  a lead da equipe (interno) não conta
--   7  quem não tem os relatórios do Comercial não vê a comissão
begin;
\ir _helpers.psql

select plan(7);

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
       tests.create_user('bia@comissao.test', (select a from f)) as bia;
grant select on f, u to authenticated;
select tests.grant_role((select dona from u), 'admin');

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

select * from finish();
rollback;
