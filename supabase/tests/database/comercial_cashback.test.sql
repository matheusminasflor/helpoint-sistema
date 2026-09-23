-- Painel Comercial (L6c) — o cliente e o cashback. Ver
-- .scratch/plano-l6c-cliente-e-cashback.md,
-- .scratch/plano-l6c-correcoes.md (correções da auditoria) e
-- docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §12 e §13.
begin;
\ir _helpers.psql

select plan(27);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixtures — dois tenants (isolamento), um owner em cada (bypassa a
-- permissão granular via is_admin_or_higher, como as suítes irmãs já fazem),
-- mais dois usuários "member" com módulo comercial para testar
-- `cashback.configurar` de verdade (regra 12 do pgTAP: RLS de escrita não
-- se prova só com owner).
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table f on commit drop as
select tests.create_tenant('com-l6c', 'Comercial L6c', false) as tenant,
       tests.create_tenant('com-l6c-outro', 'Comercial L6c Outro Tenant', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@com-l6c.test',        (select tenant from f)) as owner,
       tests.create_user('sem-permissao@com-l6c.test', (select tenant from f)) as sem_permissao,
       tests.create_user('com-permissao@com-l6c.test', (select tenant from f)) as com_permissao,
       tests.create_user('outro-owner@com-l6c.test',   (select outro_tenant from f)) as outro_owner;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select outro_owner from u), 'owner');
select tests.grant_role((select sem_permissao from u), 'member');
select tests.grant_module((select sem_permissao from u), (select tenant from f), 'comercial');
select tests.grant_role((select com_permissao from u), 'member');
select tests.grant_module((select com_permissao from u), (select tenant from f), 'comercial');

-- Perfil que concede cashback.configurar — só para `com_permissao`.
create temporary table perfil on commit drop as
with ins as (
  insert into public.access_profiles (tenant_id, department, name, permissions)
  values ((select tenant from f), 'comercial', 'Cashback Teste L6c', '{"cashback": {"configurar": true}}'::jsonb)
  returning id
)
select id as perfil from ins;

insert into public.user_access_profiles (tenant_id, user_id, department, profile_id)
select (select tenant from f), (select com_permissao from u), 'comercial', (select perfil from perfil);

grant select on f, u, perfil to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1/2. A grade nasce junto com a empresa (achado 1, GRAVE, da auditoria da
-- L6c): antes da correção, a semente só rodava sobre tenants que já
-- existiam QUANDO a migration corria — num banco do zero (CI e produção,
-- onde o `db push` vem antes de a empresa existir) a grade nascia vazia.
-- Corrigido com um trigger `after insert on public.tenants`; a prova mora
-- aqui, criando um tenant novo DE VERDADE (fora do `f`/`u` desta suíte, para
-- não se confundir com a grade que os outros blocos gravam) e verificando
-- que ele já nasce com as 25 faixas do §12, nas três grades.
--
-- Roda ANTES de qualquer `authenticate_as` (papel do runner, sem RLS) porque
-- este tenant não tem usuário nenhum — não haveria como autenticar nele.
--
-- Mutação: tirar o trigger (`drop trigger trg_com_semear_faixas_cashback on
-- public.tenants`) faz as duas asserções abaixo acusarem — a primeira vira
-- `have: 0 want: 25`, a segunda vira `have: {} want: {11,7,7}`.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table f2 on commit drop as
select tests.create_tenant('com-l6c-grade-nova', 'Comercial L6c Grade Nova', false) as tenant;
grant select on f2 to authenticated;

select is(
  (select count(*)::int from public.com_faixas_cashback where tenant_id = (select tenant from f2)),
  25,
  'tenant novo já nasce com as 25 faixas do §12 — a grade não depende de db push nem de tela'
);
select is(
  (select array_agg(cnt order by tabela_base) from (
     select tabela_base, count(*)::int as cnt from public.com_faixas_cashback
     where tenant_id = (select tenant from f2) group by tabela_base
   ) x),
  array[11, 7, 7],
  'as três grades nascem com 11 (ATACADISTA), 7 (VIP) e 7 (VIP MAIS) degraus — a contagem do §12'
);

