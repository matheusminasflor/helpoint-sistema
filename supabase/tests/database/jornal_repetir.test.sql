-- JORNAL: NOTÍCIA QUE SE REPETE (migration 20261226010000; dono, 2026-10-13).
--   1    quem só edita (sem "Publicar") não liga a repetição
--   2    a próxima data nasce da data da notícia (semanal, publicada há 7 dias → hoje)
--   3-5  o relógio cria UMA cópia publicada, com a data de hoje, a mesma capa e o vínculo com a original
--   6    a próxima data anda uma semana; rodar de novo no mesmo dia não duplica
--   7    passada a data de parar, não cria mais
--   8    original despublicada não repete
--   9    "todo mês no dia 31" não escorrega depois de fevereiro
begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-jornal-rep', 'Jornal Rep', false) as a;
create temporary table u on commit drop as
select tests.create_user('ed@jornalrep.test',  (select a from f)) as ed,
       tests.create_user('adm@jornalrep.test', (select a from f)) as adm;
select tests.grant_role((select adm from u), 'admin');
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'marketing', 'So edita', '{"jornal": {"view": true, "edit": true}}'::jsonb from f;
select tests.grant_module((select ed from u), (select a from f), 'marketing');
select tests.grant_profile((select ed from u), (select a from f), 'marketing', 'So edita');
create temporary table d on commit drop as select (now() at time zone 'America/Sao_Paulo')::date as hoje;
grant select on f, u, d to authenticated;

-- ═══ 1. Só editar não liga a repetição. ═══
select tests.authenticate_as('ed@jornalrep.test');
select throws_ok($$ insert into public.jornal_noticias (titulo, repetir) values ('Reuniao', 'semanal') returning id $$,
  '42501', null, 'sem a caixinha Publicar nao liga a repeticao');
select tests.clear_authentication();

-- ═══ 2. A original: publicada há 7 dias, toda semana, com capa. ═══
select tests.authenticate_as('adm@jornalrep.test');
insert into public.jornal_noticias (titulo, texto, data_noticia, exibir_de, exibir_ate, capa_caminho, repetir)
select 'Reuniao geral', 'Toda segunda', hoje - 7, hoje - 7, hoje - 5, 'x/y/capa.png', 'semanal' from d returning id;
update public.jornal_noticias set status = 'publicada' where titulo = 'Reuniao geral' returning id;
select tests.clear_authentication();
select is((select proxima_repeticao from public.jornal_noticias where titulo = 'Reuniao geral' and repeticao_de is null),
  (select hoje from d), 'a proxima data e hoje (sete dias depois da noticia)');

-- ═══ 3-6. O relógio. ═══
select is(public.jornal_repetir(), 1, 'o relogio cria uma copia');
select is((select status || '|' || (data_noticia = hoje)::text || '|' || (exibir_ate = hoje + 2)::text || '|' || capa_caminho
             from public.jornal_noticias, d where repeticao_de is not null),
  'publicada|true|true|x/y/capa.png', 'publicada, com a data de hoje, o mesmo tempo na tela e a mesma capa');
select is((select count(*)::int from public.jornal_noticias c join public.jornal_noticias o on o.id = c.repeticao_de
            where o.titulo = 'Reuniao geral' and c.repetir is null), 1, 'a copia aponta para a original e nao se repete');
select is((select proxima_repeticao from public.jornal_noticias, d where repeticao_de is null and titulo = 'Reuniao geral'),
  (select hoje + 7 from d), 'a proxima data anda uma semana');
select is(public.jornal_repetir(), 0, 'rodar de novo no mesmo dia nao duplica');

-- ═══ 7. Data de parar. ═══
insert into public.jornal_noticias (tenant_id, titulo, data_noticia, status, repetir, repetir_ate)
select a, 'Parou', hoje - 14, 'publicada', 'semanal', hoje - 1 from f, d;
update public.jornal_noticias set proxima_repeticao = (select hoje from d) where titulo = 'Parou';
select is(public.jornal_repetir(), 0, 'passada a data de parar, nao cria mais');

-- ═══ 8. Despublicada não repete. ═══
insert into public.jornal_noticias (tenant_id, titulo, data_noticia, status, repetir)
select a, 'Fora do ar', hoje - 7, 'despublicada', 'semanal' from f, d;
select is(public.jornal_repetir(), 0, 'original despublicada nao repete');

-- ═══ 9-10. Dia 31. ═══
select is(public.jornal_proxima('2027-01-31', 'mensal', '2027-03-01'), '2027-03-31'::date,
  'todo mes no dia 31: depois de fevereiro volta ao 31');
select ok(not has_function_privilege('authenticated', 'public.jornal_repetir()', 'execute')
      and not has_function_privilege('anon', 'public.jornal_repetir()', 'execute'), 'o relogio so roda por dentro');

select * from finish();
rollback;
