-- ATÉ 8 CATEGORIAS PRINCIPAIS POR SETOR (migration 20261222010000; dono, 2026-10-09).
-- A empresa nova nasce com 5 no Marketing (semente).
--   1  a 8ª entra;  2 a 9ª é recusada;  3 subcategoria não conta;
--   4  desativar uma libera a vaga;  5 reativar quando já há 8 é recusado;
--   6  quem não pode configurar recebe "sem permissão" (42501), não o limite.
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-cat8', 'Cat 8', false) as a;
create temporary table u on commit drop as
select tests.create_user('op@cat8.test', (select a from f)) as op;
select tests.grant_module((select op from u), (select a from f), 'marketing');
select tests.grant_profile((select op from u), (select a from f), 'marketing', 'Operador');
grant select on f, u to authenticated;

insert into public.ti_categories (tenant_id, module, name)
select a, 'marketing', n from f, (values ('Seis'), ('Sete')) v(n);

select lives_ok($$ insert into public.ti_categories (tenant_id, module, name) select a, 'marketing', 'Oito' from f $$,
  'a oitava categoria do setor entra');
select throws_ok($$ insert into public.ti_categories (tenant_id, module, name) select a, 'marketing', 'Nove' from f $$,
  '23514', null, 'a nona e recusada');
select lives_ok($$ insert into public.ti_categories (tenant_id, module, name, parent_id)
  select a, 'marketing', 'Sub', (select id from public.ti_categories where tenant_id = a and name = 'Oito') from f $$,
  'subcategoria nao conta no limite');

update public.ti_categories set is_active = false where tenant_id = (select a from f) and name = 'Sete';
select lives_ok($$ insert into public.ti_categories (tenant_id, module, name) select a, 'marketing', 'Nove' from f $$,
  'desativar uma libera a vaga');
select throws_ok($$ update public.ti_categories set is_active = true where tenant_id = (select a from f) and name = 'Sete' $$,
  '23514', null, 'reativar quando ja ha 8 e recusado');

select tests.authenticate_as('op@cat8.test');
select throws_ok($$ insert into public.ti_categories (tenant_id, module, name) select a, 'marketing', 'Dez' from f returning id $$,
  '42501', null, 'quem nao configura o setor recebe o sem permissao, nao o limite');
select tests.clear_authentication();

select * from finish();
rollback;
