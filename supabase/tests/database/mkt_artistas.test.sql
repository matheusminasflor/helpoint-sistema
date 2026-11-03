-- MARKETING › ARTISTAS (migration 20270212210000; dono, 2026-11-03).
--   1    quem cadastra artista (seção artistas › edit) cadastra, como a tela grava (insert com returning)
--   2    quem lança (artistas › create) lança a entrega, com returning
--   3    quem só lança não muda o teto do artista (o update não afeta linha)
--   4    nem apaga entrega sem "Apagar entrega"
--   5    a reunião é do mês: dia que não é o 1º não entra
--   6    quem não tem a seção não vê nada
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as select tests.create_tenant('pgtap-mkt-artistas', 'MKT Artistas') as a;
create temporary table u on commit drop as
select tests.create_user('gestor@mktart.test', (select a from f)) as gestor,
       tests.create_user('lanca@mktart.test',  (select a from f)) as lanca,
       tests.create_user('fora@mktart.test',   (select a from f)) as fora;
select tests.grant_module(x, (select a from f), 'marketing')
  from (select gestor x from u union all select lanca from u union all select fora from u) s;
select tests.grant_profile((select gestor from u), (select a from f), 'marketing', 'Gestor');
select tests.grant_profile((select lanca from u), (select a from f), 'marketing', 'Operador');
-- Empresa nova nasce sem a seção (ponytail da migration): liga como a Minasflor ficou.
update public.access_profiles set permissions = permissions || '{"artistas": {"view": true, "create": true, "edit": true, "delete": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'marketing' and name = 'Gestor';
update public.access_profiles set permissions = permissions || '{"artistas": {"view": true, "create": true, "edit": false, "delete": false}}'::jsonb
 where tenant_id = (select a from f) and department = 'marketing' and name = 'Operador';
grant select on f, u to authenticated;
create temporary table r (nome text, id uuid);
grant select, insert on r to authenticated;

-- ═══ 1 ═══
select tests.authenticate_as('gestor@mktart.test');
select lives_ok($$
  with x as (insert into public.mkt_artistas (tenant_id, nome, teto_mensal) select a, 'Artista A', 4000 from f returning id)
  insert into r select 'artista', id from x $$, 'quem cadastra artista cadastra (com returning)');
select tests.clear_authentication();

-- ═══ 2-5 ═══
select tests.authenticate_as('lanca@mktart.test');
select lives_ok($$
  with x as (insert into public.mkt_artistas_entregas (tenant_id, artista_id, data, tipo, quantidade, produto, aprovado, na_campanha)
             select a, (select id from r where nome = 'artista'), date '2026-11-03', 'stories', 5, 'Liss Evolution', true, true from f returning id)
  insert into r select 'entrega', id from x $$, 'quem lanca lanca a entrega (com returning)');
update public.mkt_artistas set teto_mensal = 9999 where id = (select id from r where nome = 'artista');
delete from public.mkt_artistas_entregas where id = (select id from r where nome = 'entrega');
select tests.clear_authentication();
select is((select teto_mensal from public.mkt_artistas where id = (select id from r where nome = 'artista')), 4000::numeric(12,2),
  'quem so lanca nao muda o teto do artista');
select is((select count(*)::int from public.mkt_artistas_entregas where id = (select id from r where nome = 'entrega')), 1,
  'nem apaga a entrega sem "Apagar entrega"');
select throws_ok($$ insert into public.mkt_artistas_reunioes (tenant_id, artista_id, mes, presente)
  select a, (select id from r where nome = 'artista'), date '2026-11-03', true from f $$, '23514', null, 'a reuniao e do mes (dia 1)');

-- ═══ 6 ═══
select tests.authenticate_as('fora@mktart.test');
select is((select count(*)::int from public.mkt_artistas) + (select count(*)::int from public.mkt_artistas_entregas), 0,
  'sem a secao Artistas nao ve nada');
select tests.clear_authentication();

select * from finish();
rollback;
