-- DIRETRIZES COMERCIAIS (migration 20261203010000; decisão do dono, 2026-10-04)
--
-- O exemplo do dono: "comprou no mês 36 OX 6 volumes → R$ 100 de cashback na próxima compra".
--
--   Clientes: C1, C2, C3 na tabela SALAO; C4 na REVENDA.
--   Produtos: OX6A e OX6B são da família "OX 6 vol" (sugerida pelo nome); TOM é coloração.
--   Março/2031:  C1 20 OX6A (R$ 200, dia 05) + 16 OX6B (R$ 80, dia 25) + 5 TOM (R$ 50)
--                C2 30 OX6A (R$ 300)   C3 10 OX6A (R$ 100)   C4 40 OX6A (R$ 400)
--   Abril/2031:  C2 40 OX6A (R$ 400)
--
--   R1: família OX 6 vol ≥ 36 → R$ 100, todas as tabelas
--   R2: família OX 6 vol ≥ 36 → 5% do que comprou da família, só SALAO
--   R3: produto OX6A ≥ 30 → bonificação de 2 TOM
--
--   gestor: altera a aba "Equipe e carteiras" (é quem `com_pode_gerir_carteiras` reconhece)
--   vendedora: só o módulo Comercial
begin;
\ir _helpers.psql

select plan(20);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-diretrizes', 'Diretrizes Comerciais', false) as a;
create temporary table u on commit drop as
select tests.create_user('dono@diretrizes.test', (select a from f)) as dono,
       tests.create_user('gestor@diretrizes.test', (select a from f)) as gestor,
       tests.create_user('vendedora@diretrizes.test', (select a from f)) as vendedora;
select tests.grant_role((select dono from u), 'owner');
select tests.grant_module((select gestor from u), (select a from f), 'comercial');
select tests.grant_module((select vendedora from u), (select a from f), 'comercial');

insert into public.access_profiles (tenant_id, department, name, is_default, permissions)
values ((select a from f), 'comercial', 'Gestor (diretrizes)', false, '{"config_equipe": {"view": true, "edit": true}}'::jsonb);
select tests.grant_profile((select gestor from u), (select a from f), 'comercial', 'Gestor (diretrizes)');

insert into public.com_clientes (tenant_id, codigo, razao_social, tabela_preco, ativo, origem)
values ((select a from f), 'C1', 'CLIENTE UM', 'SALAO', true, 'cadastro'),
       ((select a from f), 'C2', 'CLIENTE DOIS', 'SALAO', true, 'cadastro'),
       ((select a from f), 'C3', 'CLIENTE TRES', 'SALAO', true, 'cadastro'),
       ((select a from f), 'C4', 'CLIENTE QUATRO', 'REVENDA', true, 'cadastro');
grant select on f, u to authenticated;

