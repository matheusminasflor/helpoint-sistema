-- Painel Comercial (L6c) — o cliente e o cashback. Ver
-- .scratch/plano-l6c-cliente-e-cashback.md e
-- docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §12 e §13.
begin;
\ir _helpers.psql

select plan(15);

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

select tests.authenticate_as('owner@com-l6c.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- Grade ATACADISTA com dois degraus, reusada pelas asserções 1, 3, 4 e 5 —
-- exatamente a mesma grade em toda parte para provar que a apuração muda só
-- pelo comprado do mês, nunca pela grade.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_faixas_cashback (tabela_base, valor_minimo, percentual) values
  ('ATACADISTA', 5000, 2),
  ('ATACADISTA', 50000, 5);

insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values
  ('CB1', 'Cliente Cashback Um', 'ATACADISTA', true),
  ('CB2', 'Cliente Cashback Dois (Revenda)', 'REVENDA', true),
  ('CB3', 'Cliente Cashback Três', 'ATACADISTA', true),
  ('CB4', 'Cliente Cashback Quatro', 'ATACADISTA', true),
  ('CB5', 'Cliente Cashback Cinco (Condição)', 'ATACADISTA CONDICAO', true);

-- Um único import cobrindo CB1..CB5: a reserva de competência é por
-- (tenant, filial, mês) — cada mês só pode ser reclamado por UMA chamada de
-- `com_importar_vendas`, e CB2..CB5 caem todos em 2025-04 junto com a
-- primeira compra de CB1.
select public.com_importar_vendas('MF', 'fixture-l6c-cb.xlsx', 6, '{}'::jsonb,
  $items$[
    {"emissao":"2025-04-10","documento":"9001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB1","cliente_nome":"Cliente Cashback Um","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":3000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-05-10","documento":"9002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB1","cliente_nome":"Cliente Cashback Um","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":3000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9003","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB2","cliente_nome":"Cliente Cashback Dois","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":10000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9004","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB3","cliente_nome":"Cliente Cashback Três","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":60000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9005","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB4","cliente_nome":"Cliente Cashback Quatro","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":3000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9006","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CB5","cliente_nome":"Cliente Cashback Cinco","produto_codigo":"PCB","produto_nome":"Produto Cashback","quantidade":1,"valor_nota":60000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Cashback de dois meses é a SOMA de duas apurações mensais, nunca o
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
-- 2/3. REVENDA (sem grade nenhuma) sai como sem programa, com cashback e
-- percentual NULOS — nunca zero, nunca estimado. Mutação:
-- `coalesce(cashback, 0)` na função esconderia a diferença entre as duas.
-- Rodada e confirmada: com a mutação, `have: 0 want: NULL` na asserção 2.
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
-- 4. A faixa é a de MAIOR valor_minimo <= comprado. Mutação: `order by
-- valor_minimo` (ascendente, sem `desc`) pegaria o degrau de R$ 5.000/2% em
-- vez do de R$ 50.000/5%. Rodada e confirmada: `have: 2.00 want: 5`.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select percentual from public.com_cashback_mensal(2025, 'MF') where cliente_codigo = 'CB3'),
  5::numeric,
  'CB3 comprou R$ 60.000 — cai no degrau de R$ 50.000/5%, não no de R$ 5.000/2%'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Comprou abaixo do menor mínimo da grade → cashback ZERO, e NÃO nulo
-- (tem programa, não atingiu — o contrário da 2/3, e as duas juntas provam
-- que zero e nulo não se confundem).
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select cashback from public.com_cashback_mensal(2025, 'MF') where cliente_codigo = 'CB4'),
  0::numeric,
  'CB4 comprou abaixo do menor mínimo — cashback é ZERO (tem programa, não atingiu), não nulo'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. O sufixo CONDIÇÃO usa a grade da tabela BASE. Mutação: usar
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
-- (meses ainda não reclamados pelos fixtures de CB1..CB5, acima). PSTOP:
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
-- 8. PSTOP (comprado em 2 dos 3 meses anteriores ao último mês com
-- movimento, e não no último) aparece em parou_de_comprar.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select (doc -> 'parou_de_comprar') @> '[{"produto_codigo":"PSTOP"}]'::jsonb from ficha1),
  true,
  'PSTOP (2 de 3 meses anteriores, nada no último mês) aparece em parou_de_comprar'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. PONE (comprado em só 1 dos 3 meses anteriores) NÃO aparece — é o
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
-- 10. A âncora é o ÚLTIMO MÊS COM MOVIMENTO DO CLIENTE, nunca `current_date`
-- (regra 10 do pgTAP) — a fixture inteira está em 2025 (o runner roda em
-- 2026) e ainda assim devolve parou_de_comprar não vazio. Mutação: trocar a
-- origem de v_ultimo_mes por `current_date` faria v_m1/v_m2/v_m3 caírem em
-- 2026, sem nenhuma venda de FICHA1 naqueles meses — parou_de_comprar
-- voltaria vazio. Rodada e confirmada: com a mutação, a asserção 7 (PSTOP)
-- dá `have: false want: true` e esta (isnt 0) dá `have: 0`.
-- ═══════════════════════════════════════════════════════════════════════════
select isnt(
  (select jsonb_array_length(doc -> 'parou_de_comprar') from ficha1),
  0,
  'fixture inteiramente em 2025 ainda devolve parou_de_comprar — a âncora é o último mês do cliente, não a data de hoje'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 11/12. nunca_comprou respeita o teto de 100, com nunca_comprou_total
-- maior que o mostrado. NUNCA1 não compra nenhum dos 105 produtos criados
-- aqui (nem nenhum outro produto do tenant).
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_clientes (codigo, razao_social, ativo) values ('NUNCA1', 'Cliente Nunca Comprou', true);
insert into public.com_produtos (codigo, nome)
select 'PTETO' || i, 'Produto Teto ' || i from generate_series(1, 105) as i;

create temporary table ficha_nunca on commit drop as
select public.com_ficha_cliente('NUNCA1', '2025-01-01', '2025-12-31') as doc;
grant select on ficha_nunca to authenticated;

select is(
  (select jsonb_array_length(doc -> 'nunca_comprou') from ficha_nunca),
  100,
  'nunca_comprou respeita o teto de 100 linhas'
);
select cmp_ok(
  (select (doc ->> 'nunca_comprou_total')::int from ficha_nunca),
  '>',
  100,
  'nunca_comprou_total é maior que o mostrado (o teto cortou, e a tela sabe disso)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 13/14. Isolamento entre empresas — a outra empresa grava a própria faixa
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
-- 15/16. Quem não tem cashback.configurar (e não é admin) não escreve em
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
