-- MURAL DE ATUALIZAÇÕES DO SISTEMA (migration 20270108010000; dono, 2026-10-14).
--   1  a notícia do tipo "Atualização do sistema" é aceita
--   2  tipo fora da lista continua recusado
begin;
\ir _helpers.psql

select plan(2);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-jornal-sis', 'Jornal Sis', false) as a;

select lives_ok($$ insert into public.jornal_noticias (tenant_id, titulo, tipo) select a, 'Atualizacoes', 'atualizacao_sistema' from f $$,
  'a noticia do tipo Atualizacao do sistema e aceita');
select throws_ok($$ insert into public.jornal_noticias (tenant_id, titulo, tipo) select a, 'X', 'qualquer' from f $$,
  '23514', null, 'tipo fora da lista continua recusado');

select * from finish();
rollback;