-- ── A venda importada (o dono importa, como a tela). 3º argumento = quantas linhas. ─────────
select tests.authenticate_as('dono@diretrizes.test');
select public.com_importar_vendas('MF', 'fixture-diretrizes.xlsx', 7, '{}'::jsonb,
  $items$[
    {"emissao":"2031-03-05","documento":"D01","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"CLIENTE UM","produto_codigo":"OX6A","produto_nome":"AGUA OXIGENADA MINAS COLOR 6 VOLUMES 900 ML","quantidade":20,"valor_nota":200.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-25","documento":"D02","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"CLIENTE UM","produto_codigo":"OX6B","produto_nome":"AGUA OXIGENADA MINAS COLOR 6 VOLUMES 90 ML","quantidade":16,"valor_nota":80.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-25","documento":"D03","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"CLIENTE UM","produto_codigo":"TOM","produto_nome":"6.0 LOURO ESCURO","quantidade":5,"valor_nota":50.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-12","documento":"D04","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C2","cliente_nome":"CLIENTE DOIS","produto_codigo":"OX6A","produto_nome":"AGUA OXIGENADA MINAS COLOR 6 VOLUMES 900 ML","quantidade":30,"valor_nota":300.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-12","documento":"D05","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C3","cliente_nome":"CLIENTE TRES","produto_codigo":"OX6A","produto_nome":"AGUA OXIGENADA MINAS COLOR 6 VOLUMES 900 ML","quantidade":10,"valor_nota":100.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-03-12","documento":"D06","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C4","cliente_nome":"CLIENTE QUATRO","produto_codigo":"OX6A","produto_nome":"AGUA OXIGENADA MINAS COLOR 6 VOLUMES 900 ML","quantidade":40,"valor_nota":400.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-04-05","documento":"D07","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C2","cliente_nome":"CLIENTE DOIS","produto_codigo":"OX6A","produto_nome":"AGUA OXIGENADA MINAS COLOR 6 VOLUMES 900 ML","quantidade":40,"valor_nota":400.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

-- ═══ 1. Quem altera a aba (o dono) cria as diretrizes — com RETURNING, como o PostgREST (lição 11) ═══
select lives_ok(
  format($$
    insert into public.com_diretrizes
      (nome, familia_id, produto_codigo, quantidade_minima, tabelas, beneficio_tipo, beneficio_valor,
       bonificacao_produto_codigo, bonificacao_quantidade, vigencia_inicio)
    values ('R1', %1$L, null, 36, null, 'cashback_valor', 100, null, null, '2031-01-01'),
           ('R2', %1$L, null, 36, array['SALAO'], 'cashback_percentual', 5, null, null, '2031-01-01'),
           ('R3', null, 'OX6A', 30, null, 'bonificacao', null, 'TOM', 2, '2031-01-01')
    returning id $$,
    (select id from public.com_familias where tenant_id = (select a from f) and nome = 'OX 6 vol')),
  'quem altera a aba cria diretriz por familia (com e sem restricao de tabela) e por produto'
);

-- ═══ 2. O exemplo do dono, com o período no meio do mês: vale o mês inteiro ═══
-- C1 comprou 20 + 16 de OX 6 vol em dias FORA de 10–20/03 e atinge; C2 (30/36 = 83%) está perto.
select is(
  (select array_agg(format('%s|%s|%s|%s', cliente_codigo, quantidade::int,
                           case when atingiu then 'atingiu' when perto then 'perto' else '?' end,
                           coalesce(valor_beneficio::numeric(14, 2)::text, '-'))
                    order by cliente_codigo)
     from public.com_diretrizes_apuracao('2031-03-10', '2031-03-20') where diretriz = 'R1'),
  array['C1|36|atingiu|100.00', 'C2|30|perto|-', 'C4|40|atingiu|100.00'],
  '36 OX 6 vol no mes (dois produtos da familia) atinge R$ 100; 30 esta perto; o mes e inteiro'
);

-- ═══ 3. Quem comprou pouco não aparece ═══
select is(
  (select count(*)::int from public.com_diretrizes_apuracao('2031-03-01', '2031-03-31') where cliente_codigo = 'C3'),
  0,
  'C3 comprou 10 de 36 (28%): nem atingiu nem esta perto, nao aparece'
);

-- ═══ 4. Percentual sobre o que comprou da família no mês, e a restrição de tabela ═══
-- C1: 5% de R$ 280 (o TOM não é da família) = R$ 14. C4 é REVENDA: fora de R2.
select is(
  (select array_agg(format('%s|%s|%s', cliente_codigo,
                           case when atingiu then 'atingiu' when perto then 'perto' else '?' end,
                           coalesce(valor_beneficio::numeric(14, 2)::text, '-'))
                    order by cliente_codigo)
     from public.com_diretrizes_apuracao('2031-03-01', '2031-03-31') where diretriz = 'R2'),
  array['C1|atingiu|14.00', 'C2|perto|-'],
  'o percentual e sobre o valor da familia no mes; a tabela REVENDA fica fora da diretriz so de SALAO'
);

-- ═══ 5. Diretriz por produto conta só aquele produto ═══
-- C1 tem 36 da família, mas só 20 do OX6A (67%): fora. Bonificação não tem valor em R$.
select is(
  (select array_agg(format('%s|%s|%s|%s %s|%s', cliente_codigo, quantidade::int,
                           case when atingiu then 'atingiu' when perto then 'perto' else '?' end,
                           bonificacao_quantidade::int, bonificacao_produto_codigo,
                           coalesce(valor_beneficio::text, '-'))
                    order by cliente_codigo)
     from public.com_diretrizes_apuracao('2031-03-01', '2031-03-31') where diretriz = 'R3'),
  array['C2|30|atingiu|2 TOM|-', 'C4|40|atingiu|2 TOM|-'],
  'a diretriz por produto conta so o OX6A; bonificacao devolve produto e quantidade, sem valor'
);

-- ═══ 6 e 7. Os meses que o período toca, e só eles ═══
select is(
  (select count(*)::int from public.com_diretrizes_apuracao('2031-03-10', '2031-03-20') where competencia <> '2031-03-01'),
  0,
  'periodo dentro de marco nao traz abril'
);
select is(
  (select array_agg(format('%s|%s|%s', competencia, cliente_codigo, quantidade::int) order by cliente_codigo)
     from public.com_diretrizes_apuracao('2031-04-01', '2031-04-30') where diretriz = 'R1'),
  array['2031-04-01|C2|40'],
  'em abril, C2 atinge com a compra de abril'
);
select tests.clear_authentication();

-- ═══ 8 e 9. O gestor marca concedido — e o banco grava o que ELE apurou ═══
-- A tela não manda valor; mesmo que mande (999, 1 unidade, outra pessoa, dia 15), vale a apuração.
select tests.authenticate_as('gestor@diretrizes.test');
select lives_ok(
  format($$
    insert into public.com_diretrizes_concessoes
      (diretriz_id, cliente_codigo, competencia, quantidade_atingida, valor_beneficio, concedido_por, pedido)
    values (%L, 'C1', '2031-03-15', 1, 999, %L, 'PED-1')
    returning id $$,
    (select id from public.com_diretrizes where tenant_id = (select a from f) and nome = 'R1'),
    (select vendedora from u)),
  'o gestor marca concedido'
);
select is(
  (select format('%s|%s|%s|%s|%s', quantidade_atingida::int, valor_beneficio::numeric(14, 2), competencia,
                 case when concedido_por = (select gestor from u) then 'gestor' else 'outro' end, pedido)
     from public.com_diretrizes_concessoes where cliente_codigo = 'C1'),
  '36|100.00|2031-03-01|gestor|PED-1',
  'a concessao grava a quantidade e o valor apurados, o mes (dia 1) e quem marcou de verdade'
);

-- ═══ 10. Nunca duas vezes ═══
select throws_ok(
  format($$
    insert into public.com_diretrizes_concessoes (diretriz_id, cliente_codigo, competencia, pedido)
    values (%L, 'C1', '2031-03-01', 'PED-2') returning id $$,
    (select id from public.com_diretrizes where tenant_id = (select a from f) and nome = 'R1')),
  '23505', null,
  'a mesma diretriz, o mesmo cliente e o mesmo mes nao se concedem duas vezes'
);

-- ═══ 11. Quem não atingiu não se concede ═══
select throws_ok(
  format($$
    insert into public.com_diretrizes_concessoes (diretriz_id, cliente_codigo, competencia)
    values (%L, 'C3', '2031-03-01') returning id $$,
    (select id from public.com_diretrizes where tenant_id = (select a from f) and nome = 'R1')),
  '22023', null,
  'cliente que nao atingiu a diretriz no mes nao recebe concessao'
);
select tests.clear_authentication();

-- ═══ 12 a 14. A vendedora vê, mas não marca, não desfaz e não cria diretriz ═══
select tests.authenticate_as('vendedora@diretrizes.test');
select throws_ok(
  format($$
    insert into public.com_diretrizes_concessoes (diretriz_id, cliente_codigo, competencia)
    values (%L, 'C4', '2031-03-01') returning id $$,
    (select id from public.com_diretrizes where tenant_id = (select a from f) and nome = 'R1')),
  '42501', null,
  'a vendedora nao marca concedido, mesmo de cliente que atingiu'
);
-- DELETE barrado por policy não dá erro: afeta zero linha (lição 12). Conta-se depois.
delete from public.com_diretrizes_concessoes where cliente_codigo = 'C1';
select throws_ok(
  $$ insert into public.com_diretrizes (nome, produto_codigo, quantidade_minima, beneficio_tipo, beneficio_valor)
     values ('Da vendedora', 'OX6A', 1, 'cashback_valor', 1) returning id $$,
  '42501', null,
  'a vendedora nao cria diretriz'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.com_diretrizes_concessoes where tenant_id = (select a from f)),
  1,
  'o DELETE da vendedora foi filtrado: a concessao continua la'
);

-- ═══ 15. Depois de concedido, a apuração diz quem, e com qual pedido ═══
select tests.authenticate_as('dono@diretrizes.test');
select is(
  (select array[concedido::text, pedido, valor_beneficio::numeric(14, 2)::text, (concedido_por = (select gestor from u))::text]
     from public.com_diretrizes_apuracao('2031-03-01', '2031-03-31', 'C1') where diretriz = 'R1'),
  array['true', 'PED-1', '100.00', 'true'],
  'a apuracao mostra a concessao: concedido, pedido, valor e quem marcou'
);

-- ═══ 16 e 17. A diretriz é coerente ═══
select throws_ok(
  format($$ insert into public.com_diretrizes (nome, familia_id, produto_codigo, quantidade_minima, beneficio_tipo, beneficio_valor)
            values ('Os dois', %L, 'OX6A', 10, 'cashback_valor', 10) returning id $$,
         (select id from public.com_familias where tenant_id = (select a from f) and nome = 'OX 6 vol')),
  '23514', null,
  'familia E produto ao mesmo tempo nao passa'
);
select throws_ok(
  $$ insert into public.com_diretrizes (nome, produto_codigo, quantidade_minima, beneficio_tipo, beneficio_valor, bonificacao_produto_codigo)
     values ('Mista', 'OX6A', 10, 'cashback_percentual', 150, 'TOM') returning id $$,
  '23514', null,
  'percentual acima de 100 e cashback com produto de bonificacao nao passam'
);
select tests.clear_authentication();

-- ═══ 18 e 19. O gestor desfaz ═══
select tests.authenticate_as('gestor@diretrizes.test');
select lives_ok(
  $$ delete from public.com_diretrizes_concessoes where cliente_codigo = 'C1' returning id $$,
  'o gestor desfaz a concessao'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.com_diretrizes_concessoes where tenant_id = (select a from f)),
  0,
  'desfeita, a concessao sumiu (e o cliente volta para "a conceder")'
);

-- ═══ 20. Nada novo executa como anon (lição 14) ═══
select is(
  (select count(*)::int
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('com_diretrizes_apuracao', 'com_diretrizes_concessoes_confere', 'abas_de_configuracao')
      and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'nenhuma funcao nova das diretrizes executa como anon'
);

select * from finish();
rollback;
