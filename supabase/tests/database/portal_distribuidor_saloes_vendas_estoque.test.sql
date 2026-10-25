-- Portal do Distribuidor, parte 2 (migration 20270204020000): salões, contatos, visitas, vendas, estoque e Meu dia.
--
-- O que justifica a suíte: (1) o contato do salão NÃO chega à Minasflor (decisão 3 do dono, LGPD), mesmo para quem
-- lê o Comercial; (2) o estoque conta a nota do Forteplus só desde a liberação; (3) o vendedor vê e vende só nos
-- salões dele. Inserts com `returning`, como o PostgREST manda (regra 11).
begin;
\ir _helpers.psql

select plan(18);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-dist2', 'Distribuidora Dois', false) as a,
       (now() at time zone 'America/Sao_Paulo')::date as hoje;

insert into public.com_clientes (tenant_id, codigo, razao_social, documento, ativo, origem)
values ((select a from f), 'D-1', 'DISTRIBUIDORA DOIS LTDA', '08319138000160', true, 'cadastro');
insert into public.com_produtos (tenant_id, codigo, nome)
values ((select a from f), 'P1', 'Shampoo'), ((select a from f), 'P2', 'Mascara');

create temporary table u on commit drop as
select tests.create_customer('dono@d2.test', (select a from f))     as dono,
       tests.create_customer('vendedor@d2.test', (select a from f)) as vendedor,
       tests.create_customer('fora@d2.test', (select a from f))     as fora,
       tests.create_user('comercial@d2.test', (select a from f))    as comercial;
select tests.grant_module((select comercial from u), (select a from f), 'comercial');

-- O distribuidor já liberado (a parte 1 tem a suíte dela); a liberação marca hoje como o início do estoque.
create temporary table d on commit drop as
with novo as (
  insert into public.dist_distribuidores (tenant_id, razao_social, cnpj, status, com_cliente_codigo, pedido_por)
  select a, 'Distribuidora Dois', '08319138000160', 'liberado', 'D-1', (select dono from u) from f returning id
) select id from novo;
insert into public.dist_membros (tenant_id, distribuidor_id, user_id, email, papel)
select (select a from f), (select id from d), dono, 'dono@d2.test', 'dono' from u
union all
select (select a from f), (select id from d), vendedor, 'vendedor@d2.test', 'vendedor' from u;
grant select on f, u, d to authenticated;

-- As notas do Forteplus: uma de antes da liberação (não conta) e duas de hoje (venda e bonificação).
with imp as (insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
             select a, 'vendas', 'pgtap-dist2.xlsx', 3 from f returning id)
insert into public.com_vendas_itens (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
                                     cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select (select a from f), imp.id, 'MF', x.emissao, x.doc, '1', '5101', x.classe, 'D-1', x.produto, x.nome, x.qtd, 100
  from imp, (values ((select hoje from f) - 40, '1', 'venda', 'P1', 'Shampoo', 100),
                    ((select hoje from f), '2', 'venda', 'P1', 'Shampoo', 10),
                    ((select hoje from f), '3', 'bonificacao', 'P2', 'Mascara', 2)) x(emissao, doc, classe, produto, nome, qtd);

-- ── Salões ──────────────────────────────────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('dono@d2.test');
create temporary table s on commit drop as select null::uuid as do_dono, null::uuid as do_vendedor;
grant select, update on s to authenticated;

select lives_ok(
  $$ with n as (insert into public.dist_saloes (distribuidor_id, nome, cidade) values ((select id from d), 'Salão do Dono', 'Contagem')
                returning id) update s set do_dono = (select id from n) $$,
  'o dono cadastra um salao');
select lives_ok(
  $$ insert into public.dist_saloes_contatos (salao_id, distribuidor_id, nome, telefone)
     values ((select do_dono from s), (select id from d), 'Maria', '31 90000-0000') returning id $$,
  'e o contato dele');

select tests.clear_authentication();
select tests.authenticate_as('vendedor@d2.test');
select lives_ok(
  $$ with n as (insert into public.dist_saloes (distribuidor_id, nome) values ((select id from d), 'Salão do Vendedor')
                returning id) update s set do_vendedor = (select id from n) $$,
  'o vendedor cadastra o salao dele');
select is((select count(*)::int from public.dist_saloes), 1, 'o vendedor ve so o salao dele');
update public.dist_saloes set nome = 'Mexido' where id = (select do_dono from s);
select tests.clear_authentication();
select is((select nome from public.dist_saloes where id = (select do_dono from s)), 'Salão do Dono',
  'e nao mexe no salao do dono');

select tests.authenticate_as('dono@d2.test');
select is((select count(*)::int from public.dist_saloes), 2, 'o dono ve todos os saloes');

-- ── A Minasflor ve o salao, nao o contato ───────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select tests.authenticate_as('comercial@d2.test');
select is((select count(*)::int from public.dist_saloes), 2, 'o Comercial ve os saloes do distribuidor');
select is((select count(*)::int from public.dist_saloes_contatos), 0, 'mas NAO ve o nome e o telefone do contato (LGPD)');

-- ── Estoque e venda ─────────────────────────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select tests.authenticate_as('vendedor@d2.test');
select is((select string_agg(produto_codigo || '=' || saldo, ',' order by produto_codigo) from public.dist_estoque()),
  'P1=10,P2=2', 'o estoque conta as notas desde a liberacao, com a bonificacao');
select lives_ok(
  $$ select public.dist_registrar_venda((select do_vendedor from s), (select hoje from f),
       '[{"produto_codigo": "P1", "quantidade": 3, "valor_unitario": 40}]'::jsonb) $$,
  'o vendedor registra a venda no salao dele');
select is((select saldo from public.dist_estoque() where produto_codigo = 'P1'), 7::numeric, 'e o estoque baixa');
select is((select etapa from public.dist_saloes where id = (select do_vendedor from s)), 'cliente', 'e o salao vira cliente');
select throws_ok(
  $$ select public.dist_registrar_venda((select do_dono from s), (select hoje from f), '[{"produto_codigo": "P1", "quantidade": 1}]'::jsonb) $$,
  '42501', null, 'o vendedor NAO vende no salao do dono');
select throws_ok($$ select public.dist_ajustar_estoque('P1', 5) $$, '42501', null, 'nem ajusta o estoque');

select tests.clear_authentication();
select tests.authenticate_as('dono@d2.test');
select public.dist_ajustar_estoque('P1', 5);
select is((select saldo from public.dist_estoque() where produto_codigo = 'P1'), 5::numeric, 'o dono ajusta: tenho 5');
insert into public.dist_visitas (distribuidor_id, salao_id, quando) values ((select id from d), (select do_dono from s), now());
select is(jsonb_array_length(public.dist_meu_dia() -> 'visitas'), 1, 'a visita de hoje aparece no Meu dia');

select tests.clear_authentication();
select tests.authenticate_as('comercial@d2.test');
select is((select saldo from public.dist_estoque((select id from d)) where produto_codigo = 'P1'), 5::numeric,
  'o Comercial ve o estoque do distribuidor');

select tests.clear_authentication();
select tests.authenticate_as('fora@d2.test');
select is((select count(*)::int from public.dist_estoque((select id from d))), 0, 'quem e de fora nao ve o estoque de ninguem');

select * from finish();
rollback;
