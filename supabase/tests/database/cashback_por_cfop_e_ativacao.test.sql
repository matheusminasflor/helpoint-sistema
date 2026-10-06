-- Cashback por CFOP e ativação (migration 20261211010000; docs/regra-cashback.md, dono 2026-10-06).
--
--   1-2   a classe do CFOP segue a memória fiscal: 7949 é bonificação, 5405 é venda;
--   3     conta CFOP de venda de QUALQUER série (série 75 com 5101 conta), não conta 5910 nem 7949,
--         e a devolução abate;
--   4-5   a faixa é a da tabela do cliente (ATACADISTA 2%, VIP 5%);
--   6-9   ativação: compra para ativar = metade; o mês seguinte bateu → liberado; o mês seguinte
--         fechou abaixo → não liberado; o mês seguinte ainda não fechou no sistema → aguardando;
--   10-11 resumo e indicadores separam gerado × liberado × aguardando;
--   12    a vendedora continua vendo só a própria carteira;
--   13    anon não chama.
--
-- Datas FIXAS em 2031 (lições 9 e 10). A última nota importada é de 20/05/2031: maio não fechou.
begin;
\ir _helpers.psql

select plan(13);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-cashback-cfop', 'Cashback por CFOP', false) as a;

create temporary table u on commit drop as
select tests.create_user('dono@cb-cfop.test', (select a from f)) as dono,
       tests.create_user('ana@cb-cfop.test',  (select a from f)) as ana;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_module((select ana from u), (select a from f), 'comercial');
grant select on f, u to authenticated;

insert into public.com_carteira_membros (tenant_id, user_id, carteira)
values ((select a from f), (select ana from u), 'NORTE');

-- Faixa por tabela: ATACADISTA a partir de R$ 1.000 = 2%; VIP a partir de R$ 1.000 = 5%.
delete from public.com_faixas_cashback where tenant_id = (select a from f);
insert into public.com_faixas_cashback (tenant_id, tabela_base, valor_minimo, percentual) values
  ((select a from f), 'ATACADISTA', 1000, 2),
  ((select a from f), 'VIP',        1000, 5);

-- C1 e C2 na NORTE (a carteira da Ana); C3 na SUL.
insert into public.com_clientes (tenant_id, codigo, razao_social, tabela_preco, carteira, ativo, origem) values
  ((select a from f), 'C1', 'CLIENTE UM',   'ATACADISTA', 'NORTE', true, 'cadastro'),
  ((select a from f), 'C2', 'CLIENTE DOIS', 'VIP',        'NORTE', true, 'cadastro'),
  ((select a from f), 'C3', 'CLIENTE TRES', 'ATACADISTA', 'SUL',   true, 'cadastro');