select tests.authenticate_as('owner@com-l6c.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- Grade ATACADISTA com dois degraus, reusada pelas asserções 1, 3, 4 e 5 —
-- exatamente a mesma grade em toda parte para provar que a apuração muda só
-- pelo comprado do mês, nunca pela grade.
--
-- O `delete` antes do insert é o outro lado do achado 1: o tenant `f` TAMBÉM
-- nasceu com as 25 faixas automáticas (mesmo trigger da prova acima) — sem
-- limpar, o degrau de R$ 60.000/5,5% da grade real colidiria em
-- valor_minimo=5000 (unique violation) e, mesmo se não colidisse, venceria
-- o de R$ 50.000/5% da fixture na asserção 4 (o maior valor_minimo <=
-- comprado sempre ganha). Ajuste é na fixture, nunca no trigger.
-- ═══════════════════════════════════════════════════════════════════════════
delete from public.com_faixas_cashback where tenant_id = (select tenant from f);

insert into public.com_faixas_cashback (tabela_base, valor_minimo, percentual) values
  ('ATACADISTA', 5000, 2),
  ('ATACADISTA', 50000, 5);

insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values
  ('CB1', 'Cliente Cashback Um', 'ATACADISTA', true),
  ('CB2', 'Cliente Cashback Dois (Revenda)', 'REVENDA', true),
  ('CB3', 'Cliente Cashback Três', 'ATACADISTA', true),
  ('CB4', 'Cliente Cashback Quatro', 'ATACADISTA', true),
  ('CB5', 'Cliente Cashback Cinco (Condição)', 'ATACADISTA CONDICAO', true),
  -- CB6: tem cadastro, mas `tabela_preco` nula — um dos dois casos de
  -- `sem_tabela` (achado 3). CB7 (mais abaixo) é o outro: nem cadastro tem.
  ('CB6', 'Cliente Cashback Seis (Tabela Nula)', null, true);

-- Um único import cobrindo CB1..CB7: a reserva de competência é por
-- (tenant, filial, mês) — cada mês só pode ser reclamado por UMA chamada de
-- `com_importar_vendas`, e CB2..CB7 caem todos em 2025-04 junto com a
-- primeira compra de CB1. CB7 não tem linha em `com_clientes` — é o
-- "cliente sem correspondência" do §8, sem cadastro nenhum.
select public.com_importar_vendas('MF', 'fixture-l6c-cb.xlsx', 8, '{}'::jsonb,
  $items$[
    {"emissao":"2025-04-10","documento":"9001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB1","cliente_nome":"Cliente Cashback Um","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":3000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-05-10","documento":"9002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB1","cliente_nome":"Cliente Cashback Um","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":3000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9003","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB2","cliente_nome":"Cliente Cashback Dois","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":10000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9004","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB3","cliente_nome":"Cliente Cashback Três","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":60000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9005","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB4","cliente_nome":"Cliente Cashback Quatro","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":3000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9006","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB5","cliente_nome":"Cliente Cashback Cinco","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":60000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9007","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB6","cliente_nome":"Cliente Cashback Seis","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":1000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9008","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB7","cliente_nome":"Cliente Cashback Sete (Sem Cadastro)","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":2000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Cashback de dois meses é a SOMA de duas apurações mensais, nunca o
-- percentual sobre o acumulado. Mutação: somar `comprado` dos dois meses
-- ANTES de escolher a faixa (3.000 + 3.000 = 6.000 ≥ 5.000, pagaria 2% de
-- 6.000 = R$ 120 — dinheiro por direito que não existe). Rodada e
-- confirmada: com a mutação aplicada na função, `have: 120.00 want: 0`.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select coalesce(sum(cashback), -1) from public.com_cashback_mensal(2025, 'MF') where cliente_codigo = 'CB1'),
  0::numeric,
  'CB1 comprou R$ 3.000 em dois meses seguidos, ambos abaixo do mínimo — a soma do cashback é ZERO, não 2% sobre R$ 6.000'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4/5. REVENDA (tem tabela, mas sem grade nenhuma) sai como sem programa,
-- com cashback e percentual NULOS — nunca zero, nunca estimado. Mutação:
-- `coalesce(cashback, 0)` na função esconderia a diferença entre as duas.
-- Rodada e confirmada: com a mutação, `have: 0 want: NULL` na asserção 4.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select cashback from public.com_cashback_mensal(2025, 'MF') where cliente_codigo = 'CB2'),
  null::numeric,
  'CB2 (REVENDA) tem cashback NULO, nunca zero'
);
select is(
  (select sem_programa from public.com_cashback_mensal(2025, 'MF') where cliente_codigo = 'CB2'),
  true,
  'CB2 (REVENDA) está marcado sem_programa'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6/7/8. "SEM TABELA" não fica mais escondido dentro de "sem programa"
-- (achado 3 da auditoria — §8: cliente sem correspondência é anomalia a
-- apontar, não um estado normal). CB2 tem tabela (REVENDA) mas não tem
-- grade — é sem_programa, e NÃO sem_tabela. CB6 (tabela_preco nula) e CB7
-- (sem linha em com_clientes) são o oposto: sem_tabela, e NÃO sem_programa
-- — as duas flags nunca se sobrepõem. Mutação: juntar as duas de novo num
-- número só faria estas três asserções colapsarem para o mesmo valor.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select sem_tabela from public.com_cashback_mensal(2025, 'MF') where cliente_codigo = 'CB2'),
  false,
  'CB2 (REVENDA, tem tabela, só não tem grade) sai sem_tabela = false — não se confunde com sem_programa'
);
select is(
  (select sem_tabela from public.com_cashback_mensal(2025, 'MF') where cliente_codigo = 'CB6'),
  true,
  'CB6 (tabela_preco nula) sai sem_tabela = true'
);
select is(
  (select sem_tabela from public.com_cashback_mensal(2025, 'MF') where cliente_codigo = 'CB7'),
  true,
  'CB7 (sem linha em com_clientes) sai sem_tabela = true'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9/10. O indicador conta sem_tabela separado de sem_programa (achado 3): CB6
-- e CB7 somam 2 em `clientes_sem_tabela`, e só CB2 continua em
-- `clientes_sem_programa` — os dois números nunca se somam num só. Roda
-- ANTES da fixture da ficha (mais abaixo): FICHA1 também nasce sem linha em
-- `com_clientes`, e contaria como um terceiro sem_tabela se a ordem fosse
-- outra.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select clientes_sem_tabela from public.com_cashback_indicadores(2025, 'MF')),
  2::bigint,
  'o indicador conta CB6 e CB7 como sem_tabela'
);
select is(
  (select clientes_sem_programa from public.com_cashback_indicadores(2025, 'MF')),
  1::bigint,
  'e clientes_sem_programa continua contando só CB2 (REVENDA) — separado de clientes_sem_tabela'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. A faixa é a de MAIOR valor_minimo <= comprado. Mutação: `order by
-- valor_minimo` (ascendente, sem `desc`) pegaria o degrau de R$ 5.000/2% em
-- vez do de R$ 50.000/5%. Rodada e confirmada: `have: 2.00 want: 5`.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select percentual from public.com_cashback_mensal(2025, 'MF') where cliente_codigo = 'CB3'),
  5::numeric,
  'CB3 comprou R$ 60.000 — cai no degrau de R$ 50.000/5%, não no de R$ 5.000/2%'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Comprou abaixo do menor mínimo da grade → cashback ZERO, e NÃO nulo
