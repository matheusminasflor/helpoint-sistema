-- A VENDEDORA VÊ OS PRÓPRIOS INDICADORES, E A META DE VALOR É A DA DIRETORIA
-- (migration 20261114010000, LEVA O parte 1)
--
-- Pedido do dono: "os indicadores, cada vendedor consegue visualizar também os seus, para
-- apresentar caso necessário, não seria apenas o gestor." E, sobre meta: "a meta é definida
-- diretamente pelo diretor … dentro do módulo diretor é definida a meta de cada carteira."
--
--   1 — a vendedora recebe do painel SÓ as linhas dela, com a colega também em carteira. É o
--       que permite abrir a tela para ela sem mostrar os números da outra;
--   2 e 3 — a meta de valor vem de `com_metas` (a da Diretoria), casando o nome da carteira
--       mesmo escrito diferente ("Norte" × "NORTE"), e o % e o farol saem dela;
--   4 — não existe mais uma segunda meta de valor: `com_metas_indicador` recusa `valor_vendas`.
begin;
\ir _helpers.psql

select plan(4);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-os-seus', 'Os Seus', false) as a;

create temporary table u on commit drop as
select tests.create_user('ana@seus.test',   (select a from f)) as ana,
       tests.create_user('bia@seus.test',   (select a from f)) as bia,
       tests.create_user('chefe@seus.test', (select a from f)) as chefe;

select tests.grant_module((select ana from u),   (select a from f), 'comercial');
select tests.grant_module((select bia from u),   (select a from f), 'comercial');
select tests.grant_module((select chefe from u), (select a from f), 'comercial');
select tests.grant_role((select chefe from u), 'admin');
grant select on f, u to authenticated;

insert into public.com_carteira_membros (tenant_id, user_id, carteira)
values ((select a from f), (select ana from u), 'NORTE'),
       ((select a from f), (select bia from u), 'SUL');

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, ativo, origem)
values ((select a from f), 'N1', 'CLIENTE NORTE', 'NORTE', true, 'cadastro');

-- A meta da Diretoria, escrita com outra caixa — a tela da Diretoria não normaliza.
insert into public.com_metas (tenant_id, ano, mes, carteira, valor)
values ((select a from f), 2026, 5, 'Norte', 25000);

select tests.authenticate_as('ana@seus.test');
select public.com_salvar_interacao(null,
  '{"cliente_codigo":"N1","data":"2026-05-10","status":"concluido","valor_venda":"20000"}'::jsonb, null);

-- 1. Só a linha dela, com a Bia também numa carteira.
select is(
  (select array_agg(distinct vendedor_id) from public.com_painel_do_gestor('2026-05-01')),
  array[(select ana from u)],
  'a vendedora recebe do painel so os proprios indicadores, nunca os da colega'
);

-- 2. A meta de valor é a da Diretoria, mesmo com o nome da carteira escrito diferente.
-- Comparação por VALOR (array de numeric), não por texto: `20000.00` e `20000` são o mesmo
-- número e textos diferentes.
select is(
  (select array[meta, realizado] from public.com_painel_do_gestor('2026-05-01') where metrica = 'valor_vendas'),
  array[25000, 20000]::numeric[],
  'a meta de valor vem de com_metas, a da Diretoria, casando "Norte" com "NORTE"'
);

-- 3. E o % e o farol saem dela: 20.000 ÷ 25.000 = 80%, amarelo (≥ 70%).
select ok(
  (select realizado = 80 and cor = 'amarelo' from public.com_painel_do_gestor('2026-05-01') where metrica = 'pct_meta'),
  'o % da meta e o farol usam a meta da Diretoria: 80%, amarelo'
);
select tests.clear_authentication();

-- 4. Uma meta de valor só.
select tests.authenticate_as('chefe@seus.test');
select throws_ok($$
  insert into public.com_metas_indicador (vendedor_id, competencia, metrica, meta)
  values ((select ana from u), '2026-05-01', 'valor_vendas', 1)
  returning id
$$, '23514', null,
  'nao existe mais uma segunda meta de valor: com_metas_indicador recusa valor_vendas');
select tests.clear_authentication();

select * from finish();
rollback;