-- As notas, importadas pelo dono como a tela faz.
--   C1 março: série 75 5101 R$ 2.000 (conta) + série 1 5910 R$ 5.000 (não) + 7949 R$ 1.000 (não)
--             − devolução 1202 R$ 500 → compra 1.500; abril R$ 800 (≥ 750 → liberado).
--   C2 março: R$ 2.000 (VIP 5% = 100); abril R$ 900 (< 1.000) — e abril já fechou no sistema.
--   C3 maio:  R$ 3.000 (2% = 60); junho ainda não existe → aguardando.
select tests.authenticate_as('dono@cb-cfop.test');
select public.com_importar_vendas('MF', 'fixture-cb-cfop.xlsx', 8, '{}'::jsonb,
  $items$[
    {"emissao":"2031-03-05","documento":"A1","serie":"75","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"CLIENTE UM","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":2000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-06","documento":"A2","serie":"1","tipo_documento":"NFe","cfop":"5910","classe":"venda","cliente_codigo":"C1","cliente_nome":"CLIENTE UM","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":5000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-07","documento":"A3","serie":"1","tipo_documento":"NFe","cfop":"7949","classe":"venda","cliente_codigo":"C1","cliente_nome":"CLIENTE UM","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":1000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-08","documento":"A4","serie":"1","tipo_documento":"NFe","cfop":"1202","classe":"devolucao","cliente_codigo":"C1","cliente_nome":"CLIENTE UM","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-04-10","documento":"A5","serie":"1","tipo_documento":"NFe","cfop":"6101","classe":"venda","cliente_codigo":"C1","cliente_nome":"CLIENTE UM","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":800,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-10","documento":"B1","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C2","cliente_nome":"CLIENTE DOIS","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":2000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-04-10","documento":"B2","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C2","cliente_nome":"CLIENTE DOIS","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":900,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-05-20","documento":"C1","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C3","cliente_nome":"CLIENTE TRES","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":3000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

create temporary table m on commit drop as
select * from public.com_cashback_mensal(2031, null);
grant select on m to authenticated;

-- ═══ 1-2. A classe do CFOP ═══
select is(public.com_classe_do_cfop('7949'), 'bonificacao', 'CFOP 7949 e bonificacao (memoria fiscal do Forteplus)');
select is(public.com_classe_do_cfop('5405'), 'venda', 'CFOP 5405 e venda (memoria fiscal do Forteplus)');

-- ═══ 3. O que conta ═══
select is((select comprado from m where cliente_codigo = 'C1' and competencia = '2031-03-01'), 1500::numeric,
  'conta a serie 75 com CFOP de venda; 5910 e 7949 nao contam; a devolucao abate (2000 - 500)');

-- ═══ 4-5. A faixa da tabela ═══
select is((select cashback from m where cliente_codigo = 'C1' and competencia = '2031-03-01'), 30::numeric,
  'ATACADISTA: 1.500 x 2% = 30 de cashback gerado');
select is((select cashback from m where cliente_codigo = 'C2' and competencia = '2031-03-01'), 100::numeric,
  'VIP: 2.000 x 5% = 100 — a faixa e a da tabela do cliente');

-- ═══ 6-9. A ativação ═══
select is((select compra_para_ativar from m where cliente_codigo = 'C1' and competencia = '2031-03-01'), 750::numeric,
  'compra para ativar = metade da compra do mes (1.500 / 2)');
select is((select situacao || ' ' || cashback_liberado from m where cliente_codigo = 'C1' and competencia = '2031-03-01'), 'liberado 30.00',
  'abril (800) bateu a metade de marco (750): o cashback de marco e liberado');
select is((select situacao || ' ' || cashback_liberado from m where cliente_codigo = 'C2' and competencia = '2031-03-01'), 'nao_liberado 0',
  'abril (900) ficou abaixo de 1.000 e abril ja fechou no sistema: nao liberado');
select is((select situacao from m where cliente_codigo = 'C3' and competencia = '2031-05-01'), 'aguardando',
  'junho ainda nao fechou no sistema (ultima nota em 20/05): aguardando');

-- ═══ 10-11. Resumo e indicadores separam gerado e liberado ═══
select is((select cashback || ' ' || cashback_liberado from public.com_cashback_resumo(2031, null) where cliente_codigo = 'C1'),
  '30.00 30.00', 'resumo do C1: 30 gerado e 30 liberado (abril nao gerou: 800 fica abaixo da faixa)');
select is((select cashback_total || ' ' || cashback_liberado_total || ' ' || cashback_aguardando_total from public.com_cashback_indicadores(2031, null)),
  '190.00 30.00 60.00', 'indicadores: 190 gerado (30 + 100 + 60), 30 liberado, 60 aguardando');
select tests.clear_authentication();

-- ═══ 12. A carteira continua valendo ═══
select tests.authenticate_as('ana@cb-cfop.test');
select is((select array_agg(distinct cliente_codigo order by cliente_codigo) from public.com_cashback_mensal(2031, null)),
  array['C1', 'C2'], 'a Ana (NORTE) continua vendo so a propria carteira');
select tests.clear_authentication();

-- ═══ 13. As portas (lição 14) ═══
select ok(not has_function_privilege('anon', 'public.com_cashback_mensal(int,text,text,date,date,text)', 'execute'),
  'anon nao chama com_cashback_mensal');

select * from finish();
rollback;
