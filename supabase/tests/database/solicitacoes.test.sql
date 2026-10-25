-- SOLICITAÇÕES (migration 20270201010000; decisões do dono de 2026-10-24/25).
begin;
\ir _helpers.psql

select plan(23);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-solic', 'Solic', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@solic.test', (select a from f)) as ana,
       tests.create_user('chefe@solic.test', (select a from f)) as chefe,
       tests.create_user('mkt@solic.test', (select a from f)) as mkt,
       tests.create_user('tec@solic.test', (select a from f)) as tec,
       tests.create_user('fin@solic.test', (select a from f)) as fin,
       tests.create_user('rh@solic.test', (select a from f)) as rh,
       tests.create_user('zeca@solic.test', (select a from f)) as zeca;
-- Ana é do Comercial, e o chefe é o Gestor do Comercial. Cada setor com o seu Operador (que nasce com "Decidir").
select tests.grant_module((select ana from u), (select a from f), 'comercial');
select tests.grant_module((select chefe from u), (select a from f), 'comercial');
select tests.grant_profile((select chefe from u), (select a from f), 'comercial', 'Gestor');
select tests.grant_module((select zeca from u), (select a from f), 'comercial');
select tests.grant_module((select mkt from u), (select a from f), 'marketing');
select tests.grant_profile((select mkt from u), (select a from f), 'marketing', 'Operador');
select tests.grant_module((select tec from u), (select a from f), 'ti');
select tests.grant_profile((select tec from u), (select a from f), 'ti', 'Operador');
select tests.grant_module((select fin from u), (select a from f), 'financeiro');
select tests.grant_profile((select fin from u), (select a from f), 'financeiro', 'Operador');
select tests.grant_module((select rh from u), (select a from f), 'rh');
select tests.grant_profile((select rh from u), (select a from f), 'rh', 'Operador');

