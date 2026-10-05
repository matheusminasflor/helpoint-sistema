-- DIRETRIZES POR SETOR (migration 20261204010000; decisões do dono, 2026-10-04).
--
--   editor: TI, perfil com "Criar e editar"            pub: TI, perfil com "Publicar" e "Excluir"
--   leitor: só a concessão da TI                       mkt: só o Marketing      rh: só o RH
--   dir:    a Diretoria
--
--   D1: TI, "só o setor", exige ciência     D2: TI, "empresa toda"     D3: TI, "setores" = Marketing
--   D4: TI, rascunho que ninguém publica
begin;
\ir _helpers.psql

select plan(22);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-diretrizes-setor', 'Diretrizes por setor', false) as a;
create temporary table u on commit drop as
select tests.create_user('editor@dir-setor.test', (select a from f)) as editor,
       tests.create_user('pub@dir-setor.test',    (select a from f)) as pub,
       tests.create_user('leitor@dir-setor.test', (select a from f)) as leitor,
       tests.create_user('mkt@dir-setor.test',    (select a from f)) as mkt,
       tests.create_user('rh@dir-setor.test',     (select a from f)) as rh,
       tests.create_user('dir@dir-setor.test',    (select a from f)) as dir;
select tests.grant_module((select editor from u), (select a from f), 'ti');
select tests.grant_module((select pub from u),    (select a from f), 'ti');
select tests.grant_module((select leitor from u), (select a from f), 'ti');
select tests.grant_module((select mkt from u),    (select a from f), 'marketing');
select tests.grant_module((select rh from u),     (select a from f), 'rh');
select tests.grant_module((select dir from u),    (select a from f), 'diretoria');

insert into public.access_profiles (tenant_id, department, name, is_default, permissions)
values ((select a from f), 'ti', 'Escreve diretriz (pgTAP)', false, '{"diretrizes": {"view": true, "edit": true}}'::jsonb),
       ((select a from f), 'ti', 'Publica diretriz (pgTAP)', false, '{"diretrizes": {"view": true, "publish": true, "delete": true}}'::jsonb);
select tests.grant_profile((select editor from u), (select a from f), 'ti', 'Escreve diretriz (pgTAP)');
select tests.grant_profile((select pub from u),    (select a from f), 'ti', 'Publica diretriz (pgTAP)');
grant select on f, u to authenticated;

create temporary table d (nome text, id uuid) on commit drop;
grant select, insert on d to authenticated;

-- ═══ 1. Quem cria e edita escreve o rascunho — com RETURNING, como o PostgREST (lição 11) ═══
select tests.authenticate_as('editor@dir-setor.test');
select lives_ok($$
  with t as (
    insert into public.diretrizes (setor, titulo, conteudo, visibilidade, setores_visiveis, exige_ciencia)
    values ('ti', 'Senhas', 'Troque a senha a cada 90 dias.', 'setor', '{}', true),
           ('ti', 'Uso do e-mail', 'Nada de corrente.', 'empresa', '{}', false),
           ('ti', 'Arte no notebook', 'Pedir ao Marketing.', 'setores', '{marketing}', false),
           ('ti', 'Rascunho eterno', 'x', 'setor', '{}', false)
    returning id, titulo)
  insert into d select case titulo when 'Senhas' then 'D1' when 'Uso do e-mail' then 'D2'
                                   when 'Arte no notebook' then 'D3' else 'D4' end, id from t $$,
  'quem tem "Criar e editar" na TI cria diretriz em rascunho');

-- ═══ 2-3. Quem só edita não publica — nem pela função, nem mudando o status na mão ═══
select throws_ok($$select public.diretriz_publicar((select id from d where nome = 'D1'))$$,
  '42501', null, 'sem "Publicar", a funcao de publicar recusa');
select throws_ok($$update public.diretrizes set status = 'publicada' where id = (select id from d where nome = 'D1')$$,
  '42501', null, 'mudar o status na mao e barrado pela guarda');
select tests.clear_authentication();

-- ═══ 4. Rascunho é invisível a quem só lê ═══
select tests.authenticate_as('leitor@dir-setor.test');
select is((select count(*)::int from public.diretrizes), 0, 'quem e do setor nao ve rascunho');
select tests.clear_authentication();

-- ═══ 5-6. Quem publica publica: versão 1 gravada ═══
select tests.authenticate_as('pub@dir-setor.test');
select is(public.diretriz_publicar((select id from d where nome = 'D1'), 'primeira'), 1, 'publicar devolve a versao 1');
select public.diretriz_publicar((select id from d where nome = 'D2'));
select public.diretriz_publicar((select id from d where nome = 'D3'));
select is((select titulo || '|' || conteudo || '|' || resumo from public.diretrizes_versoes
            where diretriz_id = (select id from d where nome = 'D1')),
  'Senhas|Troque a senha a cada 90 dias.|primeira', 'a publicacao grava a versao com o texto e o resumo');
select tests.clear_authentication();

