-- O ACESSO É UMA ESCOLHA POR SETOR (migration 20261115040000, LEVA P parte 3)
--
-- A tela passa a oferecer, por setor, "Sem acesso" ou um perfil. Para isso valer em Compras,
-- Compras precisava de perfis — não tinha nenhum.
--
--   1 — empresa nova nasce com os três perfis de Compras, e o padrão é o Operador;
--   2 e 3 — o Operador de Compras executa compra e NÃO aprova (aprovar é do Gestor), pela mesma
--           função que as policies perguntam;
--   4 — a semente não é chamável por quem está logado.
begin;
\ir _helpers.psql

select plan(4);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-acesso-setor', 'Acesso Setor', false) as a;
create temporary table u on commit drop as
select tests.create_user('op@acesso.test', (select a from f)) as op;

select is(
  (select string_agg(name || case when is_default then '*' else '' end, ', ' order by name)
     from public.access_profiles where tenant_id = (select a from f) and department = 'compras'),
  'Gestor, Operador*, Somente leitura',
  'empresa nova nasce com os tres perfis de Compras, Operador como padrao'
);

select tests.grant_module((select op from u), (select a from f), 'compras');
insert into public.user_access_profiles (tenant_id, user_id, department, profile_id)
select (select a from f), (select op from u), 'compras', ap.id
  from public.access_profiles ap
 where ap.tenant_id = (select a from f) and ap.department = 'compras' and ap.name = 'Operador';

select ok(public.tem_permissao((select op from u), 'compras', 'solicitacoes', 'execute'),
  'o Operador de Compras executa a compra');
select ok(not public.tem_permissao((select op from u), 'compras', 'solicitacoes', 'approve'),
  'o Operador de Compras nao aprova: aprovar e do Gestor');

select ok(not has_function_privilege('authenticated', 'public.seed_perfis_de_compras(uuid)', 'execute'),
  'a semente de perfis nao e chamavel por quem esta logado');

select * from finish();
rollback;
