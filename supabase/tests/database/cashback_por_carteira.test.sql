-- Cashback por carteira (migration 20261209010000; pedido do dono, 2026-10-06): "os atendentes
-- devem ver apenas dados da sua carteira" e quem gere "filtra por carteira".
--
--   1-3   o dono (gere carteiras) vê todos os clientes, e filtra por uma carteira;
--   4-8   a vendedora da NORTE vê só a NORTE em mensal, resumo, indicadores e farol — e mandar
--         a carteira SUL no filtro não abre nada;
--   9     a Diretoria vê tudo;
--   10-11 anon não chama, e a assinatura antiga (sem p_carteira) não sobrou.
--
-- Mutação que este teste pega: tirar a condição `a.ve_tudo or ... = any (a.minhas)` de
-- `com_cashback_mensal` faz 4-8 acusarem (a Ana passa a ver CS, CT e CX).
begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-cashback-carteira', 'Cashback por carteira', false) as a;

create temporary table u on commit drop as
select tests.create_user('dono@cb-carteira.test',    (select a from f)) as dono,
       tests.create_user('ana@cb-carteira.test',     (select a from f)) as ana,
       tests.create_user('diretor@cb-carteira.test', (select a from f)) as diretor;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_module((select ana from u), (select a from f), 'comercial');
select tests.grant_role((select diretor from u), 'member');
select tests.grant_module((select diretor from u), (select a from f), 'diretoria');
grant select on f, u to authenticated;

-- A Ana é da carteira NORTE.
insert into public.com_carteira_membros (tenant_id, user_id, carteira)
values ((select a from f), (select ana from u), 'NORTE');

-- Uma faixa só, para todo cliente ATACADISTA: a partir de R$ 1.000, 2%.
delete from public.com_faixas_cashback where tenant_id = (select a from f);
insert into public.com_faixas_cashback (tenant_id, tabela_base, valor_minimo, percentual)
values ((select a from f), 'ATACADISTA', 1000, 2);

-- CN na NORTE, CS na SUL, CT na SUL sem tabela (farol "sem_tabela"), CX sem carteira.
insert into public.com_clientes (tenant_id, codigo, razao_social, tabela_preco, carteira, ativo, origem) values
  ((select a from f), 'CN', 'CLIENTE NORTE', 'ATACADISTA', 'NORTE', true, 'cadastro'),
  ((select a from f), 'CS', 'CLIENTE SUL',   'ATACADISTA', 'SUL',   true, 'cadastro'),
  ((select a from f), 'CT', 'CLIENTE SUL SEM TABELA', null, 'SUL',  true, 'cadastro'),
  ((select a from f), 'CX', 'CLIENTE SEM CARTEIRA', 'ATACADISTA', null, true, 'cadastro');

-- As vendas, importadas pelo dono como a tela faz: um mês só (março de 2031).
select tests.authenticate_as('dono@cb-carteira.test');
select public.com_importar_vendas('MF', 'fixture-cb-carteira.xlsx', 4, '{}'::jsonb,
  $items$[
    {"emissao":"2031-03-10","documento":"C01","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CN","cliente_nome":"CLIENTE NORTE","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":2000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-10","documento":"C02","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CS","cliente_nome":"CLIENTE SUL","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":3000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-10","documento":"C03","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CT","cliente_nome":"CLIENTE SUL SEM TABELA","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-10","documento":"C04","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CX","cliente_nome":"CLIENTE SEM CARTEIRA","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":4000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

-- ═══ 1-3. Quem gere carteiras vê todos e filtra por uma ═══
select is(
  (select array_agg(distinct cliente_codigo order by cliente_codigo) from public.com_cashback_mensal(2031, null)),
  array['CN', 'CS', 'CT', 'CX'],
  'o dono ve o cashback de todos os clientes, com e sem carteira'
);
select is(
  (select array_agg(distinct cliente_codigo order by cliente_codigo) from public.com_cashback_mensal(2031, null, p_carteira => 'sul')),
  array['CS', 'CT'],
  'o dono filtra pela carteira SUL (o nome e comparado normalizado: "sul" = "SUL")'
);
select is(
  (select comprado_total from public.com_cashback_indicadores(2031, null, p_carteira => 'SUL')),
  3500::numeric,
  'os indicadores do topo seguem o filtro de carteira (CS 3.000 + CT 500)'
);
select tests.clear_authentication();

-- ═══ 4-8. A vendedora vê só a própria carteira ═══
select tests.authenticate_as('ana@cb-carteira.test');
select is(
  (select array_agg(distinct cliente_codigo order by cliente_codigo) from public.com_cashback_mensal(2031, null)),
  array['CN'],
  'a Ana (carteira NORTE) ve so o cashback dos clientes da NORTE'
);
select is(
  (select count(*)::int from public.com_cashback_mensal(2031, null, p_carteira => 'SUL')),
  0,
  'mandar a carteira SUL no filtro nao abre a SUL para quem nao gere carteiras'
);
select is(
  (select array_agg(cliente_codigo order by cliente_codigo) from public.com_cashback_resumo(2031, null)),
  array['CN'],
  'o resumo por cliente (a lista e a ficha) tambem so traz a NORTE'
);
select is(
  (select comprado_total from public.com_cashback_indicadores(2031, null)),
  2000::numeric,
  'os indicadores do topo da Ana somam so a carteira dela'
);
select is(
  (select count(*)::int from public.com_cashback_farol_clientes(2031, null) where cliente_codigo in ('CT', 'CX', 'CS')),
  0,
  'o farol de clientes da Ana nao mostra cliente de outra carteira (CT, sem tabela, e da SUL)'
);
select tests.clear_authentication();

-- ═══ 9. A Diretoria vê tudo ═══
select tests.authenticate_as('diretor@cb-carteira.test');
select is(
  (select count(distinct cliente_codigo)::int from public.com_cashback_mensal(2031, null)),
  4,
  'quem tem a Diretoria ve o cashback de todos os clientes'
);
select tests.clear_authentication();

-- ═══ 10-11. As portas (lição 14) ═══
select ok(not has_function_privilege('anon', 'public.com_cashback_mensal(int,text,text,date,date,text)', 'execute'),
  'anon nao chama com_cashback_mensal');
select ok(to_regprocedure('public.com_cashback_mensal(int,text,text,date,date)') is null,
  'a assinatura antiga, sem p_carteira, nao sobrou aberta');

select * from finish();
rollback;
