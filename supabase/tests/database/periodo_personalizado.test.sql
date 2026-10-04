-- O PERÍODO PERSONALIZADO NAS FUNÇÕES QUE SÓ SABIAM O ANO OU O MÊS
-- (migrations 20261201010000, 20261201020000 e 20261201030000; pedido do dono, 2026-10-03)
--
-- Cada função ganhou `p_de`/`p_ate`. Duas regras, decididas pelo dono, e é cada uma delas
-- que esta suíte prova — sempre com uma linha DENTRO e uma FORA do recorte:
--
--   * o que tem data de verdade (lançamento, conta, folha não) usa os DIAS EXATOS;
--   * o que é mensal por natureza (meta, cashback, folha, informado do diretor, a âncora de
--     "clientes a trabalhar") usa os MESES INTEIROS que o intervalo toca — 10/03–25/04 é
--     março e abril inteiros, nunca rateio.
--
-- E sem `p_de`/`p_ate` tudo continua como antes: algumas asserções comparam as duas
-- chamadas lado a lado, para o "como antes" não ser só suposição.
--
-- O intervalo de quase tudo é 10/03/2031 a 25/04/2031. As datas ficam longe de hoje para a
-- suíte não depender do dia em que o CI roda (lição 10).
begin;
\ir _helpers.psql

select plan(16);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-periodo', 'Periodo Personalizado', false) as a;

-- Um dono (passa em Comercial e em Diretoria) e uma vendedora na carteira NORTE.
create temporary table u on commit drop as
select tests.create_user('dono@periodo.test', (select a from f)) as dono,
       tests.create_user('ana@periodo.test',  (select a from f)) as ana;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_module((select ana from u), (select a from f), 'comercial');
grant select on f, u to authenticated;

insert into public.com_carteira_membros (tenant_id, user_id, carteira)
values ((select a from f), (select ana from u), 'NORTE');

-- A meta da Diretoria para a carteira: março 1.000, abril 2.000, maio 4.000.
insert into public.com_metas (tenant_id, ano, mes, carteira, valor)
values ((select a from f), 2031, 3, 'NORTE', 1000),
       ((select a from f), 2031, 4, 'NORTE', 2000),
       ((select a from f), 2031, 5, 'NORTE', 4000);

-- O realizado que o diretor informa, mês a mês.
insert into public.metas_ano (tenant_id, ano, mes, total_realizado)
values ((select a from f), 2031, 3, 10000),
       ((select a from f), 2031, 4, 20000),
       ((select a from f), 2031, 5, 40000);

-- ── As vendas importadas (o dono importa, como a tela) ──────────────────────────────────
--   CB1 (ATACADISTA, faixa 5.000 → 2%): 6.000 em 05/03 e 6.000 em 15/05.
--   X (sem tabela): comprou em janeiro e fevereiro, e parou.
--   Y (sem tabela): comprou em 12/03 e em 12/05.
select tests.authenticate_as('dono@periodo.test');

insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values
  ('CB1', 'Cliente Cashback', 'ATACADISTA', true),
  ('X',   'Cliente X', null, true),
  ('Y',   'Cliente Y', null, true);