-- ═══ 7-12. Quem lê o quê ═══
select tests.authenticate_as('leitor@dir-setor.test');
select is((select array_agg(titulo order by titulo) from public.diretrizes),
  array['Arte no notebook', 'Senhas', 'Uso do e-mail'], 'quem e do setor le as publicadas do setor (nao o rascunho)');
select is((select count(*)::int from public.diretrizes_versoes), 3, 'e le as versoes delas');
select tests.clear_authentication();

select tests.authenticate_as('mkt@dir-setor.test');
select is((select array_agg(titulo order by titulo) from public.diretrizes),
  array['Arte no notebook', 'Uso do e-mail'], 'outro setor le a "empresa toda" e a que escolheu o setor dele, nao a "so do setor"');
select tests.clear_authentication();

select tests.authenticate_as('rh@dir-setor.test');
select is((select array_agg(titulo order by titulo) from public.diretrizes),
  array['Uso do e-mail'], 'setor nao escolhido le so a "empresa toda"');
select tests.clear_authentication();

select tests.authenticate_as('dir@dir-setor.test');
select is((select count(*)::int from public.diretrizes), 3, 'a Diretoria le todas as publicadas, de qualquer visibilidade');
select tests.clear_authentication();

-- ═══ 13. Quem só lê não edita: UPDATE barrado afeta zero linhas (lição 12) ═══
select tests.authenticate_as('leitor@dir-setor.test');
with t as (update public.diretrizes set titulo = 'hackeado' where id = (select id from d where nome = 'D1') returning id)
select is((select count(*)::int from t), 0, 'quem so le nao edita (zero linhas)');

-- ═══ 14. Ciência da versão atual ═══
select lives_ok($$insert into public.diretrizes_ciencias (diretriz_id, versao)
                  values ((select id from d where nome = 'D1'), 1) returning id$$,
  'quem le da ciencia da versao publicada');
select tests.clear_authentication();

-- ═══ 15-17. Nova versão pede ciência de novo ═══
select tests.authenticate_as('editor@dir-setor.test');
update public.diretrizes set conteudo = 'Troque a senha a cada 60 dias.' where id = (select id from d where nome = 'D1');
select tests.clear_authentication();
select tests.authenticate_as('pub@dir-setor.test');
select is(public.diretriz_publicar((select id from d where nome = 'D1'), 'prazo menor'), 2, 'republicar vira a versao 2');
select tests.clear_authentication();

select tests.authenticate_as('leitor@dir-setor.test');
select is((select conteudo from public.diretrizes_versoes
            where diretriz_id = (select id from d where nome = 'D1') and numero = 1),
  'Troque a senha a cada 90 dias.', 'a versao 1 continua como foi publicada');
select throws_ok($$insert into public.diretrizes_ciencias (diretriz_id, versao, user_id)
                   values ((select id from d where nome = 'D1'), 1, (select editor from u)) returning id$$,
  '42501', null, 'ninguem da ciencia por outra pessoa nem de versao velha');
select lives_ok($$insert into public.diretrizes_ciencias (diretriz_id, versao)
                  values ((select id from d where nome = 'D1'), 2) returning id$$,
  'a versao nova pede (e aceita) ciencia de novo');
select tests.clear_authentication();

-- ═══ 18-19. Arquivar: some de quem lê, a Diretoria continua vendo ═══
select tests.authenticate_as('pub@dir-setor.test');
select public.diretriz_arquivar((select id from d where nome = 'D1'));
select tests.clear_authentication();
select tests.authenticate_as('leitor@dir-setor.test');
select is((select count(*)::int from public.diretrizes where id = (select id from d where nome = 'D1')), 0,
  'arquivada sai da consulta do setor');
select tests.clear_authentication();
select tests.authenticate_as('dir@dir-setor.test');
select is((select status from public.diretrizes where id = (select id from d where nome = 'D1')), 'arquivada',
  'a Diretoria ve a arquivada');
select tests.clear_authentication();

-- ═══ 20-21. Excluir: só rascunho, só com "Excluir rascunho" ═══
select tests.authenticate_as('editor@dir-setor.test');
with t as (delete from public.diretrizes where id = (select id from d where nome = 'D4') returning id)
select is((select count(*)::int from t), 0, 'sem "Excluir rascunho", o rascunho fica (zero linhas)');
select tests.clear_authentication();
select tests.authenticate_as('pub@dir-setor.test');
with t as (delete from public.diretrizes where id in (select id from d where nome in ('D2', 'D4')) returning id)
select is((select count(*)::int from t), 1, 'com a caixinha, apaga o rascunho e nao a publicada');
select tests.clear_authentication();

-- ═══ 22. anon fora (lição 14) ═══
select ok(not has_function_privilege('anon', 'public.diretriz_publicar(uuid, text)', 'execute')
      and not has_function_privilege('anon', 'public.diretriz_arquivar(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.diretriz_pode_ler(text, text, text, text[])', 'execute'),
  'anon nao chama as funcoes das diretrizes');

select * from finish();
rollback;
