-- AVISO DAS ATUALIZAÇÕES DO SISTEMA (migrations 20270111010000/020000; dono, 2026-10-14).
--   1  publicar uma atualização do sistema avisa toda pessoa ativa da empresa
--   2  notícia comum publicada não avisa
--   3  cada um marca e vê só as próprias leituras
begin;
\ir _helpers.psql

select plan(3);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-aviso-atual', 'Aviso Atual', false) as a;
create temporary table u on commit drop as
select tests.create_user('um@avisoatual.test', (select a from f)) as um,
       tests.create_user('dois@avisoatual.test', (select a from f)) as dois;
grant select on f, u to authenticated;

create temporary table n on commit drop as
with x as (
  insert into public.jornal_noticias (tenant_id, titulo, tipo, status, publicada_em)
  select a, 'Novidades', 'atualizacao_sistema', 'publicada', now() from f returning id
) select id from x;
insert into public.jornal_noticias (tenant_id, titulo, tipo, status, publicada_em) select a, 'Festa', 'festa_evento', 'publicada', now() from f;
grant select on n to authenticated;

select is((select count(*)::int from public.notifications where reference_id = (select id from n) and type = 'system_update'
            and user_id in ((select um from u), (select dois from u))), 2, 'publicar uma atualizacao avisa toda pessoa ativa');
select is((select count(*)::int from public.notifications where tenant_id = (select a from f) and type = 'system_update'
            and reference_id <> (select id from n)), 0, 'noticia comum nao avisa');

select tests.authenticate_as('um@avisoatual.test');
insert into public.jornal_lidas (noticia_id) select id from n returning noticia_id;
select tests.clear_authentication();
select tests.authenticate_as('dois@avisoatual.test');
select is((select count(*)::int from public.jornal_lidas), 0, 'cada um ve so as proprias leituras');
select tests.clear_authentication();

select * from finish();
rollback;
