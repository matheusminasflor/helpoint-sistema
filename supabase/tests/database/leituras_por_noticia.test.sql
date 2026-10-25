-- LEITURAS POR NOTÍCIA (migration 20270131040000): quem publica no Jornal vê a contagem; os outros, nada.
begin;
\ir _helpers.psql

select plan(3);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-leituras', 'Leituras', false) as a;
create temporary table u on commit drop as
select tests.create_user('pub@leituras.test', (select a from f)) as pub,
       tests.create_user('um@leituras.test', (select a from f)) as um,
       tests.create_user('dois@leituras.test', (select a from f)) as dois;
grant select on f, u to authenticated;
select tests.grant_module((select pub from u), (select a from f), 'marketing');
insert into public.access_profiles (tenant_id, department, name, is_default, permissions)
values ((select a from f), 'marketing', 'Redator (pgTAP)', false, '{"jornal": {"edit": true}}'::jsonb);
select tests.grant_profile((select pub from u), (select a from f), 'marketing', 'Redator (pgTAP)');

create temporary table n on commit drop as
with x as (
  insert into public.jornal_noticias (tenant_id, titulo, tipo, status, publicada_em)
  select a, 'Festa de fim de ano', 'festa_evento', 'publicada', now() from f returning id
) select id from x;
grant select on n to authenticated;

select tests.authenticate_as('um@leituras.test');
insert into public.jornal_lidas (noticia_id) select id from n returning noticia_id;
select tests.clear_authentication();
select tests.authenticate_as('dois@leituras.test');
insert into public.jornal_lidas (noticia_id) select id from n returning noticia_id;
select is((select count(*)::int from public.jornal_leituras()), 0, 'quem não publica no Jornal não vê contagem');
select tests.clear_authentication();

select tests.authenticate_as('pub@leituras.test');
select is((select lidas from public.jornal_leituras() where noticia_id = (select id from n)), 2, 'quem publica vê quantos leram');
select is((select pessoas from public.jornal_leituras() where noticia_id = (select id from n)), 3, 'e de quantas pessoas ativas');
select tests.clear_authentication();

select * from finish();
rollback;