create temporary table s (tipo text, id uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert on s to authenticated;

select is((select permissions -> 'solicitacoes' from public.access_profiles
            where tenant_id = (select a from f) and department = 'marketing' and name = 'Operador'),
  '{"view": true, "decidir": true}'::jsonb, 'quem muda o status dos chamados do setor nasce decidindo as solicitações');

-- ═══ Arte: o Marketing aceita e entrega com o arquivo ═══
select tests.authenticate_as('ana@solic.test');
with x as (
  insert into public.solicitacoes (tipo, titulo, preciso_ate) values ('arte', 'Banner da feira', current_date + 7) returning id)
insert into s select 'arte', id from x;
select tests.clear_authentication();
select is((select count(*)::int from public.notifications where user_id = (select mkt from u) and reference_id = (select id from s where tipo = 'arte')), 1,
  'o Marketing é avisado do pedido de arte');
select tests.authenticate_as('zeca@solic.test');
select is((select count(*)::int from public.solicitacoes where id = (select id from s where tipo = 'arte')), 0, 'colega sem nada a ver não vê o pedido');
select throws_ok($$ select public.solicitacao_agir((select id from s where tipo = 'arte'), 'aceitar') $$, '42501', null,
  'quem não é do Marketing não aceita');
select tests.clear_authentication();
select tests.authenticate_as('mkt@solic.test');
select is(public.solicitacao_agir((select id from s where tipo = 'arte'), 'aceitar'), 'aceita', 'o Marketing aceita');
select throws_ok($$ select public.solicitacao_agir((select id from s where tipo = 'arte'), 'entregar') $$, '23514', null,
  'sem o arquivo não entrega');
insert into public.solicitacoes_anexos (solicitacao_id, nome, caminho, momento)
select id, 'banner.png', 'x/banner.png', 'entrega' from s where tipo = 'arte' returning id;
select is(public.solicitacao_agir((select id from s where tipo = 'arte'), 'entregar'), 'entregue', 'com o arquivo, entrega');
select tests.clear_authentication();

-- ═══ Acesso: o gestor pede para alguém da equipe; colega não pede para outro ═══
select tests.authenticate_as('zeca@solic.test');
select throws_ok($$ insert into public.solicitacoes (tipo, titulo, para_id) select 'acesso', 'Pasta do Comercial', ana from u $$,
  '42501', null, 'quem não é gestor não pede acesso para outra pessoa');
select tests.clear_authentication();
select tests.authenticate_as('chefe@solic.test');
with x as (
  insert into public.solicitacoes (tipo, titulo, para_id, dados)
  select 'acesso', 'Pasta do Comercial', ana, '{"tipo_acesso": "pasta"}'::jsonb from u returning id)
insert into s select 'acesso', id from x;
select tests.clear_authentication();
select tests.authenticate_as('tec@solic.test');
select throws_ok($$ select public.solicitacao_agir((select id from s where tipo = 'acesso'), 'liberar') $$, '23514', null,
  'a TI não libera antes da aprovação do gestor');
select tests.clear_authentication();
select tests.authenticate_as('chefe@solic.test');
select is(public.solicitacao_agir((select id from s where tipo = 'acesso'), 'aprovar'), 'aprovada', 'o gestor aprova');
select tests.clear_authentication();
select tests.authenticate_as('tec@solic.test');
select is(public.solicitacao_agir((select id from s where tipo = 'acesso'), 'liberar'), 'liberada', 'a TI libera');
select tests.clear_authentication();
select is((select access_type || ':' || name from public.employee_access_grants where employee_id = (select ana from u)),
  'pasta:Pasta do Comercial', 'o acesso fica registrado na pessoa (e entra no desligamento)');

-- ═══ Reembolso: comprovante, aprovação, conta a pagar, pagamento ═══
select tests.authenticate_as('ana@solic.test');
with x as (
  insert into public.solicitacoes (tipo, titulo, valor) values ('reembolso', 'Uber até o cliente', 48.5) returning id)
insert into s select 'reembolso', id from x;
select tests.clear_authentication();
select is((select count(*)::int from public.notifications where user_id = (select chefe from u) and reference_id = (select id from s where tipo = 'reembolso')), 1,
  'o gestor é avisado para aprovar');
select tests.authenticate_as('chefe@solic.test');
select throws_ok($$ select public.solicitacao_agir((select id from s where tipo = 'reembolso'), 'aprovar') $$, '23514', null,
  'sem comprovante o gestor não aprova');
select tests.clear_authentication();
select tests.authenticate_as('ana@solic.test');
insert into public.solicitacoes_anexos (solicitacao_id, nome, caminho, momento)
select id, 'recibo.pdf', 'x/recibo.pdf', 'pedido' from s where tipo = 'reembolso' returning id;
select tests.clear_authentication();
select tests.authenticate_as('chefe@solic.test');
select is(public.solicitacao_agir((select id from s where tipo = 'reembolso'), 'aprovar'), 'aprovada', 'com o comprovante, aprova');
select tests.clear_authentication();
select is((select status::text || ':' || (amount = 48.5) from public.fin_entries where solicitacao_id = (select id from s where tipo = 'reembolso')),
  'pending:true', 'nasce a conta a pagar no Financeiro, com o valor pedido');
update public.fin_entries set status = 'paid', settled_at = current_date where solicitacao_id = (select id from s where tipo = 'reembolso');
select is((select etapa from public.solicitacoes where id = (select id from s where tipo = 'reembolso')), 'paga',
  'pagar a conta paga o reembolso');

-- ═══ Adiantamento: paga, presta contas, o Financeiro confere ═══
select tests.authenticate_as('ana@solic.test');
with x as (
  insert into public.solicitacoes (tipo, titulo, valor) values ('adiantamento', 'Viagem a BH', 500) returning id)
insert into s select 'adiantamento', id from x;
select tests.clear_authentication();
select tests.authenticate_as('chefe@solic.test');
select public.solicitacao_agir((select id from s where tipo = 'adiantamento'), 'aprovar');
select tests.clear_authentication();
update public.fin_entries set status = 'paid', settled_at = current_date where solicitacao_id = (select id from s where tipo = 'adiantamento');
select tests.authenticate_as('ana@solic.test');
select throws_ok($$ select public.solicitacao_agir((select id from s where tipo = 'adiantamento'), 'prestar_contas', null, '{"gasto": 420}') $$,
  '23514', null, 'prestar contas pede os comprovantes');
insert into public.solicitacoes_anexos (solicitacao_id, nome, caminho, momento)
select id, 'notas.pdf', 'x/notas.pdf', 'prestacao' from s where tipo = 'adiantamento' returning id;
select is(public.solicitacao_agir((select id from s where tipo = 'adiantamento'), 'prestar_contas', null, '{"gasto": 420}'),
  'prestando_contas', 'com os comprovantes, presta contas');
select tests.clear_authentication();
select is((select (dados ->> 'sobra')::numeric from public.solicitacoes where id = (select id from s where tipo = 'adiantamento')), 80::numeric,
  'a sobra a devolver é calculada');
select tests.authenticate_as('fin@solic.test');
select is(public.solicitacao_agir((select id from s where tipo = 'adiantamento'), 'concluir'), 'concluida', 'o Financeiro confere e conclui');
select tests.clear_authentication();

-- ═══ Conversa confidencial com o RH: nem o gestor vê ═══
select tests.authenticate_as('ana@solic.test');
with x as (
  insert into public.solicitacoes (tipo, titulo) values ('rh_confidencial', 'Assunto pessoal') returning id)
insert into s select 'conf', id from x;
select tests.clear_authentication();
select tests.authenticate_as('chefe@solic.test');
select is((select count(*)::int from public.solicitacoes where id = (select id from s where tipo = 'conf')), 0, 'o gestor não vê a conversa confidencial');
select tests.clear_authentication();
select tests.authenticate_as('rh@solic.test');
select is((select count(*)::int from public.solicitacoes where id = (select id from s where tipo = 'conf')), 1, 'o RH que decide vê');
select tests.clear_authentication();

select * from finish();
rollback;
