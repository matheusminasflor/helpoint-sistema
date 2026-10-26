-- Rodada 2, R5 (migration 20270208010000): o Portal completo.
--
-- O que justifica a suíte: (1) salão com venda NÃO se apaga (decisão do dono, 2026-10-26) — o cascade levava as
-- vendas e o estoque "voltava" —, mas apagar o distribuidor inteiro continua levando tudo; (2) corrigir a venda
-- refaz o total e o estoque acompanha, sem trocar quem vendeu; (3) o estoque inicial por planilha grava a diferença,
-- só pelo responsável; (4) quem sai da equipe passa os salões ao responsável.
begin;
\ir _helpers.psql

select plan(17);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-dist5', 'Distribuidora Cinco', false) as a,
       (now() at time zone 'America/Sao_Paulo')::date as hoje;

insert into public.com_clientes (tenant_id, codigo, razao_social, documento, ativo, origem)
values ((select a from f), 'D-5', 'DISTRIBUIDORA CINCO LTDA', '08319138000160', true, 'cadastro');
insert into public.com_produtos (tenant_id, codigo, nome)
values ((select a from f), 'P1', 'Shampoo'), ((select a from f), 'P2', 'Mascara');

create temporary table u on commit drop as
select tests.create_customer('dono@d5.test', (select a from f))     as dono,
       tests.create_customer('vendedor@d5.test', (select a from f)) as vendedor,
       tests.create_customer('fora@d5.test', (select a from f))     as fora;

create temporary table d on commit drop as
with novo as (
  insert into public.dist_distribuidores (tenant_id, razao_social, cnpj, status, com_cliente_codigo, pedido_por)
  select a, 'Distribuidora Cinco', '08319138000160', 'liberado', 'D-5', (select dono from u) from f returning id
) select id from novo;
insert into public.dist_membros (tenant_id, distribuidor_id, user_id, email, papel)
select (select a from f), (select id from d), dono, 'dono@d5.test', 'dono' from u
union all
select (select a from f), (select id from d), vendedor, 'vendedor@d5.test', 'vendedor' from u;
grant select on f, u, d to authenticated;

-- Uma nota de hoje: entram 10 do P1.
with imp as (insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
             select a, 'vendas', 'pgtap-dist5.xlsx', 1 from f returning id)
