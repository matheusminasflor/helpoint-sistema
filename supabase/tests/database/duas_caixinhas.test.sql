-- DUAS CAIXINHAS (migration 20270129010000; dono, 2026-10-20). ron é o responsável da INBRAS, fre da MF; fin tem a
-- seção Caixinha do Financeiro; ana pede café na categoria Caixinha, escolhendo a INBRAS.
--   1  a empresa nova nasce com a INBRAS e a MF
--   2  o responsável lança a entrada na Caixinha dele
--   3  ... e não lança na Caixinha do outro
--   4  o responsável vê só a Caixinha dele
--   5  o Financeiro vê as duas
--   6  a entrada vira Reposição no Financeiro com a filial da Caixinha
--   7  o pedido guarda a Caixinha escolhida
--   8  o aviso do pedido vai para o responsável DAQUELA Caixinha
--   9  o responsável da outra Caixinha não decide o pedido
--  10  o responsável dela aprova, e a compra fica no nome dele
--  11  registrada, a saída cai na Caixinha do pedido
--  12  o saldo é de cada Caixinha: a MF sem entrada não paga, mesmo com a INBRAS cheia
--  13  as funções novas não abrem para anon
begin;
\ir _helpers.psql

select plan(14);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-duas-caixinhas', 'Duas Caixinhas', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@duascx.test', (select a from f)) as ana,
       tests.create_user('ron@duascx.test', (select a from f)) as ron,
       tests.create_user('fre@duascx.test', (select a from f)) as fre,
       tests.create_user('fin@duascx.test', (select a from f)) as fin;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'financeiro', 'Caixa', '{"caixinha": {"view": true}}'::jsonb from f;
select tests.grant_module((select fin from u), (select a from f), 'financeiro');
select tests.grant_profile((select fin from u), (select a from f), 'financeiro', 'Caixa');

select is((select string_agg(filial, ',' order by filial) from public.caixinhas where tenant_id = (select a from f)), 'INBRAS,MF',
  'a empresa nova nasce com a INBRAS e a MF');

update public.caixinhas set responsavel_id = case filial when 'INBRAS' then (select ron from u) else (select fre from u) end
 where tenant_id = (select a from f);
create temporary table cx on commit drop as
select (select id from public.caixinhas where tenant_id = (select a from f) and filial = 'INBRAS') as inbras,
       (select id from public.caixinhas where tenant_id = (select a from f) and filial = 'MF') as mf;

create temporary table cat on commit drop as
with x as (
  insert into public.ti_categories (tenant_id, module, name, is_purchase, caixinha)
  select a, 'compras', 'Caixinha', true, true from f returning id
) select id from x;
create temporary table pedido (solicitacao uuid) on commit drop;
grant select on f, u, cx, cat to authenticated;
grant select, insert on pedido to authenticated;
create or replace function pg_temp.compra() returns public.compras_solicitacoes language sql as
  $$ select s.* from public.compras_solicitacoes s where s.solicitacao_id = (select solicitacao from pedido) $$;

select tests.authenticate_as('ron@duascx.test');
select lives_ok($$ insert into public.caixinha_movimentos (tipo, valor, descricao, created_by, caixinha_id)
                   values ('entrada', 100, 'Repasse INBRAS', auth.uid(), (select inbras from cx)) returning id $$,
  'o responsavel lanca a entrada na Caixinha dele');
select throws_ok($$ insert into public.caixinha_movimentos (tipo, valor, descricao, created_by, caixinha_id)
                    values ('entrada', 50, 'Repasse MF', auth.uid(), (select mf from cx)) returning id $$,
  '42501', null, '... e nao lanca na Caixinha do outro');
select tests.clear_authentication();

insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao, caixinha_id)
select a, 'entrada', 30, 'Repasse MF antigo', (select mf from cx) from f;
-- A MF volta a zero para o item 12 (a reposição no Financeiro sai junto).
delete from public.caixinha_movimentos where descricao = 'Repasse MF antigo';

select tests.authenticate_as('ron@duascx.test');
select is((select string_agg(distinct caixinha_id::text, ',') from public.caixinha_movimentos), (select inbras::text from cx),
  'o responsavel ve so a Caixinha dele');
select tests.clear_authentication();

insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao, caixinha_id)
select a, 'entrada', 1, 'Moeda MF', (select mf from cx) from f;
select tests.authenticate_as('fin@duascx.test');
select is((select count(distinct caixinha_id)::int from public.caixinha_movimentos), 2, 'o Financeiro ve as duas');
select tests.clear_authentication();
delete from public.caixinha_movimentos where descricao = 'Moeda MF';

select is((select description || '|' || filial from public.fin_entries
            where id = (select fin_entry_id from public.caixinha_movimentos where descricao = 'Repasse INBRAS')),
  'Reposição da Caixinha INBRAS|INBRAS', 'a entrada vira Reposicao no Financeiro com a filial da Caixinha');

select tests.authenticate_as('ana@duascx.test');
insert into pedido
select public.compras_abrir_pedido(
  jsonb_build_object('title', 'Cafe', 'priority', 'low', 'category_id', (select id from cat)),
  jsonb_build_object('few_quotes_reason', 'pgtap: fornecedor unico', 'product_name', 'Cafe 500g', 'quantidade', '2', 'caixinha_id', (select inbras from cx)),
  '[{"supplier":"Mercado","valor_unitario":"20","link":"https://m"}]'::jsonb);
select tests.clear_authentication();

select is((pg_temp.compra()).caixinha_id, (select inbras from cx), 'o pedido guarda a Caixinha escolhida');
select is((select array_agg(user_id) from public.notifications
            where reference_type = 'solicitacao' and reference_id = (pg_temp.compra()).solicitacao_id and type = 'purchase_requested'), array[(select ron from u)],
  'o aviso do pedido vai para o responsavel DAQUELA Caixinha');

create or replace function pg_temp.aprovar() returns int language plpgsql as $$
declare n int;
begin
  update public.compras_solicitacoes
     set status = 'approved', approved_by = auth.uid(), approved_at = now(),
         approved_quote_id = (select id from public.compras_orcamentos where request_id = (pg_temp.compra()).id limit 1)
   where id = (pg_temp.compra()).id;
  get diagnostics n = row_count;
  return n;
end;
$$;
select tests.authenticate_as('fre@duascx.test');
select is(pg_temp.aprovar(), 0, 'o responsavel da outra Caixinha nao decide o pedido');
select tests.clear_authentication();

select tests.authenticate_as('ron@duascx.test');
select pg_temp.aprovar();
select tests.clear_authentication();
select is((pg_temp.compra()).comprador_id, (select ron from u),
  'o responsavel dela aprova, e a compra fica no nome dele');

select tests.authenticate_as('ron@duascx.test');
update public.compras_solicitacoes
   set status = 'completed', purchase_file_path = 'recibo.jpg', purchase_report = 'Comprado no mercado',
       executed_by = auth.uid(), executed_at = now()
 where id = (pg_temp.compra()).id;
select tests.clear_authentication();
select is((select caixinha_id from public.caixinha_movimentos where purchase_request_id = (pg_temp.compra()).id), (select inbras from cx),
  'registrada, a saida cai na Caixinha do pedido');

select throws_ok($$ insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao, recibo_path, produto_id, quantidade, caixinha_id)
                    select a, 'saida', 5, 'Acucar', 'r.jpg',
                           (select id from public.compras_produtos limit 1), 1, (select mf from cx) from f $$,
  '23514', null, 'o saldo e de cada Caixinha: a MF sem entrada nao paga, mesmo com a INBRAS cheia');

-- 20270129050000 (dono): quem não é o responsável só lê a Caixinha — mesmo com a seção Caixinha do Financeiro.
update public.access_profiles set permissions = '{"caixinha": {"view": true, "create": true, "delete": true}}'::jsonb
 where tenant_id = (select a from f) and name = 'Caixa';
select tests.authenticate_as('fin@duascx.test');
select throws_ok($$ insert into public.caixinha_movimentos (tipo, valor, descricao, created_by, caixinha_id)
                    values ('entrada', 10, 'Repasse', auth.uid(), (select inbras from cx)) returning id $$,
  '42501', null, 'o Financeiro sem ser o responsavel so le a Caixinha: nao lanca');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.pode_na_caixinha(text, uuid)', 'execute')
          and not has_function_privilege('anon', 'public.responsavel_da_caixinha(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.pode_decidir_compra(boolean, uuid)', 'execute')
          and not has_function_privilege('anon', 'public.saldo_da_caixinha(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.e_responsavel_de_caixinha()', 'execute'),
  'as funcoes novas nao abrem para anon');

select * from finish();
rollback;
