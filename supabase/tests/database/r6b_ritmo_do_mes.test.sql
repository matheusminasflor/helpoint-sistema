-- Rodada 2, R6b (migration 20270209020000): os dias úteis da projeção do mês.
--
-- O que justifica a suíte: a projeção do Comercial divide o realizado pelos dias úteis que já passaram ATÉ O ÚLTIMO
-- DADO (decisão do dono, 2026-10-26). Se o dia útil contasse fim de semana ou feriado, ou se contasse até hoje com a
-- importação atrasada, a projeção sairia errada sem nenhum número de venda ter mudado.
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as select tests.create_tenant('pgtap-r6b', 'R6b', false) as a;
create temporary table u on commit drop as
select tests.create_user('gestora@r6b.test', (select a from f)) as gestora,
       tests.create_user('outra@r6b.test', (select a from f))   as outra;
select tests.grant_module((select gestora from u), (select a from f), 'comercial');
grant select on f, u to authenticated;

-- Setembro de 2026: 22 dias de segunda a sexta; 7/9 é feriado nacional; 15/9, feriado da empresa → 20 dias úteis.
insert into public.feriados_da_empresa (tenant_id, data, nome) select a, date '2026-09-15', 'Aniversário da empresa' from f;
-- A última nota importada do mês é de 10/9: até ela passaram 1, 2, 3, 4, 8, 9 e 10 (o 7 é feriado) → 7.
with imp as (insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
             select a, 'vendas', 'pgtap-r6b.xlsx', 1 from f returning id)
insert into public.com_vendas_itens (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
                                     cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select (select a from f), imp.id, 'MF', date '2026-09-10', '1', '1', '5101', 'venda', 'C1', 'P1', 'Shampoo', 1, 100 from imp;

select tests.authenticate_as('gestora@r6b.test');
select is((select dias_uteis_mes from public.com_ritmo_do_mes(date '2026-09-01', date '2026-09-20')), 20,
  'o mes tem 20 dias uteis: sem sabado, domingo, o 7 de setembro e o feriado da empresa');
select is((select dias_uteis_ate from public.com_ritmo_do_mes(date '2026-09-01', date '2026-09-20')), 7,
  'e ate o ultimo dado (a nota de 10/9) passaram 7 — nao conta ate hoje');
select is((select ultimo_dado from public.com_ritmo_do_mes(date '2026-09-01', date '2026-09-20')), date '2026-09-10', 'o ultimo dado e a nota de 10/9');
select is((select dias_uteis_ate from public.com_ritmo_do_mes(date '2026-09-01', date '2026-10-05')), 20,
  'mes que ja acabou esta fechado: todos os dias uteis contam (a projecao e o proprio realizado)');
select tests.clear_authentication();

select tests.authenticate_as('outra@r6b.test');
select is((select count(*)::int from public.com_ritmo_do_mes(date '2026-09-01', date '2026-09-20')), 0, 'quem nao e do Comercial nem da Diretoria nao recebe nada');
select tests.clear_authentication();

select * from finish();
rollback;