-- (tem programa, não atingiu — o contrário da 4/5, e as duas juntas provam
-- que zero e nulo não se confundem).
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select cashback from public.com_cashback_mensal(2025, 'MF') where cliente_codigo = 'CB4'),
  0::numeric,
  'CB4 comprou abaixo do menor mínimo — cashback é ZERO (tem programa, não atingiu), não nulo'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. O sufixo CONDIÇÃO usa a grade da tabela BASE. Mutação: usar
-- `tabela_preco` (com o sufixo) em vez de `tabela_base` faria a busca da
-- grade falhar (não existe grade para "ATACADISTA CONDICAO" literal) e CB5
-- sairia como sem_programa. Rodada e confirmada: `have: NULL want: 5`.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select percentual from public.com_cashback_mensal(2025, 'MF') where cliente_codigo = 'CB5'),
  5::numeric,
  'CB5 está em "ATACADISTA CONDICAO" e recebe pela grade de "ATACADISTA" (R$ 60.000 → 5%)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixture da ficha do cliente: FICHA1 tem movimento em 2025-08, 09, 10 e 11
-- (meses ainda não reclamados pelos fixtures de CB1..CB7, acima). PSTOP:
-- comprado em 08 e 10 (2 dos 3 meses anteriores a 11) e NÃO em 11 — tem que
-- aparecer em parou_de_comprar. PONE: comprado só em 09 (1 dos 3) — não
-- pode aparecer. POK: comprado em 11 (o último mês com movimento, só para
-- ele existir).
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas('MF', 'fixture-l6c-ficha.xlsx', 4, '{}'::jsonb,
  $items$[
    {"emissao":"2025-08-05","documento":"9101","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"FICHA1","cliente_nome":"Cliente Ficha Um","produto_codigo":"PSTOP","produto_nome":"Produto Parou","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-09-05","documento":"9102","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"FICHA1","cliente_nome":"Cliente Ficha Um","produto_codigo":"PONE","produto_nome":"Produto Um Mes So","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-10-05","documento":"9103","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"FICHA1","cliente_nome":"Cliente Ficha Um","produto_codigo":"PSTOP","produto_nome":"Produto Parou","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-11-05","documento":"9104","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"FICHA1","cliente_nome":"Cliente Ficha Um","produto_codigo":"POK","produto_nome":"Produto Ok","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

create temporary table ficha1 on commit drop as
select public.com_ficha_cliente('FICHA1', '2025-01-01', '2025-12-31') as doc;
grant select on ficha1 to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. PSTOP (comprado em 2 dos 3 meses anteriores ao último mês com
-- movimento, e não no último) aparece em parou_de_comprar.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select (doc -> 'parou_de_comprar') @> '[{"produto_codigo":"PSTOP"}]'::jsonb from ficha1),
  true,
  'PSTOP (2 de 3 meses anteriores, nada no último mês) aparece em parou_de_comprar'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. PONE (comprado em só 1 dos 3 meses anteriores) NÃO aparece — é o
-- limite que distingue "parou de comprar" de "comprou uma vez". Mutação:
-- trocar `>= 2` por `>= 1` faria PONE aparecer também. Rodada e confirmada:
-- `have: true want: false`.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select (doc -> 'parou_de_comprar') @> '[{"produto_codigo":"PONE"}]'::jsonb from ficha1),
  false,
  'PONE (só 1 dos 3 meses anteriores) NÃO aparece em parou_de_comprar'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 16. A âncora é o ÚLTIMO MÊS COM MOVIMENTO DO CLIENTE, nunca `current_date`
-- (regra 10 do pgTAP) — a fixture inteira está em 2025 (o runner roda em
-- 2026) e ainda assim devolve parou_de_comprar não vazio. Mutação: trocar a
-- origem de v_ultimo_mes por `current_date` faria v_m1/v_m2/v_m3 caírem em
-- 2026, sem nenhuma venda de FICHA1 naqueles meses — parou_de_comprar
-- voltaria vazio. Rodada e confirmada: com a mutação, a asserção 14 (PSTOP)
-- dá `have: false want: true` e esta (isnt 0) dá `have: 0`.
-- ═══════════════════════════════════════════════════════════════════════════
select isnt(
  (select jsonb_array_length(doc -> 'parou_de_comprar') from ficha1),
  0,
  'fixture inteiramente em 2025 ainda devolve parou_de_comprar — a âncora é o último mês do cliente, não a data de hoje'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 17/18. `nunca_comprou` não lista o que o cliente comprou (achado 2 da
-- auditoria — asserção decorativa: o teste original só usava NUNCA1, que
-- nunca comprou NADA, então a exclusão "não listar o que o cliente comprou"
-- era um no-op ali — a mutação do auditor (deixar de excluir o comprado)
-- passava verde do mesmo jeito, porque para NUNCA1 as duas versões da
-- função dão a mesma resposta. Aqui, FICHA1 comprou PSTOP/PONE/POK — a
-- asserção 17 exige que PSTOP NÃO apareça no `nunca_comprou` DELE; a 18
-- exige que PCB (que ele nunca comprou, mas outros clientes compraram)
-- apareça, provando que a exclusão é por CLIENTE, não um balde vazio.
--
-- Mutação do auditor, rodada de novo aqui e confirmada: comentar a
-- cláusula `and i.cliente_codigo = p_codigo` das duas subconsultas `not
-- exists` de `com_ficha_cliente` (a que gera `nunca_comprou_total` e a que
-- gera `nunca_comprou`) faz a asserção 17 acusar — `have: true want: false`
-- — porque PSTOP passa a ser excluído (ou incluído) só por existir ALGUMA
-- venda no período, de QUALQUER cliente, e não mais pela compra do próprio
-- FICHA1.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select (doc -> 'nunca_comprou') @> '[{"produto_codigo":"PSTOP"}]'::jsonb from ficha1),
  false,
  'PSTOP, que FICHA1 comprou, NÃO aparece no nunca_comprou dele'
);
select is(
  (select (doc -> 'nunca_comprou') @> '[{"produto_codigo":"PCB"}]'::jsonb from ficha1),
  true,
  'PCB, que FICHA1 nunca comprou (mas outros clientes compraram), aparece no nunca_comprou dele'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 19/20/21. `com_ficha_cliente` respeita o filtro de filial (achado 4 da
-- auditoria — §1a/§11: ao filtrar por empresa, o painel inteiro recalcula,
-- fichas inclusive). FICHA1 ganha uma venda também na INBRAS: a ficha
-- filtrada em MF soma só a MF (400 = 100+100+100+100 de PSTOP/PONE/PSTOP/
-- POK), a filtrada em INBRAS soma só a INBRAS (500), e sem filtro soma as
-- duas (900) — a soma das duas bate com o total sem filtro.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas('INBRAS', 'fixture-l6c-ficha-inbras.xlsx', 1, '{}'::jsonb,
  $items$[
    {"emissao":"2025-08-05","documento":"9105","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"FICHA1","cliente_nome":"Cliente Ficha Um","produto_codigo":"PINBRAS","produto_nome":"Produto Inbras","quantidade":1,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

create temporary table ficha1_mf on commit drop as
select public.com_ficha_cliente('FICHA1', '2025-01-01', '2025-12-31', 'MF') as doc;
create temporary table ficha1_inbras on commit drop as
select public.com_ficha_cliente('FICHA1', '2025-01-01', '2025-12-31', 'INBRAS') as doc;
create temporary table ficha1_todas on commit drop as
select public.com_ficha_cliente('FICHA1', '2025-01-01', '2025-12-31', null) as doc;
grant select on ficha1_mf, ficha1_inbras, ficha1_todas to authenticated;

select is(
  (select coalesce(sum((x->>'valor')::numeric), 0) from ficha1_mf, jsonb_array_elements(doc -> 'comprou') x),
  400::numeric,
  'ficha de FICHA1 filtrada em MF soma só o que ele comprou na MF'
);
select is(
  (select coalesce(sum((x->>'valor')::numeric), 0) from ficha1_inbras, jsonb_array_elements(doc -> 'comprou') x),
  500::numeric,
  'ficha de FICHA1 filtrada em INBRAS soma só o que ele comprou na INBRAS'
);
select is(
  (select coalesce(sum((x->>'valor')::numeric), 0) from ficha1_todas, jsonb_array_elements(doc -> 'comprou') x),
  900::numeric,
  'sem filtro de filial, a ficha soma as duas — 400 (MF) + 500 (INBRAS) = 900'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 22/23. Atualizado pela Frente 5a (migration 20261025010000):
-- `com_ficha_cliente` ganhou nove blocos e `nunca_comprou` deixou de ter
-- teto GLOBAL de 100 — agora o teto é de 100 POR FAIXA (ver
-- `com_ficha_nunca_comprou`), e `nunca_comprou_total` saiu do jsonb
-- (substituído por `total_da_faixa` em cada linha). Os 105 PTETO* nunca
-- venderam para ninguém — caem todos na faixa '-' (fora da curva) — e são
-- cortados em 100; `total_da_faixa` continua mostrando os 105 de antes do
-- corte.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_clientes (codigo, razao_social, ativo) values ('NUNCA1', 'Cliente Nunca Comprou', true);
insert into public.com_produtos (codigo, nome)
select 'PTETO' || i, 'Produto Teto ' || i from generate_series(1, 105) as i;

create temporary table ficha_nunca on commit drop as
select public.com_ficha_cliente('NUNCA1', '2025-01-01', '2025-12-31') as doc;
grant select on ficha_nunca to authenticated;

select is(
  (select count(*)::int from ficha_nunca, jsonb_array_elements(doc -> 'nunca_comprou') x where x ->> 'faixa' = '-'),
  100,
  'nunca_comprou: a faixa ''-'' (os 105 PTETO*, sem venda nenhuma) é cortada em 100 — o teto agora é POR FAIXA'
);
select is(
  (select (x ->> 'total_da_faixa')::int
   from ficha_nunca, jsonb_array_elements(doc -> 'nunca_comprou') x
   where x ->> 'faixa' = '-' limit 1),
  105,
  'nunca_comprou: total_da_faixa mostra os 105 de antes do corte (substituiu nunca_comprou_total)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 24/25. Isolamento entre empresas — a outra empresa grava a própria faixa
-- e a própria venda; o tenant principal não enxerga nenhuma das duas.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro-owner@com-l6c.test');
insert into public.com_faixas_cashback (tabela_base, valor_minimo, percentual) values ('ATACADISTA', 9999, 9);
insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values ('OUTRO-CLI', 'Cliente Outro Tenant', 'ATACADISTA', true);
select public.com_importar_vendas('MF', 'fixture-l6c-outro.xlsx', 1, '{}'::jsonb,
  $items$[
    {"emissao":"2025-04-10","documento":"9201","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"OUTRO-CLI","cliente_nome":"Cliente Outro Tenant","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":10000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);
select tests.clear_authentication();
select tests.authenticate_as('owner@com-l6c.test');

select is(
  (select count(*)::int from public.com_faixas_cashback where valor_minimo = 9999),
  0,
  'o tenant principal não enxerga a faixa gravada pela outra empresa'
);
select is(
  (select count(*)::int from public.com_cashback_mensal(2025, null) where cliente_codigo = 'OUTRO-CLI'),
  0,
  'o tenant principal não enxerga a venda/cliente da outra empresa em com_cashback_mensal'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 26/27. Quem não tem cashback.configurar (e não é admin) não escreve em
-- com_faixas_cashback (42501); quem tem, escreve — com RETURNING, como o
-- PostgREST escreve (regra 11 do pgTAP).
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('sem-permissao@com-l6c.test');
select throws_like(
  $sql$ insert into public.com_faixas_cashback (tabela_base, valor_minimo, percentual) values ('TESTENEGA', 1000, 3) $sql$,
  '%row-level security%',
  'quem não tem cashback.configurar (e não é admin) não escreve em com_faixas_cashback'
);
select tests.clear_authentication();

select tests.authenticate_as('com-permissao@com-l6c.test');
-- O INSERT ... RETURNING precisa ser o statement de nível mais alto (um WITH
-- que modifica dado não pode viver dentro de uma subconsulta escalar) — por
-- isso vira uma tabela temporária, e o `is()` confere o resultado depois.
create temporary table ins_result on commit drop as
with ins as (
  insert into public.com_faixas_cashback (tabela_base, valor_minimo, percentual)
  values ('TESTEPERM', 1000, 3)
  returning id
)
select id from ins;
grant select on ins_result to authenticated;
select is(
  (select count(*)::int from ins_result),
  1,
  'quem tem cashback.configurar escreve em com_faixas_cashback — provado com RETURNING'
);

select * from finish();
rollback;
