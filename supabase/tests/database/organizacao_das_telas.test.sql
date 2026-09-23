-- Frente 3 — a organização que o dono descreveu
-- (.scratch/plano-frente3-organizacao.md). Duas provas, nenhuma tocada por
-- outra suíte:
--
-- 1. `com_painel_totais`/`com_faturamento_mensal` respondem a `p_de`/`p_ate`
--    (item 1 do plano — Vendas + Curva ABC fundem numa página só, e as duas
--    precisam do mesmo filtro de período para o topo da página não ignorar
--    o que o meio responde), sem quebrar quem ainda chama só com `p_ano`.
-- 2. A policy de SELECT de `com_vendas_itens`, `com_clientes` e
--    `com_produtos` passa a aceitar `has_diretoria_access` além de
--    `has_comercial_access` (item 3 do plano) — e o isolamento entre
--    empresas continua de pé depois de alargar quem lê.
begin;
\ir _helpers.psql

select plan(12);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixtures — dois tenants (isolamento). No tenant A: um owner (importa a
-- base), um diretor puro (só módulo `diretoria`, sem cargo owner/admin/
-- manager e sem módulo `comercial` — é o caso que a migration abre) e um
-- member sem módulo nenhum (regressão: a policy não abriu para qualquer
-- autenticado). No tenant B: um diretor puro só para provar que ganhar
-- `has_diretoria_access` não fura o isolamento entre empresas.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table f on commit drop as
select tests.create_tenant('org-telas', 'Organização das Telas', false) as tenant,
       tests.create_tenant('org-telas-outro', 'Organização das Telas Outro Tenant', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@org-telas.test',         (select tenant from f)) as owner,
       tests.create_user('diretor-puro@org-telas.test',  (select tenant from f)) as diretor_puro,
       tests.create_user('sem-nada@org-telas.test',      (select tenant from f)) as sem_nada,
       tests.create_user('diretor-outro@org-telas.test', (select outro_tenant from f)) as diretor_outro;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select diretor_puro from u), 'member');
select tests.grant_module((select diretor_puro from u), (select tenant from f), 'diretoria');
select tests.grant_role((select sem_nada from u), 'member');
select tests.grant_role((select diretor_outro from u), 'member');
select tests.grant_module((select diretor_outro from u), (select outro_tenant from f), 'diretoria');

grant select on f, u to authenticated;

select tests.authenticate_as('owner@org-telas.test');

-- Duas competências no mesmo ano (2028, ano que nenhuma outra suíte usa):
-- janeiro e julho, cada uma com um cliente e um produto diferentes. É o
-- cenário mínimo para p_de/p_ate cortar o ano em dois recortes que dão
-- números diferentes.
select public.com_importar_vendas(
  'MF', 'fixture-organizacao-das-telas.xlsx', 2, '{}'::jsonb,
  $items$[
    {"emissao":"2028-01-10","documento":"7001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"OT1","cliente_nome":"Cliente Organização Um","produto_codigo":"POT1","produto_nome":"Produto Organização Um","quantidade":1,"valor_nota":1000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2028-07-10","documento":"7002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"OT2","cliente_nome":"Cliente Organização Dois","produto_codigo":"POT2","produto_nome":"Produto Organização Dois","quantidade":1,"valor_nota":2500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1/2/3. `com_painel_totais` — sem p_de/p_ate soma o ano inteiro (3500,
-- como sempre foi); com p_de/p_ate cobrindo só janeiro soma só a nota de
-- janeiro (1000); com p_de/p_ate cobrindo o ano inteiro bate com o total do
-- ano — prova que o novo filtro não é um cálculo paralelo divergente, é o
-- mesmo dado, outro recorte.
--
-- Mutação (rodada e confirmada): trocar o `case` da função por
-- `extract(year from i.competencia) = p_ano` fixo (ignorando p_de/p_ate)
-- faz a asserção 2 falhar — `have: 3500 want: 1000`, porque o recorte de
-- janeiro passaria a somar o ano inteiro. Função restaurada à definição da
-- migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select venda from public.com_painel_totais(2028, 'MF', '1')),
  3500::numeric,
  'com_painel_totais sem p_de/p_ate continua somando o ano inteiro (compatibilidade)'
);
select is(
  (select venda from public.com_painel_totais(2028, 'MF', '1', '2028-01-01'::date, '2028-01-31'::date)),
  1000::numeric,
  'com_painel_totais com p_de/p_ate de só janeiro soma só a nota de janeiro, não o ano'
);
select is(
  (select venda from public.com_painel_totais(2028, 'MF', '1', '2028-01-01'::date, '2028-12-31'::date)),
  3500::numeric,
  'com_painel_totais com p_de/p_ate cobrindo o ano inteiro bate com o total do ano (mesmo dado, mesmo recorte)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4/5. `com_faturamento_mensal` — com p_de/p_ate de só janeiro devolve só a
-- competência de janeiro (nunca a de julho); sem p_de/p_ate continua
-- devolvendo as duas competências do ano (regressão de compatibilidade).
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select count(*) from public.com_faturamento_mensal(2028, 'MF', '1', '2028-01-01'::date, '2028-01-31'::date))::int,
  1,
  'com_faturamento_mensal com p_de/p_ate de só janeiro devolve uma única competência'
);
select is(
  (select count(*) from public.com_faturamento_mensal(2028, 'MF', '1'))::int,
  2,
  'com_faturamento_mensal sem p_de/p_ate continua devolvendo as duas competências do ano'
);

