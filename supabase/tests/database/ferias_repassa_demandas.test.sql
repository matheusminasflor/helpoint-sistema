-- Ausências repassam as demandas (migrations 20261127020000 e 20261128010000; decisões do dono,
-- 2026-10-03).
--
--   mel    Marketing — responsável por "Arte (pgTAP)", com um chamado aberto; entra de férias hoje
--   gi     Marketing — a substituta
--   chefe  Marketing, Operador COM a caixinha "repassar ausências" — quem decide o repasse
--   velho  Marketing, perfil "Gestor" com a caixinha DESMARCADA — não é avisado (o nome não conta mais)
--   rh     RH, Gestor — registra as férias já aprovadas
--   ana    pede chamados; não decide nada
begin;
\ir _helpers.psql

select plan(18);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-ferias-rep', 'Ferias Repasse', false) as a;
create temporary table u on commit drop as
select tests.create_user('mel@ferias.test',   (select a from f)) as mel,
       tests.create_user('gi@ferias.test',    (select a from f)) as gi,
       tests.create_user('chefe@ferias.test', (select a from f)) as chefe,
       tests.create_user('rh@ferias.test',    (select a from f)) as rh,
       tests.create_user('ana@ferias.test',   (select a from f)) as ana,
       tests.create_user('velho@ferias.test', (select a from f)) as velho;
select tests.grant_module(x, (select a from f), 'marketing')
  from (select mel x from u union all select gi from u union all select chefe from u union all select velho from u) s;
select tests.grant_profile((select chefe from u), (select a from f), 'marketing', 'Operador');
update public.user_access_profiles set overrides = '{"tickets":{"repassar_ausencias":true}}'::jsonb
 where user_id = (select chefe from u) and department = 'marketing';
-- O perfil "Gestor" nasce com a caixinha; no acesso do Velho ela foi desmarcada.
select tests.grant_profile((select velho from u), (select a from f), 'marketing', 'Gestor');
update public.user_access_profiles set overrides = '{"tickets":{"repassar_ausencias":false}}'::jsonb
 where user_id = (select velho from u) and department = 'marketing';
select tests.grant_module((select rh from u), (select a from f), 'rh');
select tests.grant_profile((select rh from u), (select a from f), 'rh', 'Gestor');

create temporary table cat on commit drop as
with ins as (
  insert into public.ti_categories (tenant_id, module, name) select a, 'marketing', 'Arte (pgTAP)' from f returning id
) select id from ins;
insert into public.ti_category_responsaveis (tenant_id, category_id, user_id)
select a, (select id from cat), (select mel from u) from f;
create temporary table ch on commit drop as
with ins as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, category_id, status)
  select a, 'marketing', 'Rotulo novo', 'x', (select ana from u), (select id from cat), 'open' from f returning id
) select id from ins;

create temporary table hoje on commit drop as select (now() at time zone 'America/Sao_Paulo')::date as d;
create temporary table ferias (id uuid) on commit drop;
create temporary table novo (id uuid, assigned uuid) on commit drop;
grant select on f, u, cat, ch, hoje to authenticated;
grant select, insert, delete on ferias, novo to authenticated;

-- ═══ 1-3. O RH registra as férias da Mel já aprovadas: o gestor é avisado, e não nasce chamado no RH. ═══
select tests.authenticate_as('rh@ferias.test');
select lives_ok($$
  with t as (
    insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type, status)
    select a, (select mel from u), (select d from hoje), (select d from hoje) + 9, 10, 'ferias', 'aprovada' from f
    returning id
  ) insert into ferias select id from t $$, 'o RH registra ferias ja aprovadas de outra pessoa');
select tests.clear_authentication();
select is((select count(*)::int from public.notifications where user_id = (select chefe from u) and type = 'ferias_repassar'), 1,
  'o Gestor do Marketing recebe o aviso para repassar');
select is((select ticket_id from public.rh_vacation_requests where id = (select id from ferias)), null::uuid,
  'ferias registradas pelo RH nao abrem chamado de solicitacao na fila do RH');

-- ═══ 4. O colaborador não cria as próprias férias já aprovadas. ═══
select tests.authenticate_as('ana@ferias.test');
select throws_ok($$ insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, status)
  select a, (select ana from u), (select d from hoje), (select d from hoje), 1, 'aprovada' from f returning id $$,
  '42501', null, 'pedido do colaborador nasce pendente');

-- ═══ 5. Quem não é gestor dela não vê nem repassa. ═══
select throws_ok($$ select public.ferias_demandas((select id from ferias)) $$, '42501', null,
  'quem nao e gestor da pessoa nao abre o repasse');
select tests.clear_authentication();

-- ═══ 6-8. O gestor vê as demandas e repassa tudo para a Gi. ═══
select tests.authenticate_as('chefe@ferias.test');
select is((select jsonb_array_length(public.ferias_demandas((select id from ferias)) -> 'chamados')), 1,
  'o gestor ve o chamado aberto com a Mel');
