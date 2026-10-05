-- Grupos de fornecedor (migration 20261203100000; decisão do dono, 2026-10-04).
--
--   mkt     Marketing, Operador — cria e edita fornecedor: cria grupo, liga e apaga
--   leitor  Marketing, Somente leitura — vê, não cria nem apaga
--   outra   de outra empresa — não vê os grupos da primeira
--
--   1      a empresa nova nasce com os 8 grupos de exemplo
--   2-5    quem edita fornecedor cria grupo e liga o fornecedor (com RETURNING, lição 11); o mesmo
--          fornecedor em DOIS grupos; nome repetido (maiúscula/espaço) é o mesmo grupo
--   6-9    quem só vê lê, não cria (42501) e não apaga nem desliga (zero linhas, lição 12)
--   10-11  outra empresa não vê; fornecedor de outra empresa não entra no grupo (FK composta)
--   12-13  apagar o grupo desfaz a ligação e o fornecedor fica
--   14-16  anon fora; a semente não é chamável por quem está logado
begin;
\ir _helpers.psql

select plan(16);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-grupos-forn', 'Grupos de fornecedor', false) as a,
       tests.create_tenant('pgtap-grupos-forn-b', 'Outra empresa', false) as b;
create temporary table u on commit drop as
select tests.create_user('mkt@grupos-forn.test',    (select a from f)) as mkt,
       tests.create_user('leitor@grupos-forn.test', (select a from f)) as leitor,
       tests.create_user('outra@grupos-forn.test',  (select b from f)) as outra;
select tests.grant_module(x, (select a from f), 'marketing') from (select mkt x from u union all select leitor from u) s;
select tests.grant_profile((select mkt from u), (select a from f), 'marketing', 'Operador');
select tests.grant_profile((select leitor from u), (select a from f), 'marketing', 'Somente leitura');

insert into public.suppliers (tenant_id, name) select a, 'Papelaria Central' from f;
insert into public.suppliers (tenant_id, name) select b, 'Fornecedor da B' from f;

create temporary table cnt (n int) on commit drop;
-- O id do fornecedor da outra empresa, lido aqui fora: logado, o RLS de `suppliers` o esconde.
create temporary table fb on commit drop as
select id as sid from public.suppliers where name = 'Fornecedor da B';
grant select on f, u, fb to authenticated;
grant select, insert, delete on cnt to authenticated;

-- ═══ 1. A semente. ═══
select is((select count(*)::int from public.fornecedor_grupos where tenant_id = (select a from f)), 8,
  'a empresa nova nasce com os 8 grupos de exemplo (Grafica, Brindes...)');

-- ═══ 2-5. Quem edita fornecedor. ═══
select tests.authenticate_as('mkt@grupos-forn.test');
select lives_ok($$ insert into public.fornecedor_grupos (nome) values ('Embalagens') returning id $$,
  'quem cria e edita fornecedor cria grupo (como o PostgREST, com returning)');
select lives_ok($$ insert into public.fornecedor_grupo_membros (supplier_id, grupo_id)
  select s.id, g.id from public.suppliers s, public.fornecedor_grupos g
   where s.name = 'Papelaria Central' and g.nome in ('Embalagens', 'Gráfica') returning supplier_id $$,
  'e liga o fornecedor aos grupos');
select is((select count(*)::int from public.fornecedor_grupo_membros m
            join public.suppliers s on s.id = m.supplier_id where s.name = 'Papelaria Central'), 2,
  'o mesmo fornecedor fica em dois grupos');
select throws_ok($$ insert into public.fornecedor_grupos (nome) values (' embalagens ') returning id $$,
  '23505', null, 'maiuscula e espaco nao criam um segundo grupo com o mesmo nome');
select tests.clear_authentication();

-- ═══ 6-9. Quem só vê. ═══
select tests.authenticate_as('leitor@grupos-forn.test');
select is((select count(*)::int from public.fornecedor_grupos), 9, 'quem so ve fornecedor ve os grupos');
select throws_ok($$ insert into public.fornecedor_grupos (nome) values ('Grupo do leitor') returning id $$,
  '42501', null, 'mas nao cria grupo');
with x as (delete from public.fornecedor_grupos where nome = 'Embalagens' returning 1)
insert into cnt select count(*) from x;
select is((select n from cnt), 0, 'nem apaga grupo (zero linhas, licao 12)');
delete from cnt;
with x as (delete from public.fornecedor_grupo_membros returning 1)
insert into cnt select count(*) from x;
select is((select n from cnt), 0, 'nem tira fornecedor de grupo');
select tests.clear_authentication();

-- ═══ 10-11. Outra empresa. ═══
select tests.authenticate_as('outra@grupos-forn.test');
select is((select count(*)::int from public.fornecedor_grupos where tenant_id = (select a from f)), 0,
  'outra empresa nao ve os grupos da primeira');
select tests.clear_authentication();

select tests.authenticate_as('mkt@grupos-forn.test');
select throws_ok($$ insert into public.fornecedor_grupo_membros (supplier_id, grupo_id)
  select (select sid from fb), g.id
    from public.fornecedor_grupos g where g.nome = 'Embalagens' returning supplier_id $$,
  '23503', null, 'fornecedor de outra empresa nao entra no grupo (as duas pontas na mesma empresa)');

-- ═══ 12-13. Apagar grupo. ═══
select lives_ok($$ delete from public.fornecedor_grupos where nome = 'Embalagens' returning id $$,
  'quem edita fornecedor apaga o grupo');
select tests.clear_authentication();
select is((select count(*)::int from public.suppliers where name = 'Papelaria Central')
          || '|' || (select count(*)::int from public.fornecedor_grupo_membros m
                       join public.suppliers s on s.id = m.supplier_id where s.name = 'Papelaria Central'),
  '1|1', 'o fornecedor fica, e so a ligacao com o grupo apagado some');

-- ═══ 14-16. As portas. ═══
select ok(not has_function_privilege('anon', 'public.pode_editar_fornecedores()', 'execute'),
  'anon nao chama pode_editar_fornecedores');
select ok(not has_table_privilege('anon', 'public.fornecedor_grupos', 'select')
          and not has_table_privilege('anon', 'public.fornecedor_grupo_membros', 'select'),
  'anon nao le grupos nem ligacoes');
select ok(not has_function_privilege('authenticated', 'public.semear_grupos_de_fornecedor(uuid)', 'execute'),
  'a semente e caminho de dentro');

select * from finish();
rollback;