-- O 3º argumento é quantas linhas o arquivo tinha: tem de bater com itens + descartes (a conferência).
select public.com_importar_vendas('MF', 'fixture-periodo.xlsx', 6, '{}'::jsonb,
  $items$[
    {"emissao":"2031-03-05","documento":"P01","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB1","cliente_nome":"Cliente Cashback","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":6000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-05-15","documento":"P02","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB1","cliente_nome":"Cliente Cashback","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":6000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-01-10","documento":"P03","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"X","cliente_nome":"Cliente X","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":100.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-02-10","documento":"P04","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"X","cliente_nome":"Cliente X","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":100.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-12","documento":"P05","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"Y","cliente_nome":"Cliente Y","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":100.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-05-12","documento":"P06","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"Y","cliente_nome":"Cliente Y","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":100.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

select tests.clear_authentication();

-- ── Os lançamentos da Ana (data de verdade: dias exatos) ────────────────────────────────
--   05/03 R$ 100 (fora: antes do dia 10)   15/03 R$ 200 (dentro)
--   25/04 R$ 400 (dentro: o último dia)    26/04 R$ 800 (fora: depois do dia 25)
-- "Campanhas" (ação do farol) marcada em 15/03 (dentro) e em 26/04 (fora).
insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, ativo, origem)
values ((select a from f), 'CN', 'CLIENTE NORTE', 'NORTE', true, 'cadastro');

create temporary table lanc on commit drop as
with novos as (
  insert into public.com_interacoes (tenant_id, vendedor_id, cliente_codigo, data, status, valor_venda)
  select (select a from f), (select ana from u), 'CN', v.data, 'concluido', v.valor
    from (values ('2031-03-05'::date, 100), ('2031-03-15', 200), ('2031-04-25', 400), ('2031-04-26', 800))
         as v(data, valor)
  returning id, data
)
select id, data from novos;

insert into public.com_interacao_marcas (tenant_id, interacao_id, indicador_id)
select (select a from f), l.id,
       (select id from public.com_indicadores where nome = 'Campanhas' and tenant_id = (select a from f))
  from lanc l
 where l.data in ('2031-03-15', '2031-04-26');

-- ── Financeiro e RH (para a Diretoria) ──────────────────────────────────────────────────
-- A pagar: 05/03 R$ 50 (fora), 15/03 R$ 70 (dentro), 26/04 R$ 30 (fora).
insert into public.fin_entries (tenant_id, kind, description, amount, due_date, competence, status)
values ((select a from f), 'payable', 'P-FORA-ANTES',  50, '2031-03-05', '2031-03-01', 'pending'),
       ((select a from f), 'payable', 'P-DENTRO',      70, '2031-03-15', '2031-03-01', 'pending'),
       ((select a from f), 'payable', 'P-FORA-DEPOIS', 30, '2031-04-26', '2031-04-01', 'pending');

-- Folha: março 5.000 e maio 9.999. A folha é mensal: no intervalo entra março INTEIRO.
with e as (
  insert into public.rh_employee_profiles (tenant_id, full_name, status, admission_date)
  values ((select a from f), 'FULANA PERIODO', 'ativo', '2020-01-06')
  returning id
)
insert into public.rh_payroll_entries (tenant_id, employee_id, reference_month, gross_salary)
select (select a from f), e.id, m.mes, m.valor
  from e, (values ('2031-03-01'::date, 5000), ('2031-05-01', 9999)) as m(mes, valor);

select tests.authenticate_as('dono@periodo.test');

-- ═══ 1 e 2. Clientes a trabalhar: a âncora é o último mês com venda DOS MESES do intervalo ═══
-- No ano, a âncora é maio: X comprou só em fevereiro entre fev–abr, e não entra.
select is(
  (select count(*)::int from public.com_clientes_a_trabalhar(2031)),
  0,
  'clientes a trabalhar no ano: a ancora e maio, e ninguem comprou em dois dos tres meses antes'
);
-- Com 10/03–20/03 a âncora é março (mês inteiro): X comprou em janeiro e fevereiro e parou.
select is(
  (select array_agg(cliente_codigo) from public.com_clientes_a_trabalhar(2031, null, '2031-03-10', '2031-03-20')),
  array['X'],
  'clientes a trabalhar no intervalo: a ancora vira marco, e X (comprou jan e fev, parou) aparece'
);

-- ═══ 3 a 6. Cashback: meses inteiros ═══
-- A venda de 05/03 está FORA dos dias (10/03–25/04) e DENTRO de março: entra. A de maio, não.
select is(
  (select row(comprado, cashback) from public.com_cashback_resumo(2031, null, 'CB1', '2031-03-10', '2031-04-25')),
  row(6000.00::numeric, 120.00::numeric),
  'cashback no intervalo: marco inteiro entra (venda de 05/03), maio fica fora'
);
select is(
  (select array_agg(competencia) from public.com_cashback_mensal(2031, null, 'CB1', '2031-03-10', '2031-04-25')),
  array['2031-03-01'::date],
  'a apuracao mensal no intervalo devolve so os meses que ele toca'
);
select is(
  array[(select cashback_total from public.com_cashback_indicadores(2031)),
        (select cashback_total from public.com_cashback_indicadores(2031, null, '2031-03-10', '2031-04-25'))],
  array[240.00, 120.00]::numeric[],
  'indicadores do cashback: o ano soma marco e maio (240); o intervalo, so marco (120)'
);
-- O farol "sem tabela": Y comprou em março (dentro); X só em jan/fev (fora).
select is(
  (select array_agg(cliente_codigo order by cliente_codigo)
     from public.com_cashback_farol_clientes(2031, null, '2031-03-10', '2031-04-25')
    where motivo = 'sem_tabela'),
  array['Y'],
  'o farol do cashback no intervalo so ve quem comprou nos meses dele'
);

-- ═══ 7 a 10. Comercial › Indicadores: lançamento em dias exatos, meta em meses inteiros ═══
select is(
  (select array[meta, realizado] from public.com_painel_do_gestor('2031-03-01', '2031-03-10', '2031-04-25')
    where vendedor_id = (select ana from u) and metrica = 'valor_vendas'),
  array[3000, 600]::numeric[],
  'painel no intervalo: realizado so dos dias (200 + 400), meta de marco e abril inteiros (1.000 + 2.000)'
);
select is(
  (select array[meta, realizado] from public.com_painel_do_gestor('2031-03-01')
    where vendedor_id = (select ana from u) and metrica = 'valor_vendas'),
  array[1000, 300]::numeric[],
  'sem intervalo, o painel e o de antes: o mes de marco (100 + 200) contra a meta de marco'
);
select is(
  (select valor_vendido from public.com_resumo_da_carteira('2031-03-01', '2031-03-10', '2031-04-25')
    where vendedor_id = (select ana from u)),
  600::numeric,
  'o resumo da carteira no intervalo soma so os lancamentos dos dias dele'
);
select is(
  (select quantidade from public.com_farol_de_acoes('2031-03-01', '2031-03-10', '2031-04-25')
    where vendedor_id = (select ana from u) and acao = 'Campanhas'),
  1::bigint,
  'o farol de acoes no intervalo conta a marca de 15/03 e nao a de 26/04'
);

-- ═══ 11 a 13. Diretoria › Indicadores dos setores ═══
select is(
  array[(select valor from public.dir_indicadores_dos_setores('2031-03-01') where indicador = 'a_pagar'),
        (select valor from public.dir_indicadores_dos_setores('2031-03-01', '2031-03-10', '2031-04-25')
          where indicador = 'a_pagar')],
  array[120, 70]::numeric[],
  'a pagar: o mes de marco soma 50 + 70; o intervalo, so o vencimento de 15/03'
);
select is(
  (select row(valor, rotulo) from public.dir_indicadores_dos_setores('2031-03-01', '2031-03-10', '2031-04-25')
    where indicador = 'folha_bruta'),
  row(5000::numeric, 'Folha bruta dos meses do período'::text),
  'a folha e mensal: o intervalo pega marco inteiro (e nao maio), e o rotulo diz isso'
);
select throws_ok(
  $$ select * from public.dir_indicadores_dos_setores('2031-03-01', '2031-04-25', '2031-03-10') $$,
  '22023', null,
  'intervalo invertido e recusado, nunca vira um numero'
);

-- ═══ 14. A conciliação: meses inteiros do informado ═══
select is(
  array[(select informado from public.com_conciliacao(2031)),
        (select informado from public.com_conciliacao(2031, '2031-03-10', '2031-04-25')),
        (select meses_comparados from public.com_conciliacao(2031, '2031-03-10', '2031-04-25'))::numeric],
  array[70000, 30000, 2]::numeric[],
  'conciliacao: o ano soma os tres meses informados; o intervalo, marco e abril inteiros'
);

select tests.clear_authentication();

-- ═══ 15. Quem não é da Diretoria continua barrado, com intervalo ou sem ═══
select tests.authenticate_as('ana@periodo.test');
select throws_ok(
  $$ select * from public.dir_indicadores_dos_setores('2031-03-01', '2031-03-10', '2031-04-25') $$,
  '42501', null,
  'a vendedora nao le os totais dos setores tambem no intervalo'
);
select tests.clear_authentication();

-- ═══ 16. `drop` + `create` não reabriu nada para `anon` (lição 14) ═══
select is(
  (select count(*)::int
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('com_clientes_a_trabalhar', 'com_cashback_mensal', 'com_cashback_resumo',
                        'com_cashback_indicadores', 'com_cashback_farol_clientes', 'com_cashback_farol_tabelas',
                        'com_vendedoras_do_painel', 'com_resumo_da_carteira', 'com_painel_do_gestor',
                        'com_farol_de_acoes', 'dir_indicadores_dos_setores', 'com_conciliacao')
      and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'nenhuma das doze funcoes recriadas executa como anon'
);

select * from finish();
rollback;
