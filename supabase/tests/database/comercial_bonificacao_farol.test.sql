-- O farol da bonificação (migration 20261026040000). Duas funções que
-- devolvem SÓ o que pede decisão — e o que elas DEIXAM DE FORA é metade da
-- regra, por isso cada asserção de "aparece" tem a irmã de "não aparece".
--
-- Contexto: a apuração de 2026-09-25 mostrou a bonificação da INBRAS saindo
-- de 6-11% da venda para mais de 100% em alguns meses de 2026, com 10
-- clientes recebendo R$ 117.799,63 sem comprar nada. O farol é a tela que
-- faz essa pergunta sozinha.
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('com-farol-bon', 'Comercial Farol Bonificacao', false) as tenant,
       tests.create_tenant('com-farol-bon-outro', 'Comercial Farol Outro', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@com-farol-bon.test', (select tenant from f)) as owner,
       tests.create_user('outro@com-farol-bon.test', (select outro_tenant from f)) as outro;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select outro from u), 'owner');
grant select on f, u to authenticated;

select tests.authenticate_as('owner@com-farol-bon.test');

insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values
  ('FB-SAUDAVEL', 'Compra Muito Recebe Pouco', 'ATACADISTA', true),
  ('FB-SOGANHA',  'So Recebe Nunca Compra',    'REVENDA',    true),
  ('FB-DESEQ',    'Recebe Mais Do Que Compra', 'ATACADISTA', true),
  ('FB-PUBLI',    'So Recebe Publicidade',     'REVENDA',    true);

