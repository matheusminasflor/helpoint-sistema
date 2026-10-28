-- CONTAS FIXAS E A CONTA NO CARTÃO (migration 20270212050000; dono, 2026-10-28: "lançar um pagamento fixo, mensal ou
-- anual e a forma de pagamento").
--   1  o Operador do Financeiro cadastra (como o PostgREST, com returning)
--   2  a mensal que começou há 2 meses gera até hoje + 10 dias: 3 lançamentos
--   3  rodar o gerador de novo não duplica
--   4  dia 31 vira o último dia dos meses curtos e volta a 31 depois
--   5  a anual para o mês que vem gera só a primeira
--   6  no cartão: vence na fatura da filial, competência no mês da cobrança
--   7  cartão sem filial é recusado
--   8  quem só lê não cadastra
--   9  conta fixa encerrada não gera
--  10  o gerador não é chamável por fora
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-contas-fixas', 'Contas fixas', false) as a;
create temporary table u on commit drop as
select tests.create_user('op@contasfixas.test', (select a from f)) as op,
       tests.create_user('leit@contasfixas.test', (select a from f)) as leit;
select tests.grant_module(x, (select a from f), 'financeiro') from (select op x from u union all select leit from u) s;
select tests.grant_profile((select op from u), (select a from f), 'financeiro', 'Operador');
select tests.grant_profile((select leit from u), (select a from f), 'financeiro', 'Somente leitura');
insert into public.compras_config (tenant_id, cartao_fecha_dia, cartao_vence_dia) values ((select a from f), 10, 20)
on conflict (tenant_id) do update set cartao_fecha_dia = 10, cartao_vence_dia = 20;
create temporary table d on commit drop as select (now() at time zone 'America/Sao_Paulo')::date as hoje;
grant select on f, u, d to authenticated;

create or replace function pg_temp.lancamentos(p text) returns int language sql as
  $$ select count(*)::int from public.fin_entries e join public.fin_contas_fixas c on c.id = e.conta_fixa_id
      where c.description = p $$;

-- ═══ 1-3. A mensal ═══
select tests.authenticate_as('op@contasfixas.test');
select lives_ok($$ insert into public.fin_contas_fixas (description, amount, frequencia, primeiro_dia, payment_method)
  values ('Internet', 199.90, 'mensal', (select (hoje - interval '2 months')::date from d), 'Boleto') returning id $$,
  'o Operador do Financeiro cadastra a conta fixa');
select tests.clear_authentication();

select is(pg_temp.lancamentos('Internet'), 3, 'a mensal de 2 meses atras gera ate hoje + 10 dias: 3 lancamentos');
select public.fin_gerar_contas_fixas();
select is(pg_temp.lancamentos('Internet'), 3, 'rodar o gerador de novo nao duplica');

-- ═══ 4-5. O dia 31 e a anual ═══
insert into public.fin_contas_fixas (tenant_id, description, amount, frequencia, primeiro_dia, ate)
values ((select a from f), 'Aluguel 31', 1000, 'mensal', '2026-01-31', '2026-03-31');
select is((select string_agg(e.due_date::text, ',' order by e.due_date) from public.fin_entries e
            join public.fin_contas_fixas c on c.id = e.conta_fixa_id where c.description = 'Aluguel 31'),
  '2026-01-31,2026-02-28,2026-03-31', 'dia 31 vira o ultimo dia dos meses curtos e volta a 31 depois');

insert into public.fin_contas_fixas (tenant_id, description, amount, frequencia, primeiro_dia)
values ((select a from f), 'Licenca anual', 1200, 'anual', (select hoje + 30 from d));
select is(pg_temp.lancamentos('Licenca anual'), 1, 'a anual para o mes que vem gera so a primeira');

-- ═══ 6-7. O cartão ═══
insert into public.fin_contas_fixas (tenant_id, description, amount, frequencia, primeiro_dia, ate, payment_method, filial)
values ((select a from f), 'Software', 89.90, 'mensal', '2026-03-15', '2026-03-15', 'Cartão de crédito', 'INBRAS');
select is((select e.due_date || '|' || e.competence || '|' || e.data_no_cartao from public.fin_entries e
            join public.fin_contas_fixas c on c.id = e.conta_fixa_id where c.description = 'Software'),
  public.vencimento_da_fatura((select a from f), '2026-03-15', 1, 'INBRAS') || '|2026-03-01|2026-03-15',
  'no cartao: vence na fatura da filial, competencia no mes da cobranca');

select tests.authenticate_as('op@contasfixas.test');
select throws_ok($$ insert into public.fin_contas_fixas (description, amount, frequencia, primeiro_dia, payment_method)
  values ('Sem filial', 10, 'mensal', current_date, 'Cartão de crédito') returning id $$,
  '23514', null, 'cartao sem filial e recusado');
select tests.clear_authentication();

-- ═══ 8-10. As portas ═══
select tests.authenticate_as('leit@contasfixas.test');
select throws_ok($$ insert into public.fin_contas_fixas (description, amount, frequencia, primeiro_dia)
  values ('Leitura', 10, 'mensal', current_date) returning id $$, '42501', null, 'quem so le nao cadastra');
select tests.clear_authentication();

insert into public.fin_contas_fixas (tenant_id, description, amount, frequencia, primeiro_dia, encerrada_em)
values ((select a from f), 'Encerrada', 50, 'mensal', (select hoje - 60 from d), now());
select is(pg_temp.lancamentos('Encerrada'), 0, 'conta fixa encerrada nao gera');

select ok(not has_function_privilege('authenticated', 'public.fin_gerar_contas_fixas(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.fin_gerar_contas_fixas(uuid)', 'execute'),
  'o gerador nao e chamavel por fora');

select * from finish();
rollback;
