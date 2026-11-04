-- AVISO QUANDO A LIGAÇÃO COM A META CAIR (migration 20270212300000).
--   1  cai: chamado na TI, interrupção aberta e aviso só para quem é do setor de TI — uma vez por queda
--   2  volta: a interrupção fecha, o chamado ganha nota interna e continua aberto (a TI resolve), sai o aviso
--   3  a conferência de hora em hora derruba a ligação sem busca há mais de X horas
--   4  desligado na configuração: marca a queda, sem chamado nem aviso
--   5  a chave vai vencer: avisa uma vez
--   6  a tela não chama o que é do coletor; a situação só para quem configura
begin;
\ir _helpers.psql

select plan(16);

create temporary table f on commit drop as select tests.create_tenant('pgtap-lig-meta', 'Lig Meta', false) as a;
create temporary table u on commit drop as
select tests.create_user('ti@ligmeta.test', (select a from f)) as ti,
       tests.create_user('mkt@ligmeta.test', (select a from f)) as mkt,
       tests.create_user('dono@ligmeta.test', (select a from f)) as dono;
select tests.grant_module((select ti from u), (select a from f), 'ti');
select tests.grant_module((select mkt from u), (select a from f), 'marketing');
select tests.grant_role((select dono from u), 'owner');
insert into public.ti_categories (tenant_id, module, name, is_active) values ((select a from f), 'tickets', 'Sistemas', true);
insert into public.mkt_meta_ligacao (tenant_id, contas, conectado_por, conectado_em, ok_em)
values ((select a from f), '[]', (select dono from u), now() - interval '2 days', now());

create temporary view chamados as
  select * from public.tickets where tenant_id = (select a from f) and title like '%Ligação com a Meta caiu%';
create temporary view avisos as
  select * from public.notifications where tenant_id = (select a from f) and type = 'ligacao_caiu';

-- 1 ──────────────────────────────────────────────────────────────────────────
select public.ligacao_meta_resultado((select a from f), false, true, 'a chave da Meta deixou de valer', null);
select is((select count(*)::int from chamados), 1, 'caiu: chamado na TI');
select is((select priority::text || ' / ' || status::text from chamados), 'high / open', 'aberto, prioridade alta');
-- "Sistemas Internos" quando a empresa tem (a semente cria), senão "Sistemas" (o nome na produção).
select is((select c.name from chamados t join public.ti_categories c on c.id = t.category_id),
          coalesce((select name from public.ti_categories where tenant_id = (select a from f) and name = 'Sistemas Internos' and is_active limit 1), 'Sistemas'),
          'na categoria Sistemas Internos, ou Sistemas');
select is((select count(*)::int from public.ti_interrupcoes where tenant_id = (select a from f) and fim is null and tipo = 'sistema'),
          1, 'caiu: interrupcao Sistema aberta');
select is((select count(*)::int from avisos where user_id = (select ti from u)), 1, 'caiu: aviso para quem e da TI');
select is((select count(*)::int from avisos where user_id = (select mkt from u)), 0, 'e nao para quem e so do Marketing');
select public.ligacao_meta_resultado((select a from f), false, true, 'a chave da Meta deixou de valer', null);
select is((select count(*)::int from chamados), 1, 'a mesma queda nao abre outro chamado');

-- 2 ──────────────────────────────────────────────────────────────────────────
select public.ligacao_meta_resultado((select a from f), true, false, null, null);
select is((select count(*)::int from public.ti_interrupcoes where tenant_id = (select a from f) and fim is not null), 1, 'voltou: a interrupcao fecha');
select is((select count(*)::int from public.ticket_comments c join chamados t on t.id = c.ticket_id where c.is_internal), 1,
          'voltou: nota interna no chamado');
select is((select status::text from chamados), 'open', 'e o chamado continua aberto (a TI resolve)');
select is((select count(*)::int from avisos where user_id = (select ti from u) and title = 'A ligação com a Meta voltou'), 1, 'voltou: aviso');

-- 3 ──────────────────────────────────────────────────────────────────────────
update public.mkt_meta_ligacao set ok_em = now() - interval '13 hours' where tenant_id = (select a from f);
select public.ligacoes_conferir();
select ok((select caiu_em is not null from public.mkt_meta_ligacao where tenant_id = (select a from f)),
          'sem busca ha mais de 12 horas, a conferencia derruba a ligacao');

-- 4 ──────────────────────────────────────────────────────────────────────────
select public.ligacao_meta_resultado((select a from f), true, false, null, null);
update public.tenants set settings = jsonb_set(coalesce(settings, '{}'), '{alerts}', '{"ligacoes": {"meta": {"ligado": false}}}')
 where id = (select a from f);
select public.ligacao_meta_resultado((select a from f), false, true, 'a chave da Meta deixou de valer', null);
select is((select count(*)::int from chamados), 2, 'desligado: marca a queda sem abrir chamado (o 2o veio da conferencia)');

-- 5 ──────────────────────────────────────────────────────────────────────────
update public.tenants set settings = settings #- '{alerts,ligacoes}' where id = (select a from f);
select public.ligacao_meta_resultado((select a from f), true, false, null, now() + interval '3 days');
select public.ligacao_meta_resultado((select a from f), true, false, null, now() + interval '3 days');
select is((select count(*)::int from avisos where user_id = (select ti from u) and title = 'A chave da Meta vai vencer'), 1,
          'a chave vai vencer: avisa uma vez');

-- 6 ──────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('ti@ligmeta.test');
select throws_ok($$ select public.ligacao_meta_resultado(gen_random_uuid(), true, false, null, null) $$, '42501', null,
                 'a tela nao chama o que e do coletor');
select tests.clear_authentication();
select tests.authenticate_as('dono@ligmeta.test');
select ok((select public.situacao_da_ligacao_meta() ->> 'conectada')::boolean, 'quem configura ve a situacao');
select tests.clear_authentication();

select * from finish();
rollback;