select is(
  public.ferias_repassar((select id from ferias),
    jsonb_build_array(jsonb_build_object('id', (select id from ch), 'para', (select gi from u))),
    jsonb_build_array(jsonb_build_object('id', (select id from cat), 'para', (select gi from u)))),
  '{"chamados": 1, "categorias": 1}'::jsonb, 'repassa o chamado e a categoria');
select tests.clear_authentication();
select is((select assigned_to from public.tickets where id = (select id from ch)), (select gi from u),
  'o chamado aberto agora e da Gi');

-- ═══ 9-10. Durante as férias, chamado novo da categoria vai para a substituta. ═══
select tests.authenticate_as('ana@ferias.test');
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, category_id)
  select a, 'marketing', 'Arte nova', 'x', (select ana from u), (select id from cat) from f
  returning id, assigned_to
) insert into novo select * from t;
select is((select assigned from novo), (select gi from u), 'chamado novo da categoria vai para a substituta');
select is((select array_agg(id) from public.responsaveis_da_categoria((select id from cat))), array[(select gi from u)],
  'a lista do formulario mostra a substituta, nao a Mel');
select tests.clear_authentication();

-- ═══ 11. Tirar o substituto: a Mel continua fora (está de férias), o chamado cai na fila. ═══
select tests.authenticate_as('chefe@ferias.test');
select public.ferias_repassar((select id from ferias), '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('id', (select id from cat), 'para', '')));
select is((select count(*)::int from public.responsaveis_da_categoria((select id from cat))), 0,
  'sem substituto e com a Mel de ferias, ninguem: fila do setor');
select tests.clear_authentication();

-- ═══ 12. Fim das férias: a Mel volta sozinha. ═══
update public.rh_vacation_requests set start_date = (select d from hoje) - 20, end_date = (select d from hoje) - 1
 where id = (select id from ferias);
select tests.authenticate_as('ana@ferias.test');
select is((select array_agg(id) from public.responsaveis_da_categoria((select id from cat))), array[(select mel from u)],
  'depois das ferias a categoria volta para a Mel sem ninguem desfazer');
select tests.clear_authentication();

-- ═══ 13. Véspera: a Gi sai amanhã com chamado parado — o gestor é lembrado. ═══
insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type, status)
select a, (select gi from u), (select d from hoje) + 1, (select d from hoje) + 5, 5, 'ferias', 'aprovada' from f;
select public.ferias_lembra_vespera();
select is((select count(*)::int from public.notifications
            where user_id = (select chefe from u) and type = 'ferias_repassar' and title like '%amanhã%'), 1,
  'na vespera, com chamado parado, o gestor e lembrado');

-- ═══ 15. Ausência de 1 dia não incomoda ninguém. ═══
create temporary table antes on commit drop as
select count(*)::int as n from public.notifications where user_id = (select chefe from u) and type = 'ferias_repassar';
insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, type, status)
select a, (select gi from u), (select d from hoje) + 30, (select d from hoje) + 30, 1, 'abono', 'aprovada' from f;
select is((select count(*)::int from public.notifications where user_id = (select chefe from u) and type = 'ferias_repassar'),
  (select n from antes), 'abono de 1 dia nao dispara o repasse');

-- ═══ 16. Atestado de 3 dias, validado pelo RH, dispara. ═══
insert into public.rh_medical_certificates (tenant_id, user_id, issue_date, days_off, status)
select a, (select mel from u), (select d from hoje), 3, 'recebido' from f;
update public.rh_medical_certificates set status = 'validado' where user_id = (select mel from u);
select is((select count(*)::int from public.notifications
            where user_id = (select chefe from u) and type = 'ferias_repassar' and title like '%(atestado)%'), 1,
  'atestado de 3 dias validado pelo RH avisa quem tem a caixinha');

-- ═══ 17. O colaborador não envia atestado já validado. ═══
select tests.authenticate_as('ana@ferias.test');
select throws_ok($$ insert into public.rh_medical_certificates (tenant_id, user_id, issue_date, days_off, status)
  select a, (select ana from u), (select d from hoje), 5, 'validado' from f returning id $$,
  '42501', null, 'atestado do colaborador nasce recebido');
select tests.clear_authentication();

-- ═══ 18. Perfil "Gestor" com a caixinha desmarcada não é avisado: vale a caixinha, não o nome. ═══
select is((select count(*)::int from public.notifications where user_id = (select velho from u) and type = 'ferias_repassar'), 0,
  'perfil chamado Gestor sem a caixinha nao recebe o aviso');

-- ═══ 14. Nada disso é chamável de fora (lição 14). ═══
select ok(not has_function_privilege('anon', 'public.ferias_repassar(uuid, jsonb, jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.ferias_demandas(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.ferias_avisa_gestores(uuid, boolean)', 'execute'),
  'anon nao repassa, e ninguem dispara aviso por conta propria');

select * from finish();
rollback;
