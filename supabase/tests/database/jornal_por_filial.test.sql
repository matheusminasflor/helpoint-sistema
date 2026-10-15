-- JORNAL POR FILIAL (migration 20270117010000; dono, 2026-10-15). Ana é da Qualidade (INBRAS), Bia da TI (MF), Caio
-- é da Expedição e do Comercial (as duas).
--   1  a INBRAS vê a notícia da INBRAS e a de todos, não a da MF
--   2  a MF vê a da MF e a de todos
--   3  quem é dos dois lados vê as três
begin;
\ir _helpers.psql

select plan(3);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-jornal-filial', 'Jornal Filial', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@jfilial.test', (select a from f)) as ana,
       tests.create_user('bia@jfilial.test', (select a from f)) as bia,
       tests.create_user('caio@jfilial.test', (select a from f)) as caio;
select tests.grant_module((select ana from u), (select a from f), 'qualidade');
select tests.grant_module((select bia from u), (select a from f), 'ti');
select tests.grant_module((select caio from u), (select a from f), 'expedicao');
select tests.grant_module((select caio from u), (select a from f), 'comercial');
grant select on f, u to authenticated;

insert into public.jornal_noticias (tenant_id, titulo, tipo, status, publicada_em, publico)
select a, t, 'aviso', 'publicada', now(), p from f, (values ('Geral', 'todos'), ('Fabrica', 'INBRAS'), ('Escritorio', 'MF')) v(t, p);

select tests.authenticate_as('ana@jfilial.test');
select is((select string_agg(titulo, ',' order by titulo) from public.jornal_noticias), 'Fabrica,Geral', 'a INBRAS ve a dela e a de todos');
select tests.clear_authentication();
select tests.authenticate_as('bia@jfilial.test');
select is((select string_agg(titulo, ',' order by titulo) from public.jornal_noticias), 'Escritorio,Geral', 'a MF ve a dela e a de todos');
select tests.clear_authentication();
select tests.authenticate_as('caio@jfilial.test');
select is((select count(*)::int from public.jornal_noticias), 3, 'quem e dos dois lados ve as tres');
select tests.clear_authentication();

select * from finish();
rollback;
