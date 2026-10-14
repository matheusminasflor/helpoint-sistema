-- RESOLVER O CHAMADO DE OUTRA PESSOA (migration 20261231010000; dono, 2026-10-13 — o #85 era do Yuri, quem
-- resolveu foi o dono, e contou para o Yuri).
--   1-2  "Assumir e resolver": no mesmo comando, o chamado passa para quem resolveu e o prazo NÃO recomeça
--   3-4  "Resolver junto": quem resolve entra em "atende junto" e resolve — conta para os dois
--   5    quem não pode resolver no setor não entra sozinho
--   6    a função nova não abre para anon
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-resolve-outro', 'Resolve Outro', false) as a;
create temporary table u on commit drop as
select tests.create_user('yuri@resolveoutro.test', (select a from f)) as yuri,
       tests.create_user('mb@resolveoutro.test',   (select a from f)) as mb,
       tests.create_user('ana@resolveoutro.test',  (select a from f)) as ana,
       tests.create_user('zeca@resolveoutro.test', (select a from f)) as zeca;
select tests.grant_module(x, (select a from f), 'ti') from (select yuri x from u union all select mb from u) s;
select tests.grant_profile((select yuri from u), (select a from f), 'ti', 'Operador');
-- O MB é Gestor: vê os chamados do setor ("Ver os chamados do setor"), como o dono na produção.
select tests.grant_profile((select mb from u), (select a from f), 'ti', 'Gestor');
grant select on f, u to authenticated;

create temporary table c on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status, assigned_to, sla_due_at)
  select a, 'tickets', nome, 'x', (select ana from u), (select ana from u), 'medium', 'in_progress', (select yuri from u), now() - interval '1 hour'
    from f, (values ('assume'), ('junto')) v(nome)
  returning id, title
) select * from t;
grant select on c to authenticated;

-- ═══ 1-2. Assumir e resolver. ═══
select tests.authenticate_as('mb@resolveoutro.test');
update public.tickets set status = 'resolved', resolved_at = now(), assigned_to = (select mb from u)
 where id = (select id from c where title = 'assume') returning id;
select tests.clear_authentication();
select is((select assigned_to from public.tickets where id = (select id from c where title = 'assume')), (select mb from u),
  'assumir e resolver: o chamado passa para quem resolveu');
select is((select sla_due_at from public.tickets where id = (select id from c where title = 'assume')), now() - interval '1 hour',
  'e o prazo nao recomeca: o atraso continua contando');

-- ═══ 3-4. Resolver junto. ═══
select tests.authenticate_as('mb@resolveoutro.test');
select public.entrar_para_resolver_junto((select id from c where title = 'junto'));
update public.tickets set status = 'resolved', resolved_at = now() where id = (select id from c where title = 'junto') returning id;
select tests.clear_authentication();
select is((select count(*)::int from public.ticket_participantes where ticket_id = (select id from c where title = 'junto') and user_id = (select mb from u)), 1,
  'resolver junto: quem resolveu entra em atende junto');
select is((select status::text || '|' || (assigned_to = (select yuri from u))::text from public.tickets where id = (select id from c where title = 'junto')),
  'resolved|true', 'e o chamado continua do Yuri, resolvido — conta para os dois');

-- ═══ 5. Sem perfil no setor. ═══
select tests.authenticate_as('zeca@resolveoutro.test');
select throws_ok(format($$ select public.entrar_para_resolver_junto(%L::uuid) $$, (select id from c where title = 'assume')),
  '42501', null, 'quem nao pode resolver no setor nao entra sozinho');
select tests.clear_authentication();

-- ═══ 6. Porta. ═══
select ok(not has_function_privilege('anon', 'public.entrar_para_resolver_junto(uuid)', 'execute'),
  'a funcao nova nao abre para anon');

select * from finish();
rollback;