select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6/7/8. Diretor puro (só módulo `diretoria`, sem cargo alto e sem módulo
-- `comercial`) agora enxerga a base de vendas — é a consequência técnica do
-- item 3 do plano: `/diretoria` abre para módulo Diretoria OU gestor, e as
-- telas novas leem estas três tabelas.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('diretor-puro@org-telas.test');
select ok(
  (select count(*) from public.com_vendas_itens) > 0,
  'diretor só com o módulo Diretoria enxerga com_vendas_itens'
);
select ok(
  (select count(*) from public.com_clientes) > 0,
  'diretor só com o módulo Diretoria enxerga com_clientes'
);
select ok(
  (select count(*) from public.com_produtos) > 0,
  'diretor só com o módulo Diretoria enxerga com_produtos'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 9/10/11. A MAIS IMPORTANTE desta leva: alargar o SELECT para
-- has_diretoria_access não pode furar o isolamento entre empresas. Um
-- diretor puro DE OUTRO TENANT continua vendo zero linhas nas três tabelas.
--
-- Mutação (rodada e confirmada por fora desta suíte, contra o test-helpoint,
-- e revertida antes de seguir): tirar `tenant_id = (select public.get_user_
-- tenant_id())` do `using` de com_vendas_itens_select faz esta asserção
-- acusar — `have: 2155 want: 0`. Não são só as duas linhas do tenant A: sem
-- o filtro de tenant_id, diretor-outro passa a ver a base de vendas
-- INTEIRA do test-helpoint (todo tenant que já importou vendas), porque
-- `has_diretoria_access`/`has_comercial_access` sozinhos não distinguem
-- empresa nenhuma. É a prova de que o `and` entre tenant_id e o acesso ao
-- módulo é o que segura o isolamento, não o acesso ao módulo por si.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('diretor-outro@org-telas.test');
select is(
  (select count(*) from public.com_vendas_itens)::int,
  0,
  'diretor puro de outra empresa continua vendo zero linhas de com_vendas_itens'
);
select is(
  (select count(*) from public.com_clientes)::int,
  0,
  'diretor puro de outra empresa continua vendo zero linhas de com_clientes'
);
select is(
  (select count(*) from public.com_produtos)::int,
  0,
  'diretor puro de outra empresa continua vendo zero linhas de com_produtos'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Regressão: member do tenant A sem módulo nenhum (nem comercial, nem
-- diretoria) continua sem ver nada — a policy alargou para quem tem
-- Diretoria, não para qualquer autenticado do tenant.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('sem-nada@org-telas.test');
select is(
  (select count(*) from public.com_vendas_itens)::int,
  0,
  'member sem módulo comercial nem diretoria continua sem ver com_vendas_itens'
);
select tests.clear_authentication();

select * from finish();
rollback;