insert into public.com_produtos (codigo, nome) values
  ('FBP-MAIS', 'Sai Mais De Graca'), ('FBP-NUNCA', 'Nunca Vendido'), ('FBP-OK', 'Vende Mais Do Que Da');

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixture, desenhada caso a caso. Todos os valores são DIFERENTES entre si:
-- com valores iguais, trocar dois clientes de lugar passaria verde.
--
--   FB-SAUDAVEL  compra 1000, recebe 200 na série 75 → NÃO acende
--   FB-SOGANHA   compra    0, recebe 300 na série 75 → acende 'sem_compra'
--   FB-DESEQ     compra  100, recebe 500 na série 75 → acende 'recebe_mais'
--   FB-PUBLI     compra    0, recebe 400 na SÉRIE 1  → NÃO acende (é
--                publicidade, não bonificação — a asserção 4 é a que prende
--                essa regra, e sem ela o farol acusaria gasto de marketing
--                como produto dado de graça)
--
--   FBP-MAIS   vende 10 un, dá 30 un → acende, 3.0×
--   FBP-NUNCA  vende  0 un, dá  5 un → acende, `vezes` NULO
--   FBP-OK     vende 20 un, dá  5 un → NÃO acende
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas('MF', 'fixture-farol-bonificacao.xlsx', 7, '{}'::jsonb,
  $items$[
    {"emissao":"2026-03-10","documento":"F001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"FB-SAUDAVEL","cliente_nome":"Compra Muito","produto_codigo":"FBP-OK","produto_nome":"Vende Mais Do Que Da","quantidade":20,"valor_nota":1000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-03-11","documento":"F002","serie":"75","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"FB-SAUDAVEL","cliente_nome":"Compra Muito","produto_codigo":"FBP-OK","produto_nome":"Vende Mais Do Que Da","quantidade":5,"valor_nota":200,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-03-12","documento":"F003","serie":"75","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"FB-SOGANHA","cliente_nome":"So Recebe","produto_codigo":"FBP-MAIS","produto_nome":"Sai Mais De Graca","quantidade":15,"valor_nota":300,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-03-13","documento":"F004","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"FB-DESEQ","cliente_nome":"Desequilibrado","produto_codigo":"FBP-MAIS","produto_nome":"Sai Mais De Graca","quantidade":10,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-03-14","documento":"F005","serie":"75","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"FB-DESEQ","cliente_nome":"Desequilibrado","produto_codigo":"FBP-MAIS","produto_nome":"Sai Mais De Graca","quantidade":15,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-03-15","documento":"F006","serie":"1","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"FB-PUBLI","cliente_nome":"So Publicidade","produto_codigo":"FBP-OK","produto_nome":"Vende Mais Do Que Da","quantidade":3,"valor_nota":400,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-03-16","documento":"F007","serie":"75","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"FB-SAUDAVEL","cliente_nome":"Compra Muito","produto_codigo":"FBP-NUNCA","produto_nome":"Nunca Vendido","quantidade":5,"valor_nota":50,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1/2/3/4 — os clientes. As duas primeiras provam quem ACENDE e com que
-- motivo; as duas seguintes provam quem NÃO acende, que é onde um farol
-- barulhento demais deixa de servir.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(motivo, bonificacao, percentual)
   from public.com_bonificacao_farol_clientes('2026-01-01', '2026-12-31', 'MF')
   where cliente_codigo = 'FB-SOGANHA'),
  row('sem_compra'::text, 300::numeric, null::numeric),
  'quem recebeu e não comprou nada acende como sem_compra, e o percentual é NULO — dividir por zero não é "infinito por cento", é outra pergunta'
);
select is(
  (select row(motivo, bonificacao, comprado, percentual)
   from public.com_bonificacao_farol_clientes('2026-01-01', '2026-12-31', 'MF')
   where cliente_codigo = 'FB-DESEQ'),
  row('recebe_mais'::text, 500::numeric, 100::numeric, 500.00::numeric),
  'quem comprou 100 e recebeu 500 acende como recebe_mais, com o percentual de 500%'
);
select is(
  (select count(*) from public.com_bonificacao_farol_clientes('2026-01-01', '2026-12-31', 'MF')
   where cliente_codigo = 'FB-SAUDAVEL'),
  0::bigint,
  'quem comprou 1000 e recebeu 250 NÃO acende — o farol cala sobre quem está dentro do esperado'
);
-- A asserção que prende a regra da série. Sem ela, trocar `serie <> ''1''`
-- por nada faria FB-PUBLI acender, e o dono veria gasto de marketing
-- apontado como produto dado de graça.
select is(
  (select count(*) from public.com_bonificacao_farol_clientes('2026-01-01', '2026-12-31', 'MF')
   where cliente_codigo = 'FB-PUBLI'),
  0::bigint,
  'quem só recebeu PUBLICIDADE (série 1) não acende — o farol é de bonificação (série 75), nunca de gasto de marketing'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5/6/7 — os produtos. A comparação é por UNIDADE: FBP-MAIS teve 30 unidades
-- dadas (15 + 15) contra 10 vendidas.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(quantidade_bonificada, quantidade_vendida, vezes)
   from public.com_bonificacao_farol_produtos('2026-01-01', '2026-12-31', 'MF')
   where produto_codigo = 'FBP-MAIS'),
  row(30::numeric, 10::numeric, 3.0::numeric),
  'produto com 30 unidades dadas contra 10 vendidas acende com 3.0× — a conta é por UNIDADE, não por valor'
);
select is(
  (select row(quantidade_vendida, vezes)
   from public.com_bonificacao_farol_produtos('2026-01-01', '2026-12-31', 'MF')
   where produto_codigo = 'FBP-NUNCA'),
  row(0::numeric, null::numeric),
  'produto nunca vendido no período tem `vezes` NULO — "nunca vendido" e "vendeu pouco" são fatos diferentes, e a tela diz o primeiro com palavra'
);
select is(
  (select count(*) from public.com_bonificacao_farol_produtos('2026-01-01', '2026-12-31', 'MF')
   where produto_codigo = 'FBP-OK'),
  0::bigint,
  'produto que vende mais do que dá (20 contra 5) NÃO acende'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8/9 — isolamento entre empresas. As duas funções são `security invoker`:
-- quem separa é a RLS de `com_vendas_itens`. A outra empresa não importou
-- nada, mas a principal tem dado no MESMO período — se o filtro caísse, o
-- count abaixo sairia de zero.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro@com-farol-bon.test');

select is(
  (select count(*) from public.com_bonificacao_farol_clientes('2026-01-01', '2026-12-31', 'MF')),
  0::bigint,
  'a outra empresa não vê nenhum cliente do farol da empresa principal'
);
select is(
  (select count(*) from public.com_bonificacao_farol_produtos('2026-01-01', '2026-12-31', 'MF')),
  0::bigint,
  'a outra empresa não vê nenhum produto do farol da empresa principal'
);

select tests.clear_authentication();

select * from finish();
rollback;
