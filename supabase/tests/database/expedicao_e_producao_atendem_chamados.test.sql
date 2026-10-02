-- Expedição e Produção viram setores de atendimento (migration 20261122010000).
--
-- O dono (2026-10-02): abrir chamado para Expedição e Produção; os dois só atendimento, com
-- indicadores como os outros; estoque e separação saem. Perfis Gestor/Operador/Somente leitura e
-- categorias de partida, como os outros setores.
--
--   exp    Expedição, perfil Operador
--   prod   Produção, perfil Operador
--   ti     TI, perfil Operador — não pode nada nos dois setores novos
--   sol    solicitante sem módulo
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-exp-prod', 'Expedicao e Producao') as a;
create temporary table u on commit drop as
select tests.create_user('exp@expprod.test',  (select a from f)) as exp,
       tests.create_user('prod@expprod.test', (select a from f)) as prod,
       tests.create_user('ti@expprod.test',   (select a from f)) as ti,
       tests.create_user('sol@expprod.test',  (select a from f)) as sol;
select tests.grant_module((select exp from u), (select a from f), 'expedicao');
select tests.grant_profile((select exp from u), (select a from f), 'expedicao', 'Operador');
select tests.grant_module((select prod from u), (select a from f), 'producao');
select tests.grant_profile((select prod from u), (select a from f), 'producao', 'Operador');
select tests.grant_module((select ti from u), (select a from f), 'ti');
select tests.grant_profile((select ti from u), (select a from f), 'ti', 'Operador');
grant select on f, u to authenticated;

-- ═══ 1-3. Empresa nova nasce com perfis e categorias dos dois setores. ═══
select is(
  (select array_agg(department || ':' || name order by department, name) from public.access_profiles
    where tenant_id = (select a from f) and department in ('expedicao', 'producao')),
  array['expedicao:Gestor', 'expedicao:Operador', 'expedicao:Somente leitura',
        'producao:Gestor', 'producao:Operador', 'producao:Somente leitura'],
  'os dois setores nascem com Gestor, Operador e Somente leitura');
select is(
  (select array_agg(name order by sort_order) from public.ti_categories
    where tenant_id = (select a from f) and module = 'expedicao' and parent_id is null),
  array['Envio de pedido', 'Rastreio e entrega', 'Avaria ou troca', 'Outros'],
  'categorias de partida da Expedicao');
select is(
  (select array_agg(name order by sort_order) from public.ti_categories
    where tenant_id = (select a from f) and module = 'producao' and parent_id is null),
  array['Ordem de produção', 'Matéria-prima', 'Problema no lote', 'Manutenção de equipamento', 'Outros'],
  'categorias de partida da Producao');

-- ═══ 4-5. Qualquer um abre chamado para os dois (como o PostgREST: com returning). ═══
select tests.authenticate_as('sol@expprod.test');
select lives_ok($$
  insert into public.tickets (tenant_id, module, title, description, priority, status, created_by, requester_id)
  select a, 'expedicao', 'Pedido nao saiu', 'x', 'medium', 'open', (select sol from u), (select sol from u) from f
  returning id $$, 'o solicitante abre chamado para a Expedicao');
select lives_ok($$
  insert into public.tickets (tenant_id, module, title, description, priority, status, created_by, requester_id)
  select a, 'producao', 'Lote com defeito', 'x', 'medium', 'open', (select sol from u), (select sol from u) from f
  returning id $$, 'e para a Producao');
select tests.clear_authentication();

-- ═══ 6-7. A fila de cada setor é de quem tem o setor — e só dele. ═══
select tests.authenticate_as('prod@expprod.test');
select is((select array_agg(module order by module) from public.tickets), array['producao'],
  'quem e da Producao ve a fila da Producao, nao a da Expedicao');
select tests.clear_authentication();
select tests.authenticate_as('ti@expprod.test');
select is((select count(*)::int from public.tickets where module in ('expedicao', 'producao')), 0,
  'a TI nao ve as filas dos dois setores');
select tests.clear_authentication();

-- ═══ 8. O perfil do PRÓPRIO setor decide (antes, módulo desconhecido caía no perfil da TI). ═══
select tests.authenticate_as('ti@expprod.test');
select is(public.pode_no_chamado('expedicao', 'close'), false,
  'o perfil da TI nao encerra chamado da Expedicao');
select tests.clear_authentication();

-- ═══ 9. O aviso de chamado novo vai à equipe do setor. ═══
select is(
  (select array_agg(distinct au.email::text) from public.notifications n join auth.users au on au.id = n.user_id
    join public.tickets t on t.id = n.reference_id
   where t.module = 'expedicao' and n.type = 'ticket_created'),
  array['exp@expprod.test'], 'chamado novo da Expedicao avisa a equipe da Expedicao');

-- ═══ 10. O estoque e a separação saíram. ═══
select ok(to_regclass('public.exp_lots') is null and to_regclass('public.exp_shipments') is null
          and to_regprocedure('public.exp_scan(uuid, text, numeric)') is null,
  'as tabelas e funcoes de estoque e separacao nao existem mais');

select * from finish();
rollback;
