-- AS LEITURAS AVISAM DIREITO (migration 20270212690000).
--   1  uma falha só não avisa ninguém
--   2  a 2ª falha seguida avisa quem administra, uma vez
--   3  falhar de novo depois disso não repete o aviso
--   4  quando volta, o aviso de queda fica lido e sai "voltou a funcionar"
--   5  e a leitura fica zerada (sem falhas, com a hora da volta)
--   6  leitura que dá certo sem queda não avisa nada
--   7  chave recusada (p_na_hora) avisa já na 1ª falha
--   8  quem não administra não recebe aviso
--   9  o navegador não chama as funções
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-leituras', 'Leituras', false) as a;
create temporary table u on commit drop as
select tests.create_user('dona@leituras.test', (select a from f)) as dona,
       tests.create_user('ana@leituras.test', (select a from f)) as ana;
grant select on f, u to authenticated;
select tests.grant_role((select dona from u), 'admin');

create temporary view avisos as
select title, is_read, user_id from public.notifications
 where tenant_id = (select a from f) and type = 'ligacao_caiu';

select public.leitura_falhou('kommo', (select a from f), 'error sending request', false);
select is((select count(*)::int from avisos), 0, 'uma falha só não avisa');

select public.leitura_falhou('kommo', (select a from f), 'error sending request', false);
select is((select count(*)::int from avisos where title = 'A leitura do Kommo parou'), 1, 'a 2ª falha seguida avisa quem administra');

select public.leitura_falhou('kommo', (select a from f), 'de novo', false);
select is((select count(*)::int from avisos), 1, 'falhar de novo não repete o aviso');

select public.leitura_ok('kommo', (select a from f));
select is((select string_agg(title || ':' || is_read, ',' order by title) from avisos),
  'A leitura do Kommo parou:true,A leitura do Kommo voltou a funcionar:false', 'quando volta, a queda fica lida e sai o aviso de volta');
select is((select falhas || ':' || (caiu_em is null) || ':' || (voltou_em is not null) from public.mkt_kommo_robo where tenant_id = (select a from f)),
  '0:true:true', 'a leitura fica zerada, com a hora da volta');

select public.leitura_ok('kommo', (select a from f));
select is((select count(*)::int from avisos), 2, 'leitura certa sem queda não avisa');

select public.leitura_falhou('reunioes', (select a from f), 'o Google recusou a chave', true);
select is((select count(*)::int from avisos where title = 'A leitura das reuniões parou'), 1, 'chave recusada avisa já na 1ª falha');

select is((select count(*)::int from avisos where user_id = (select ana from u)), 0, 'quem não administra não recebe');

select tests.authenticate_as('ana@leituras.test');
select throws_ok($$ select public.leitura_ok('kommo', (select a from f)) $$, '42501', null, 'o navegador não chama as funções');
select tests.clear_authentication();

select * from finish();
rollback;