insert into public.com_vendas_itens (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
                                     cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select (select a from f), imp.id, 'MF', (select hoje from f), '1', '1', '5101', 'venda', 'D-5', 'P1', 'Shampoo', 10, 100 from imp;

create temporary table s on commit drop as select null::uuid as salao, null::uuid as vazio, null::uuid as venda;
grant select, update on s to authenticated;

-- ── Corrigir a venda ────────────────────────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('vendedor@d5.test');
with n as (insert into public.dist_saloes (distribuidor_id, nome) values ((select id from d), 'Salão do Vendedor') returning id)
update s set salao = (select id from n);
update s set venda = public.dist_registrar_venda((select salao from s), (select hoje from f),
  '[{"produto_codigo": "P1", "quantidade": 3, "valor_unitario": 40}]'::jsonb);

select lives_ok(
  $$ select public.dist_corrigir_venda((select venda from s), (select hoje from f),
       '[{"produto_codigo": "P1", "quantidade": 2, "valor_unitario": 45}, {"produto_codigo": "P2", "quantidade": 1, "valor_unitario": 10}]'::jsonb) $$,
  'quem vendeu corrige a venda');
select is((select total from public.dist_vendas where id = (select venda from s)), 100::numeric, 'e o total e refeito (2 x 45 + 10)');
select is((select saldo from public.dist_estoque() where produto_codigo = 'P1'), 8::numeric, 'e o estoque acompanha (10 - 2)');
select throws_ok(
  $$ select public.dist_corrigir_venda((select venda from s), (select hoje from f) + 1, '[{"produto_codigo": "P1", "quantidade": 1}]'::jsonb) $$,
  '23514', null, 'a data da venda nao vai para o futuro');

select tests.clear_authentication();
select tests.authenticate_as('dono@d5.test');
select lives_ok(
  $$ select public.dist_corrigir_venda((select venda from s), (select hoje from f),
       '[{"produto_codigo": "P1", "quantidade": 2, "valor_unitario": 45}, {"produto_codigo": "P2", "quantidade": 1, "valor_unitario": 10}]'::jsonb,
       'conferido') $$,
  'o responsavel corrige a venda do vendedor');
select is((select vendedor_id from public.dist_vendas where id = (select venda from s)), (select vendedor from u),
  'e quem vendeu continua sendo o vendedor');

select tests.clear_authentication();
select tests.authenticate_as('fora@d5.test');
select throws_ok(
  $$ select public.dist_corrigir_venda((select venda from s), (select hoje from f), '[{"produto_codigo": "P1", "quantidade": 1}]'::jsonb) $$,
  '42501', null, 'quem e de fora nao corrige');

-- ── Apagar o salão ──────────────────────────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select tests.authenticate_as('dono@d5.test');
with n as (insert into public.dist_saloes (distribuidor_id, nome) values ((select id from d), 'Cadastro errado') returning id)
update s set vazio = (select id from n);
select lives_ok($$ delete from public.dist_saloes where id = (select vazio from s) $$, 'o salao sem venda se apaga');
select is((select count(*)::int from public.dist_saloes where id = (select vazio from s)), 0, 'e some mesmo');
select throws_ok($$ delete from public.dist_saloes where id = (select salao from s) $$, '23514', null,
  'o salao COM venda nao se apaga: vira Perdido');

-- ── Estoque inicial por planilha ────────────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select tests.authenticate_as('vendedor@d5.test');
select throws_ok($$ select public.dist_importar_estoque('[{"produto_codigo": "P1", "tenho": 5}]'::jsonb) $$, '42501', null,
  'o vendedor nao informa o estoque');

select tests.clear_authentication();
select tests.authenticate_as('dono@d5.test');
-- P1 conta 8 (vai a 5); P2 conta -1 (vendeu 1 sem nota; vai a 0).
select is(public.dist_importar_estoque('[{"produto_codigo": "P1", "tenho": 5}, {"produto_codigo": "P2", "tenho": 0}]'::jsonb), 2,
  'o responsavel importa a planilha: dois produtos mudaram');
select is((select string_agg(produto_codigo || '=' || saldo, ',' order by produto_codigo) from public.dist_estoque()), 'P1=5,P2=0',
  'e o estoque fica com o que ele tem');
select throws_ok($$ select public.dist_importar_estoque('[{"produto_codigo": "NAO-EXISTE", "tenho": 1}]'::jsonb) $$, '23514', null,
  'codigo que nao e produto recusa a planilha');
select throws_ok($$ select public.dist_importar_estoque('[{"produto_codigo": "P1", "tenho": 1}, {"produto_codigo": "P1", "tenho": 2}]'::jsonb) $$,
  '23514', null, 'o mesmo produto em duas linhas recusa a planilha');

-- ── Quem sai da equipe passa os salões ──────────────────────────────────────────────────────────────────────────
select public.dist_tirar_da_equipe((select m.id from public.dist_membros m where m.user_id = (select vendedor from u)));
select is((select responsavel_id from public.dist_saloes where id = (select salao from s)), (select dono from u),
  'o salao de quem saiu da equipe passa ao responsavel');

-- ── Apagar o distribuidor leva tudo, com venda ou sem ───────────────────────────────────────────────────────────
select tests.clear_authentication();
select lives_ok($$ delete from public.dist_distribuidores where id = (select id from d) $$,
  'apagar o distribuidor leva os saloes com venda em cascata (o gatilho so vale no delete direto)');

select * from finish();
rollback;
