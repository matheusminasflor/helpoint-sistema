-- JORNAL SÓ A PARTIR DA DATA DE EXIBIÇÃO (migration 20261224010000; dono, 2026-10-09).
--   1  a notícia agendada para amanhã não aparece para quem lê (nem na página Jornal);
--   2  quem edita o Jornal a vê antes, para conferir;
--   3  a de hoje aparece para todos;  4 passada a data de fim, continua no histórico.
begin;
\ir _helpers.psql

select plan(4);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-jornal-data', 'Jornal Data', false) as a;
create temporary table u on commit drop as
select tests.create_user('le@jornaldata.test',  (select a from f)) as le,
       tests.create_user('mkt@jornaldata.test', (select a from f)) as mkt;
-- Quem edita: o administrador (`pode_no_setor` deixa) — não depende da semente do perfil de Marketing.
select tests.grant_role((select mkt from u), 'admin');
grant select on f, u to authenticated;

-- O "hoje" do Brasil, como o sistema grava (regra 10 do pgTAP).
create temporary table d on commit drop as select (now() at time zone 'America/Sao_Paulo')::date as hoje;
grant select on d to authenticated;
insert into public.jornal_noticias (tenant_id, titulo, texto, tipo, data_noticia, exibir_de, exibir_ate, status, autor_id)
select a, 'Amanha', 'x', 'aviso', hoje + 1, hoje + 1, hoje + 3, 'publicada', mkt from f, d, u
union all
select a, 'Hoje', 'x', 'aviso', hoje, hoje, null, 'publicada', mkt from f, d, u
union all
select a, 'Antiga', 'x', 'aviso', hoje - 10, hoje - 10, hoje - 5, 'publicada', mkt from f, d, u;

select tests.authenticate_as('le@jornaldata.test');
select is((select count(*)::int from public.jornal_noticias where titulo = 'Amanha'), 0,
  'a noticia agendada nao aparece antes da data para quem le');
select is((select count(*)::int from public.jornal_noticias where titulo = 'Hoje'), 1, 'a de hoje aparece');
select is((select count(*)::int from public.jornal_noticias where titulo = 'Antiga'), 1,
  'passado o periodo, continua no historico da pagina');
select tests.clear_authentication();

select tests.authenticate_as('mkt@jornaldata.test');
select is((select count(*)::int from public.jornal_noticias where titulo = 'Amanha'), 1,
  'quem edita o Jornal ve a agendada antes, para conferir');
select tests.clear_authentication();

select * from finish();
rollback;
