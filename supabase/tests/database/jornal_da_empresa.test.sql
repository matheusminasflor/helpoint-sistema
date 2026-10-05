-- JORNAL DA EMPRESA (migration 20261204020000; decisões do dono, 2026-10-04).
--
--   redator: Marketing, perfil com "Criar e editar"     editor: Marketing, "Criar e editar" + "Publicar"
--   leitor:  qualquer pessoa da empresa (só o RH)       outra:  pessoa de OUTRA empresa
begin;
\ir _helpers.psql

select plan(12);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-jornal', 'Jornal', false) as a,
       tests.create_tenant('pgtap-jornal-outra', 'Outra', false) as b;
create temporary table u on commit drop as
select tests.create_user('redator@jornal.test', (select a from f)) as redator,
       tests.create_user('editor@jornal.test',  (select a from f)) as editor,
       tests.create_user('leitor@jornal.test',  (select a from f)) as leitor,
       tests.create_user('outra@jornal.test',   (select b from f)) as outra;
select tests.grant_module((select redator from u), (select a from f), 'marketing');
select tests.grant_module((select editor from u),  (select a from f), 'marketing');
select tests.grant_module((select leitor from u),  (select a from f), 'rh');

insert into public.access_profiles (tenant_id, department, name, is_default, permissions)
values ((select a from f), 'marketing', 'Redator (pgTAP)', false, '{"jornal": {"edit": true}}'::jsonb),
       ((select a from f), 'marketing', 'Editor (pgTAP)',  false, '{"jornal": {"edit": true, "publish": true}}'::jsonb);
select tests.grant_profile((select redator from u), (select a from f), 'marketing', 'Redator (pgTAP)');
select tests.grant_profile((select editor from u),  (select a from f), 'marketing', 'Editor (pgTAP)');
grant select on f, u to authenticated;

create temporary table n (titulo text, id uuid) on commit drop;
grant select, insert on n to authenticated;

-- ═══ 1. Quem cria e edita escreve o rascunho — com RETURNING (lição 11) ═══
select tests.authenticate_as('redator@jornal.test');
select lives_ok($$
  with t as (
    insert into public.jornal_noticias (titulo, texto, tipo, destaque)
    values ('Festa junina', 'Sexta, no pátio.', 'festa_evento', true),
           ('Boas-vindas à Ana', 'Ana chegou ao RH.', 'novo_colaborador', false)
    returning id, titulo)
  insert into n select titulo, id from t $$,
  'quem tem "Criar e editar" escreve noticia em rascunho');

-- ═══ 2. Sem "Publicar", não publica ═══
select throws_ok($$update public.jornal_noticias set status = 'publicada' where id = (select id from n where titulo = 'Festa junina')$$,
  '42501', null, 'sem "Publicar e despublicar", o status nao muda');
select tests.clear_authentication();

-- ═══ 3. Rascunho é invisível a quem só lê ═══
select tests.authenticate_as('leitor@jornal.test');
select is((select count(*)::int from public.jornal_noticias), 0, 'rascunho nao aparece para a empresa');
-- ═══ 4. Quem só lê não escreve (WITH CHECK de INSERT levanta 42501, lição 12) ═══
select throws_ok($$insert into public.jornal_noticias (titulo) values ('pirata') returning id$$,
  '42501', null, 'quem nao tem a caixinha nao cria noticia');
select tests.clear_authentication();

-- ═══ 5-6. Quem publica publica; a data de publicação é do banco ═══
select tests.authenticate_as('editor@jornal.test');
with t as (update public.jornal_noticias set status = 'publicada'
            where id = (select id from n where titulo = 'Festa junina') returning publicada_em)
select ok((select publicada_em from t) is not null, 'quem tem "Publicar" publica, e o banco marca quando');
select tests.clear_authentication();

select tests.authenticate_as('leitor@jornal.test');
select is((select array_agg(titulo) from public.jornal_noticias), array['Festa junina'],
  'qualquer pessoa da empresa le a publicada, e so ela');
-- ═══ 7. Quem só lê não edita: zero linhas (lição 12) ═══
with t as (update public.jornal_noticias set titulo = 'x' returning id)
select is((select count(*)::int from t), 0, 'quem so le nao edita (zero linhas)');
select tests.clear_authentication();

-- ═══ 8. Outra empresa não vê ═══
select tests.authenticate_as('outra@jornal.test');
select is((select count(*)::int from public.jornal_noticias), 0, 'outra empresa nao ve o jornal');
select tests.clear_authentication();

-- ═══ 9-10. Despublicar tira da empresa; volta a rascunho não ═══
select tests.authenticate_as('editor@jornal.test');
update public.jornal_noticias set status = 'despublicada' where id = (select id from n where titulo = 'Festa junina');
select throws_ok($$update public.jornal_noticias set status = 'rascunho' where id = (select id from n where titulo = 'Festa junina')$$,
  '22023', null, 'despublicada nao volta a rascunho');
select tests.clear_authentication();
select tests.authenticate_as('leitor@jornal.test');
select is((select count(*)::int from public.jornal_noticias), 0, 'despublicada sai da empresa');
select tests.clear_authentication();

-- ═══ 11. Sem "Excluir", não apaga ═══
select tests.authenticate_as('editor@jornal.test');
with t as (delete from public.jornal_noticias returning id)
select is((select count(*)::int from t), 0, 'sem "Excluir", nada se apaga (zero linhas)');
select tests.clear_authentication();

-- ═══ 12. anon fora (lição 14) ═══
select ok(not has_function_privilege('anon', 'public.pode_no_jornal(text)', 'execute')
      and not has_function_privilege('anon', 'public.jornal_noticia_visivel(uuid)', 'execute'),
  'anon nao chama as funcoes do jornal');

select * from finish();
rollback;
