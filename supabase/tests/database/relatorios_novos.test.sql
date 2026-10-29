-- RELATÓRIOS NOVOS (migration 20270202010000; proposta "Helpoint no dia a dia", etapa 5).
begin;
\ir _helpers.psql

select plan(12);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-relat', 'Relat', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@relat.test', (select a from f)) as ana,
       tests.create_user('chefe@relat.test', (select a from f)) as chefe,
       tests.create_user('comp@relat.test', (select a from f)) as comp,
       tests.create_user('fin@relat.test', (select a from f)) as fin,
       tests.create_user('rh@relat.test', (select a from f)) as rh,
       tests.create_user('zeca@relat.test', (select a from f)) as zeca;
select tests.grant_module((select ana from u), (select a from f), 'comercial');
select tests.grant_module((select chefe from u), (select a from f), 'comercial');
select tests.grant_profile((select chefe from u), (select a from f), 'comercial', 'Gestor');
select tests.grant_module((select zeca from u), (select a from f), 'comercial');
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'compras', 'Só indicadores', '{"reports": {"view": true}}'::jsonb from f
union all select a, 'financeiro', 'Só indicadores', '{"reports": {"view": true}, "cashflow": {"view": true}}'::jsonb from f
union all select a, 'rh', 'Só férias', '{"vacations": {"view": true}}'::jsonb from f;
select tests.grant_module((select comp from u), (select a from f), 'compras');
select tests.grant_profile((select comp from u), (select a from f), 'compras', 'Só indicadores');
select tests.grant_module((select fin from u), (select a from f), 'financeiro');
select tests.grant_profile((select fin from u), (select a from f), 'financeiro', 'Só indicadores');
select tests.grant_module((select rh from u), (select a from f), 'rh');
select tests.grant_profile((select rh from u), (select a from f), 'rh', 'Só férias');
create temporary table hoje on commit drop as select (now() at time zone 'America/Sao_Paulo')::date as d;
grant select on f, u, hoje to authenticated;

-- ═══ Ciclo da compra ═══
select tests.authenticate_as('ana@relat.test');
select public.compras_abrir_pedido('{"title":"Compra: Cadeira","description":"x"}'::jsonb,
  '{"few_quotes_reason":"pgtap: fornecedor unico","product_name":"Cadeira","department":"comercial"}'::jsonb, '[{"supplier":"Loja A","valor_unitario":"500","link":"https://a"}]'::jsonb);
select throws_ok($$ select * from public.rel_ciclo_da_compra((select d - 1 from hoje), (select d from hoje)) $$, '42501', null,
  'sem os indicadores de Compras, o ciclo da compra não abre');
select tests.clear_authentication();
select tests.authenticate_as('comp@relat.test');
select is((select etapa from public.rel_ciclo_da_compra((select d - 1 from hoje), (select d from hoje)) where produto = 'Cadeira'),
  'Esperando aprovação', 'a compra nova aparece esperando a aprovação');
select tests.clear_authentication();

-- ═══ Gasto por fornecedor e previsão de caixa ═══
insert into public.fin_entries (tenant_id, kind, description, amount, due_date, competence, status, counterparty, cost_center, category)
select a, 'payable'::public.fin_entry_kind, 'Luz', 300, (select d - 10 from hoje), date_trunc('month', (select d from hoje))::date, 'pending'::public.fin_entry_status, 'Cemig', 'ti', 'Utilidades' from f
union all select a, 'payable', 'Internet', 200, (select d from hoje), date_trunc('month', (select d from hoje))::date, 'pending', 'Vivo', 'ti', 'Utilidades' from f
union all select a, 'payable', 'Cancelada', 999, (select d from hoje), date_trunc('month', (select d from hoje))::date, 'cancelled', 'Vivo', 'ti', 'Utilidades' from f
union all select a, 'receivable', 'Cliente', 1000, (select d from hoje), date_trunc('month', (select d from hoje))::date, 'pending', 'Salão X', null, null from f;
select tests.authenticate_as('fin@relat.test');
select is((select sum(valor) from public.rel_gasto_por_fornecedor(date_trunc('month', (select d from hoje))::date, (select d from hoje))),
  500::numeric, 'o gasto soma as contas a pagar do período, sem as canceladas');
select is((select valor from public.rel_gasto_por_fornecedor(date_trunc('month', (select d from hoje))::date, (select d from hoje)) where fornecedor = 'Vivo'),
  200::numeric, 'e separa por fornecedor');
select is((select sai_vencido from public.rel_previsao_de_caixa(4) limit 1), 300::numeric, 'o vencido entra na primeira semana');
select is((select sai from public.rel_previsao_de_caixa(4) limit 1), 200::numeric, 'e o que vence nesta semana também');
select lives_ok($$ select public.fin_informar_saldo(1500) $$, 'o Financeiro informa o saldo de hoje');
select is((select valor from public.fin_saldo_informado), 1500::numeric, 'e ele fica guardado');
select tests.clear_authentication();
select tests.authenticate_as('zeca@relat.test');
select throws_ok($$ select * from public.rel_previsao_de_caixa(4) $$, '42501', null, 'quem não é do Financeiro não vê a previsão');
select tests.clear_authentication();

-- ═══ Calendário de ausências: o RH vê o tipo; o gestor vê "Ausente"; o colega não vê ═══
insert into public.rh_employee_profiles (tenant_id, full_name, status, user_id) select a, 'Ana', 'ativo', (select ana from u) from f;
insert into public.rh_absences (tenant_id, employee_id, date, kind, justified, days)
select a, (select id from public.rh_employee_profiles where user_id = (select ana from u)), (select d from hoje), 'falta', true, 1 from f;
select tests.authenticate_as('rh@relat.test');
select is((select tipo from public.ausencias_no_periodo((select d from hoje), (select d from hoje))), 'Falta justificada', 'o RH vê o tipo');
select tests.clear_authentication();
select tests.authenticate_as('chefe@relat.test');
select is((select tipo from public.ausencias_no_periodo((select d from hoje), (select d from hoje))), 'Ausente', 'o gestor vê só "Ausente"');
select tests.clear_authentication();
select tests.authenticate_as('zeca@relat.test');
select is((select count(*)::int from public.ausencias_no_periodo((select d from hoje), (select d from hoje))), 0, 'o colega não vê');
select tests.clear_authentication();

select * from finish();
rollback;
