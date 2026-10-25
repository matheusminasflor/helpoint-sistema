-- QUATRO AÇÕES EM "CHAMADOS" (migration 20270130020000; proposta "Helpoint no dia a dia", etapa 0b).
-- Quem tem só a carona antiga (Assumir, Transferir, Configurar chamados) e não a caixinha nova não faz; quem tem só a
-- caixinha nova faz. Os perfis padrão da empresa nova já nascem com as quatro.
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-quatro', 'Quatro', false) as a;
create temporary table u on commit drop as
select tests.create_user('carona@quatro.test', (select a from f)) as carona,
       tests.create_user('caixa@quatro.test', (select a from f)) as caixa,
       tests.create_user('ana@quatro.test', (select a from f)) as ana,
       tests.create_user('tec@quatro.test', (select a from f)) as tec;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'ti', 'So a carona',
       '{"tickets": {"view_all": true, "assume": true, "transfer": true}, "config_chamados": {"view": true, "edit": true}}'::jsonb from f
union all
select a, 'ti', 'So as caixinhas',
       '{"tickets": {"abrir_em_nome": true, "atender_junto": true, "registrar_viagem": true, "automacoes": true}}'::jsonb from f;
select tests.grant_module((select carona from u), (select a from f), 'ti');
select tests.grant_profile((select carona from u), (select a from f), 'ti', 'So a carona');
select tests.grant_module((select caixa from u), (select a from f), 'ti');
select tests.grant_profile((select caixa from u), (select a from f), 'ti', 'So as caixinhas');
select tests.grant_module((select tec from u), (select a from f), 'ti');

create temporary table c on commit drop as
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status, assigned_to)
  select a, 'tickets', 'Impressora', 'x', (select ana from u), (select ana from u), 'medium', 'in_progress', (select tec from u) from f
  returning id
) select id from t;
grant select on f, u, c to authenticated;

select is((select (permissions -> 'tickets' ->> 'abrir_em_nome') || (permissions -> 'tickets' ->> 'atender_junto')
               || (permissions -> 'tickets' ->> 'registrar_viagem') || (permissions -> 'tickets' ->> 'automacoes')
             from public.access_profiles where tenant_id = (select a from f) and department = 'ti' and name = 'Gestor'),
  'truetruetruetrue', 'o Gestor padrão da empresa nova nasce com as quatro');

-- ═══ Só a carona antiga: nenhuma das quatro ═══
select tests.authenticate_as('carona@quatro.test');
select throws_ok(format($$ insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority)
                           values (%L::uuid, 'tickets', 'x', 'x', %L::uuid, %L::uuid, 'low') returning id $$,
                        (select a from f), (select ana from u), (select carona from u)),
  '42501', null, '"Assumir" sozinho não abre em nome de outro');
select is(public.pode_chamar_para_atender_junto((select id from c)), false, '"Transferir" sozinho não chama para atender junto');
select is(public.pode_registrar_viagem((select tec from u)), false, '"Transferir" sozinho não registra viagem');
select throws_ok($$ insert into public.automation_workflows (tenant_id, module, name, trigger, steps)
                    select a, 'tickets', 'x', '{"kind":"manual","entity":"ticket","next":[]}'::jsonb, '[]'::jsonb from f $$,
  '42501', null, '"Configurar chamados" sozinho não cria automação');
select tests.clear_authentication();

-- ═══ Só as caixinhas novas: as quatro ═══
select tests.authenticate_as('caixa@quatro.test');
select lives_ok(format($$ insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority)
                          values (%L::uuid, 'rh', 'Férias', 'pediu por telefone', %L::uuid, %L::uuid, 'low') returning id $$,
                       (select a from f), (select ana from u), (select caixa from u)),
  'abre em nome de outro, mesmo para outro setor');
select is(public.pode_chamar_para_atender_junto((select id from c)), true, 'chama para atender junto no chamado de outro atendente');
select is(public.pode_registrar_viagem((select tec from u)), true, 'registra a viagem de quem atende o setor');
select lives_ok($$ insert into public.automation_workflows (tenant_id, module, name, trigger, steps)
                   select a, 'tickets', 'x', '{"kind":"manual","entity":"ticket","next":[]}'::jsonb, '[]'::jsonb from f $$,
  'cria automação');
select tests.clear_authentication();

-- ═══ Quem atende o chamado chama ajuda sem caixinha ═══
select tests.authenticate_as('tec@quatro.test');
select is(public.pode_chamar_para_atender_junto((select id from c)), true, 'quem atende o chamado chama alguém para atender junto');
select tests.clear_authentication();

select * from finish();
rollback;
