-- Mudar a categoria do chamado (migration 20261206010000; decisões do dono, 2026-10-05).
--
--   gestor  Marketing + perfil Gestor          — tem "Mudar categoria"
--   leitor  Marketing + Somente leitura        — vê, não muda
--   mel     Marketing — a única responsável por "Arte (pgTAP)"
--   gi      Marketing — atende chamados
--   req     abriu os chamados; sem perfil
-- Toda escrita com RETURNING (lição 11); a guarda é trigger e levanta erro (lição 12).
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-muda-cat', 'Muda Categoria', false) as a;
create temporary table u on commit drop as
select tests.create_user('gestor@mudacat.test', (select a from f)) as gestor,
       tests.create_user('leitor@mudacat.test', (select a from f)) as leitor,
       tests.create_user('mel@mudacat.test',    (select a from f)) as mel,
       tests.create_user('gi@mudacat.test',     (select a from f)) as gi,
       tests.create_user('req@mudacat.test',    (select a from f)) as req;
select tests.grant_role(x, 'member') from (select gestor x from u union all select leitor from u
  union all select mel from u union all select gi from u union all select req from u) s;
select tests.grant_module(x, (select a from f), 'marketing')
  from (select gestor x from u union all select leitor from u union all select mel from u union all select gi from u) s;
select tests.grant_profile((select gestor from u), (select a from f), 'marketing', 'Gestor');
select tests.grant_profile((select leitor from u), (select a from f), 'marketing', 'Somente leitura');

create temporary table cat on commit drop as
with arte as (
  insert into public.ti_categories (tenant_id, module, name) select a, 'marketing', 'Arte (pgTAP)' from f returning id
), outros as (
  insert into public.ti_categories (tenant_id, module, name) select a, 'marketing', 'Outros (pgTAP)' from f returning id
), rede as (
  insert into public.ti_categories (tenant_id, module, name) select a, 'tickets', 'Rede (pgTAP)' from f returning id
) select (select id from arte) arte, (select id from outros) outros, (select id from rede) rede;

insert into public.ti_category_responsaveis (tenant_id, category_id, user_id)
select a, (select arte from cat), (select mel from u) from f;

-- Dois chamados abertos na categoria errada: um sem atendente, outro já com a Gi.
create temporary table c (titulo text, id uuid) on commit drop;
grant select on f, u, cat to authenticated;
grant select, insert on c to authenticated;
select tests.authenticate_as('req@mudacat.test');
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, category_id, category)
  select a, 'marketing', 'sem atendente', 'x', (select req from u), (select outros from cat), 'Outros (pgTAP)' from f
  union all
  select a, 'marketing', 'com a gi', 'x', (select req from u), (select outros from cat), 'Outros (pgTAP)' from f
  returning title, id
) insert into c select * from t;
select tests.clear_authentication();
update public.tickets set assigned_to = (select gi from u), status = 'in_progress'
 where id = (select id from c where titulo = 'com a gi');

-- ═══ 1-2. A caixinha no padrão dos perfis: quem muda status muda categoria. ═══
select is((select permissions -> 'tickets' ->> 'change_category' from public.access_profiles
            where tenant_id = (select a from f) and department = 'marketing' and name = 'Operador'),
  'true', 'o Operador (que muda status) nasce com "Mudar categoria"');
select is((select permissions -> 'tickets' ->> 'change_category' from public.access_profiles
            where tenant_id = (select a from f) and department = 'marketing' and name = 'Somente leitura'),
  'false', 'Somente leitura nasce sem "Mudar categoria"');

-- ═══ 3-4. Sem a caixinha, ninguém muda: nem quem só lê, nem quem abriu. ═══
select tests.authenticate_as('leitor@mudacat.test');
select throws_ok(
  $$update public.tickets set category_id = (select arte from cat), category = 'Arte (pgTAP)'
     where id = (select id from c where titulo = 'sem atendente') returning id$$,
  '42501', null, 'Somente leitura nao muda a categoria');
select tests.clear_authentication();

select tests.authenticate_as('req@mudacat.test');
select throws_ok(
  $$update public.tickets set category_id = (select arte from cat), category = 'Arte (pgTAP)'
     where id = (select id from c where titulo = 'sem atendente') returning id$$,
  '42501', null, 'quem abriu, sem a caixinha, nao muda a categoria');
select tests.clear_authentication();

-- ═══ 5. Só categoria do mesmo setor. ═══
select tests.authenticate_as('gestor@mudacat.test');
select throws_ok(
  $$update public.tickets set category_id = (select rede from cat), category = 'Rede (pgTAP)'
     where id = (select id from c where titulo = 'sem atendente') returning id$$,
  '23514', null, 'categoria de outro setor e recusada: isso e transferir de setor');

-- ═══ 6-7. Sem atendente, a categoria nova manda: vai para a responsável dela. ═══
select lives_ok(
  $$update public.tickets set category_id = (select arte from cat), category = 'Arte (pgTAP)'
     where id = (select id from c where titulo = 'sem atendente') returning id$$,
  'quem tem "Mudar categoria" muda');
select tests.clear_authentication();
select is((select assigned_to from public.tickets where id = (select id from c where titulo = 'sem atendente')),
  (select mel from u), 'sem atendente, o chamado vai para a responsavel da categoria nova');

-- ═══ 8. Com atendente, fica quem está. ═══
select tests.authenticate_as('gestor@mudacat.test');
update public.tickets set category_id = (select arte from cat), category = 'Arte (pgTAP)'
 where id = (select id from c where titulo = 'com a gi');
select tests.clear_authentication();
select is((select assigned_to::text || '|' || (category_id = (select arte from cat))::text
             from public.tickets where id = (select id from c where titulo = 'com a gi')),
  (select gi from u)::text || '|true', 'com atendente, a categoria muda e a Gi continua atendendo');

-- ═══ 9-10. As funções novas não abrem para quem não está logado (lição 14). ═══
select ok(not has_function_privilege('anon', 'public.chamado_muda_de_categoria()', 'execute'),
  'anon nao chama chamado_muda_de_categoria');
select ok(not has_function_privilege('anon', 'public.chamados_do_perfil_padrao(text)', 'execute'),
  'anon nao chama chamados_do_perfil_padrao');

select * from finish();
rollback;
