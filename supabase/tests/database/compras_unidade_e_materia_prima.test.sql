-- COMPRAS: UNIDADE NO PEDIDO, QUALQUER UM CADASTRA PRODUTO, MATÉRIA-PRIMA (migration 20270212010000; dono, 2026-10-27).
-- lucas (sem nada em Compras) cadastra "Glicerina" em kg e pede 2,5 kg pelo caminho da tela (`compras_abrir_pedido`).
--   1   lucas cadastra o produto, em kg, com RETURNING (como o PostgREST)
--   2   o pedido grava a unidade escolhida e a quantidade quebrada
--   3   sem a unidade no pedido (tela antiga), vale a do produto do catálogo
--   4   unidade fora da lista é recusada no pedido
--   5   e no catálogo
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-compras-unidade', 'Compras Unidade', false) as a;
create temporary table u on commit drop as
select tests.create_user('lucas@comprasun.test', (select a from f)) as lucas;
select tests.grant_module((select lucas from u), (select a from f), 'qualidade');

create temporary table prod (id uuid) on commit drop;
create temporary table pedido (solicitacao uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert, delete on prod, pedido to authenticated;

select tests.authenticate_as('lucas@comprasun.test');
select lives_ok(
  $$ with x as (insert into public.compras_produtos (tenant_id, name, unidade) select a, 'Glicerina', 'kg' from f returning id)
     insert into prod select id from x $$,
  'quem pede (sem nada em Compras) cadastra o produto novo, ja com a unidade');

insert into pedido
select public.compras_abrir_pedido(
  '{"title":"Glicerina"}'::jsonb,
  jsonb_build_object('product_id', (select id from prod), 'product_name', 'Glicerina', 'department', 'qualidade',
                     'quantidade', '2.5', 'unidade', 'kg'),
  '[{"supplier":"Quimica A","valor_unitario":"40","link":"https://a"}]'::jsonb);
select is((select quantidade::text || ' ' || unidade from public.compras_solicitacoes
            where solicitacao_id = (select solicitacao from pedido)), '2.500 kg',
  'o pedido grava a unidade e a quantidade quebrada (2,5 kg)');

-- Em dois comandos: a consulta que chama a função não enxerga a linha que ela grava (regra 13).
delete from pedido;
insert into pedido
select public.compras_abrir_pedido(
  '{"title":"Glicerina de novo"}'::jsonb,
  jsonb_build_object('product_id', (select id from prod), 'product_name', 'Glicerina', 'department', 'qualidade',
                     'quantidade', '1'),
  '[]'::jsonb);
select is((select unidade from public.compras_solicitacoes where solicitacao_id = (select solicitacao from pedido)),
  'kg', 'sem a unidade no pedido (tela antiga), vale a do produto do catalogo');

select throws_ok(
  $$ select public.compras_abrir_pedido('{"title":"X"}'::jsonb,
       '{"product_name":"Areia","department":"qualidade","quantidade":"1","unidade":"tonelada"}'::jsonb, '[]'::jsonb) $$,
  '23514', null, 'unidade fora da lista e recusada no pedido');
select throws_ok(
  $$ insert into public.compras_produtos (tenant_id, name, unidade) select a, 'Areia', 'tonelada' from f returning id $$,
  '23514', null, 'e no catalogo');
select tests.clear_authentication();

-- A categoria Matéria-prima é semente para as empresas que já existem (o tenant do teste nasce depois): é conferida
-- na produção depois do db push, não aqui — reescrever a semente no teste seria prova decorativa.

select * from finish();
rollback;
