-- Painel Comercial (L6a) — a base de vendas do Forteplus e a porta.
-- Ver .scratch/plano-painel-comercial.md §6/L6a para a tabela de asserções.
begin;
\ir _helpers.psql

select plan(51);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixtures — dois tenants (isolamento), cinco usuários com papéis e
-- permissões diferentes. Tudo antes de autenticar, com o papel do runner.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table f on commit drop as
select tests.create_tenant('com-l6a', 'Comercial L6a', false) as tenant,
       tests.create_tenant('com-l6a-outro', 'Comercial L6a Outro Tenant', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@com-l6a.test',          (select tenant from f)) as owner,
       tests.create_user('sem-modulo@com-l6a.test',      (select tenant from f)) as sem_modulo,
       tests.create_user('com-modulo@com-l6a.test',      (select tenant from f)) as com_modulo,
       tests.create_user('com-perfil@com-l6a.test',      (select tenant from f)) as com_perfil,
       tests.create_user('override-nega@com-l6a.test',   (select tenant from f)) as override_nega,
       tests.create_user('outro-tenant@com-l6a.test',    (select outro_tenant from f)) as outro_user,
       -- Os cinco a seguir só existem para o espelho da tabela de casos de
       -- permissão (item 2c da auditoria — src/lib/permissoes.test.ts,
       -- CASOS_PERMISSAO): o braço do admin (owner/admin passam sem perfil;
       -- gestor NÃO passa por ser gestor) e as duas divergências achadas
       -- entre a tela e o banco (override JSON null; perfil que nega uma
       -- ação e não fala de outra).
       tests.create_user('admin@com-l6a.test',            (select tenant from f)) as admin_user,
       tests.create_user('gestor@com-l6a.test',            (select tenant from f)) as gestor_user,
       tests.create_user('override-null@com-l6a.test',     (select tenant from f)) as override_null_user,
       tests.create_user('perfil-nega@com-l6a.test',       (select tenant from f)) as perfil_nega_user,
       tests.create_user('override-concede@com-l6a.test',  (select tenant from f)) as override_concede_user;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select sem_modulo from u), 'member');
select tests.grant_role((select com_modulo from u), 'member');
select tests.grant_module((select com_modulo from u), (select tenant from f), 'comercial');
select tests.grant_role((select com_perfil from u), 'member');
select tests.grant_module((select com_perfil from u), (select tenant from f), 'comercial');
select tests.grant_role((select override_nega from u), 'member');
select tests.grant_module((select override_nega from u), (select tenant from f), 'comercial');
select tests.grant_role((select outro_user from u), 'owner');
select tests.grant_role((select admin_user from u), 'admin');
select tests.grant_role((select gestor_user from u), 'manager');
select tests.grant_role((select override_null_user from u), 'member');
select tests.grant_module((select override_null_user from u), (select tenant from f), 'comercial');
select tests.grant_role((select perfil_nega_user from u), 'member');
select tests.grant_module((select perfil_nega_user from u), (select tenant from f), 'comercial');
select tests.grant_role((select override_concede_user from u), 'member');
select tests.grant_module((select override_concede_user from u), (select tenant from f), 'comercial');

-- Um perfil "Vendedor" no departamento comercial, concedendo vendas.importar.
create temporary table perfil on commit drop as
with ins as (
  insert into public.access_profiles (tenant_id, department, name, permissions)
  values ((select tenant from f), 'comercial', 'Vendedor Teste L6a', '{"vendas": {"view": true, "importar": true}}'::jsonb)
  returning id
)
select id as perfil from ins;

insert into public.user_access_profiles (tenant_id, user_id, department, profile_id)
select (select tenant from f), (select com_perfil from u), 'comercial', (select perfil from perfil);

-- Mesmo perfil, mas o override do usuário tira a permissão — é o que a §4.6
-- e o item 17 provam: override vence o perfil, nos dois sentidos.
insert into public.user_access_profiles (tenant_id, user_id, department, profile_id, overrides)
select (select tenant from f), (select override_nega from u), 'comercial', (select perfil from perfil), '{"vendas": {"importar": false}}'::jsonb;

-- Override JSON null (não ausente) não pode ser lido como "negado" — a
-- tela e o banco tinham essa divergência antes da correção 2a: o mesmo
-- perfil concede importar, o override diz null (não fala nada de novo).
insert into public.user_access_profiles (tenant_id, user_id, department, profile_id, overrides)
select (select tenant from f), (select override_null_user from u), 'comercial', (select perfil from perfil), '{"vendas": {"importar": null}}'::jsonb;

-- Um segundo perfil, que NEGA importar e CONCEDE substituir — serve para
-- três casos do espelho: "perfil nega" (importar), "perfil não fala da
-- ação" (view, que este perfil nunca menciona) e "perfil concede
-- substituir" (a ação que apaga dado), sem precisar de um perfil por caso.
create temporary table perfil_nega on commit drop as
with ins as (
  insert into public.access_profiles (tenant_id, department, name, permissions)
  values ((select tenant from f), 'comercial', 'Nega Importar Teste L6a', '{"vendas": {"importar": false, "substituir": true}}'::jsonb)
  returning id
)
select id as perfil_nega from ins;

insert into public.user_access_profiles (tenant_id, user_id, department, profile_id)
select (select tenant from f), (select perfil_nega_user from u), 'comercial', (select perfil_nega from perfil_nega);

-- Mesmo perfil que nega importar, mas o override deste usuário concede —
-- override vence o perfil também no sentido "concede por cima de nega".
insert into public.user_access_profiles (tenant_id, user_id, department, profile_id, overrides)
select (select tenant from f), (select override_concede_user from u), 'comercial', (select perfil_nega from perfil_nega), '{"vendas": {"importar": true}}'::jsonb;

-- Os blocos autenticados abaixo referenciam f/u/perfil (o cliente de teste
-- da §7 usa `tenant from f`, e o item 17 usa `override_nega from u`) — sem
-- o grant, o erro é "permission denied for table f", apontando para a linha
-- do teste, não para a causa.
grant select on f, u, perfil to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- A importação principal: agosto e setembro/2026, filial MF, como owner
-- (bypass por is_admin_or_higher). Cobre as quatro classes de CFOP, os dois
-- eixos (série 1 e 75), uma devolução com valor positivo e um CFOP
-- desconhecido — tudo o que os itens 1, 2, 3, 12, 14 e 15 precisam.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('owner@com-l6a.test');

select public.com_importar_vendas(
  'MF', 'fixture-l6a-teste.xlsx', 12,
  '{"em_branco": 3}'::jsonb,
  $items$[
    {"emissao":"2026-08-05","documento":"1001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C001","cliente_nome":"Cliente Um","produto_codigo":"P001","produto_nome":"Produto A","quantidade":10,"valor_nota":1000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-08-31","documento":"1002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C001","cliente_nome":"Cliente Um","produto_codigo":"P002","produto_nome":"Produto B","quantidade":5,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-08-10","documento":"1003","serie":"1","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"C002","cliente_nome":"Cliente Dois","produto_codigo":"P003","produto_nome":"Produto C","quantidade":2,"valor_nota":300,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-08-12","documento":"1004","serie":"75","tipo_documento":"NFe","cfop":"6910","classe":"bonificacao","cliente_codigo":"C003","cliente_nome":"Cliente Tres","produto_codigo":"P004","produto_nome":"Produto D","quantidade":3,"valor_nota":400,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-08-15","documento":"1005","serie":"75","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C003","cliente_nome":"Cliente Tres","produto_codigo":"P005","produto_nome":"Produto E","quantidade":1,"valor_nota":150,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-08-20","documento":"1006","serie":"1","tipo_documento":"NFe","cfop":"6901","classe":"industrializacao","cliente_codigo":"C004","cliente_nome":"Cliente Quatro","produto_codigo":"P006","produto_nome":"Produto F","quantidade":1,"valor_nota":45693.56,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-08-22","documento":"1007","serie":"1","tipo_documento":"NFe","cfop":"9999","classe":"outros","cliente_codigo":"C005","cliente_nome":"Cliente Cinco","produto_codigo":"P007","produto_nome":"Produto G","quantidade":1,"valor_nota":250,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-08-25","documento":"1008","serie":"1","tipo_documento":"NFe","cfop":"1202","classe":"devolucao","cliente_codigo":"C001","cliente_nome":"Cliente Um","produto_codigo":"P001","produto_nome":"Produto A","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2026-09-01","documento":"1009","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C001","cliente_nome":"Cliente Um","produto_codigo":"P001","produto_nome":"Produto A","quantidade":4,"valor_nota":400,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);

-- 1. Uma única linha de CFOP 6901 (industrialização, R$ 45.693,56) não pode
-- inflar a venda de agosto — é o achado da §3.1, a espinha do plano.
select is(
  (select sum(venda) from public.com_faturamento_mensal(2026, 'MF', null) where competencia = '2026-08-01'),
  1650::numeric,
  'CFOP 6901 (industrialização) não entra na venda de agosto'
);

-- 2. Devolução gravada com valor POSITIVO abate o líquido, não soma (§4.9:
-- o sinal é do banco, via valor_curva, não do importador).
select is(
  (select sum(liquido) from public.com_faturamento_mensal(2026, 'MF', null) where competencia = '2026-08-01'),
  1550::numeric,
  'devolução com valor positivo na origem abate o líquido (venda 1650 − devolução 100)'
);

-- 3. CFOP 9999 (fora da lista) fica fora da venda/bonificação/líquido e
-- aparece no quadro de CFOP fora da curva — nunca some, nunca vira venda.
select is(
  (select valor from public.com_cfop_fora_da_curva('2026-08-01', '2026-08-31') where cfop = '9999'),
  250::numeric,
  'CFOP 9999 aparece em com_cfop_fora_da_curva com o valor da linha'
);

-- 12. Competência é o mês da emissão, gerado — nota do último dia do mês
-- fica no mês certo, nota do primeiro dia do mês seguinte também.
select is(
  (select competencia from public.com_vendas_itens where documento = '1002'),
  '2026-08-01'::date,
  'emissão 2026-08-31 vira competência 2026-08-01'
);
select is(
  (select competencia from public.com_vendas_itens where documento = '1009'),
  '2026-09-01'::date,
  'emissão 2026-09-01 vira competência 2026-09-01 (mês seguinte, não o anterior)'
);

-- 14. Série é eixo próprio, ao lado da classe de CFOP (§3.8): a bonificação
-- da série 1 (R$ 300) e a da série 75 (R$ 400) são números DIFERENTES —
-- juntar os dois eixos foi o erro que a §3.8 corrige.
select is(
  (select bonificacao from public.com_faturamento_mensal(2026, 'MF', '1') where competencia = '2026-08-01'),
  300::numeric,
  'bonificação da série 1 em agosto'
);
select is(
  (select bonificacao from public.com_faturamento_mensal(2026, 'MF', '75') where competencia = '2026-08-01'),
  400::numeric,
  'bonificação da série 75 em agosto — diferente da série 1'
);

-- 15 (adaptado ao que a L6a entrega — a seção de condição é L6b): uma linha
-- de série 75 com CFOP de VENDA soma como venda, não como bonificação —
-- "série 75 é sempre bonificação" é falso, e não pode virar verdade fixa.
select is(
  (select venda from public.com_faturamento_mensal(2026, 'MF', '75') where competencia = '2026-08-01'),
  150::numeric,
  'CFOP de venda na série 75 conta como venda, não como bonificação'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 18–22 (item 3 da auditoria) — com_classe_do_cfop é a função que decide a
-- classe de verdade; e o ataque que a §3.1 sempre existiu para impedir —
-- um payload que MENTE a classe no CFOP de industrialização — precisa
-- continuar barrado mesmo depois que o navegador manda o campo.
-- ═══════════════════════════════════════════════════════════════════════════
select is(public.com_classe_do_cfop('5101'), 'venda', 'CFOP 5101 classifica como venda');
select is(public.com_classe_do_cfop('1202'), 'devolucao', 'CFOP 1202 classifica como devolução');
select is(public.com_classe_do_cfop('5910'), 'bonificacao', 'CFOP 5910 classifica como bonificação');
select is(public.com_classe_do_cfop('6901'), 'industrializacao', 'CFOP 6901 classifica como industrialização');
select is(public.com_classe_do_cfop('9999'), 'outros', 'CFOP fora da lista classifica como outros');

-- Um import à parte (2027, filial MF): dois clientes, cada um comprando em
-- DOIS meses, sempre o MESMO produto — é o cenário exato que a auditoria
-- descreveu para o item 1 (clientes_ativos e skus_vendidos não podem somar
-- entre grupos). O último item MENTE a classe no payload (cfop 6901,
-- classe "venda") — é o ataque do item 3.
select public.com_importar_vendas(
  'MF', 'fixture-l6a-dedup-e-mentira.xlsx', 5,
  '{}'::jsonb,
  $items$[
    {"emissao":"2027-01-05","documento":"5001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C030","cliente_nome":"Cliente Trinta","produto_codigo":"P030","produto_nome":"Produto Trinta","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2027-01-06","documento":"5002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C031","cliente_nome":"Cliente Trinta e Um","produto_codigo":"P030","produto_nome":"Produto Trinta","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2027-02-05","documento":"5003","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C030","cliente_nome":"Cliente Trinta","produto_codigo":"P030","produto_nome":"Produto Trinta","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2027-02-06","documento":"5004","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C031","cliente_nome":"Cliente Trinta e Um","produto_codigo":"P030","produto_nome":"Produto Trinta","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2027-03-10","documento":"5005","serie":"1","tipo_documento":"NFe","cfop":"6901","classe":"venda","cliente_codigo":"C032","cliente_nome":"Cliente Trinta e Dois","produto_codigo":"P032","produto_nome":"Produto Trinta e Dois","quantidade":1,"valor_nota":999.99,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);

-- 18/19 (item 1). Dois clientes, cada um em dois meses: clientes_ativos é 2,
-- NUNCA 4 (que é o que a soma de com_faturamento_mensal por mês daria) — e
-- skus_vendidos é 1 (o mesmo produto nos dois meses), nunca o dobro.
select is(
  (select clientes_ativos from public.com_painel_totais(2027, 'MF', '1')),
  2::bigint,
  'com_painel_totais: clientes_ativos é a contagem distinta do ANO, não a soma dos meses (2, não 4)'
);
select is(
  (select skus_vendidos from public.com_painel_totais(2027, 'MF', '1')),
  1::bigint,
  'com_painel_totais: skus_vendidos é a contagem distinta do ANO, não a soma dos meses (1, não o dobro)'
);

-- 20/21 (item 3). O documento 5005 mentiu "classe":"venda" com CFOP 6901 —
-- a linha gravada tem que ter a classe do CFOP (industrialização), e o
-- valor não pode aparecer como venda em nenhuma leitura.
select is(
  (select classe from public.com_vendas_itens where documento = '5005'),
  'industrializacao',
  'classe mentida no payload (CFOP 6901, "classe":"venda") é ignorada — grava a classe do CFOP'
);
select is(
  (select sum(venda) from public.com_faturamento_mensal(2027, 'MF', '1') where competencia = '2027-03-01'),
  0::numeric,
  'CFOP 6901 mentido como venda não aparece como venda em março/2027 (o grupo existe, com venda = 0)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 23–26 (item 4 da auditoria) — "Maiores compradores" pelo LÍQUIDO: um
-- cliente que compra 600 e devolve 1.000 sai do topo (fica negativo), e um
-- terceiro cliente com venda FORA do período não aparece — a função nunca
-- tinha asserção nenhuma antes desta leva.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas(
  'MF', 'fixture-l6a-ranking-liquido.xlsx', 4,
  '{}'::jsonb,
  $items$[
    {"emissao":"2027-04-05","documento":"6001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C040","cliente_nome":"Cliente Quarenta","produto_codigo":"P040","produto_nome":"Produto Quarenta","quantidade":1,"valor_nota":600,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2027-04-10","documento":"6002","serie":"1","tipo_documento":"NFe","cfop":"1202","classe":"devolucao","cliente_codigo":"C040","cliente_nome":"Cliente Quarenta","produto_codigo":"P040","produto_nome":"Produto Quarenta","quantidade":1,"valor_nota":1000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2027-04-15","documento":"6003","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C041","cliente_nome":"Cliente Quarenta e Um","produto_codigo":"P041","produto_nome":"Produto Quarenta e Um","quantidade":1,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2027-05-01","documento":"6004","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C042","cliente_nome":"Cliente Quarenta e Dois","produto_codigo":"P042","produto_nome":"Produto Quarenta e Dois","quantidade":1,"valor_nota":300,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb,
  false
);

select is(
  (select faturamento from public.com_ranking_clientes('2027-04-01', '2027-04-30', 'MF', null, 20) where cliente_codigo = 'C040'),
  (-400)::numeric,
  'cliente que compra 600 e devolve 1.000 fica com faturamento líquido negativo (-400), não 600'
);
select is(
  (select cliente_codigo from public.com_ranking_clientes('2027-04-01', '2027-04-30', 'MF', null, 20) order by faturamento desc limit 1),
  'C041',
  'quem devolveu tudo (e mais) sai do topo — o primeiro do ranking é quem não devolveu'
);
select is(
  (select round(sum(participacao), 2) from public.com_ranking_clientes('2027-04-01', '2027-04-30', 'MF', null, 20)),
  100.00::numeric,
  'participação soma 100% mesmo com um faturamento negativo na base'
);
select is(
  (select count(*)::int from public.com_ranking_clientes('2027-04-01', '2027-04-30', 'MF', null, 20) where cliente_codigo = 'C042'),
  0,
  'cliente com venda fora do período (maio) não aparece no ranking de abril'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 27 (item 6 da auditoria) — com_perfil tem vendas.importar mas NÃO tem
-- vendas.substituir (o perfil "Vendedor Teste L6a" nunca concedeu essa
-- ação). Pedir p_substituir := true para uma competência já importada tem
-- que devolver a mensagem de PERMISSÃO, nunca a do índice único — quem já
-- marcou "substituir" não pode ler "marque substituir para refazer".
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('com-perfil@com-l6a.test');
select throws_like(
  $sql$
    select public.com_importar_vendas(
      'MF', 'fixture-l6a-substituir-sem-permissao.xlsx', 1,
      '{}'::jsonb,
      '[{"emissao":"2026-08-06","documento":"7001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C050","cliente_nome":"Cliente Cinquenta","produto_codigo":"P050","produto_nome":"Produto Cinquenta","quantidade":1,"valor_nota":50,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb,
      true
    )
  $sql$,
  'Você não tem permissão para substituir%',
  'vendas.importar sem vendas.substituir: a mensagem é de permissão, não a do índice único'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 28–29 (pedido do dono, 2026-09-21) — com_anos_com_venda: um ano distante
-- (2022) e os anos já usados (2026, 2027) voltam em ordem decrescente, e um
-- ano sem NENHUMA venda (2025) nunca aparece — o seletor de ano da tela não
-- pode ser uma janela fixa quando o go-live importar desde 2022.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('owner@com-l6a.test');
select public.com_importar_vendas(
  'MF', 'fixture-l6a-ano-2022.xlsx', 1,
  '{}'::jsonb,
  '[{"emissao":"2022-06-15","documento":"8001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C060","cliente_nome":"Cliente Sessenta","produto_codigo":"P060","produto_nome":"Produto Sessenta","quantidade":1,"valor_nota":60,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb,
  false
);
select is(
  (select array_agg(ano) from public.com_anos_com_venda()),
  array[2027, 2026, 2022],
  'com_anos_com_venda devolve os anos com venda, sem repetir, em ordem decrescente'
);
select is(
  (select count(*)::int from public.com_anos_com_venda() where ano = 2025),
  0,
  'ano sem nenhuma venda importada (2025) nunca aparece — nunca é um calendário chutado'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Colunas geradas de com_clientes: em_condicao e tabela_base nunca
-- comparam string à mão de novo (§3.8b).
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_clientes (tenant_id, codigo, razao_social, tabela_preco)
select (select tenant from f), 'TESTE-COND-1', 'Cliente Condição', 'ATACADISTA CONDICAO'
union all
select (select tenant from f), 'TESTE-COND-2', 'Cliente Sem Condição', 'ATACADISTA';

select is(
  (select em_condicao from public.com_clientes where codigo = 'TESTE-COND-1'),
  true,
  'tabela terminada em CONDICAO marca em_condicao = true'
);
select is(
  (select em_condicao from public.com_clientes where codigo = 'TESTE-COND-2'),
  false,
  'tabela sem o sufixo CONDICAO marca em_condicao = false'
);
select is(
  (select array_agg(distinct tabela_base) from public.com_clientes where codigo in ('TESTE-COND-1', 'TESTE-COND-2')),
  array['ATACADISTA'],
  'tabela_base tira o sufixo CONDICAO — ATACADISTA CONDICAO e ATACADISTA viram a mesma base'
);

select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Isolamento entre tenants (ADR-005): usuário de outro tenant não vê
-- nenhuma linha, mesmo tendo o cargo mais alto possível.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('outro-tenant@com-l6a.test');
select is(
  (select count(*) from public.com_vendas_itens)::int,
  0,
  'usuário de outro tenant não vê nenhuma linha de com_vendas_itens'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Módulo Comercial: quem não tem não lê; quem tem, lê.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('sem-modulo@com-l6a.test');
select is(
  (select count(*) from public.com_vendas_itens)::int,
  0,
  'member sem o módulo Comercial não lê com_vendas_itens'
);
select tests.clear_authentication();

select tests.authenticate_as('com-modulo@com-l6a.test');
select ok(
  (select count(*) from public.com_vendas_itens) > 0,
  'member com o módulo Comercial lê com_vendas_itens'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. `member` com o módulo (só leitura) NÃO consegue inserir — sem a
-- permissão granular `vendas.importar` no perfil, o INSERT recusado pela
-- WITH CHECK levanta erro na hora (regra 12 do pgTAP: é UPDATE/DELETE que
-- ficam silenciosos; INSERT sempre avisa).
-- ═══════════════════════════════════════════════════════════════════════════
select throws_ok(
  $sql$
    insert into public.com_vendas_itens (
      tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
      cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota
    )
    select tenant_id, id, 'MF', '2026-08-05', '9001', '1', '5101', 'venda', 'C999', 'P999', 'Produto Teste', 1, 1
    from public.com_vendas_importacoes limit 1
  $sql$,
  '42501',
  null,
  'member com o módulo mas sem a permissão vendas.importar não consegue inserir'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 11 e 16. Com o perfil concedendo vendas.importar, o INSERT passa — e o
-- RETURNING devolve a linha (regra 11 do pgTAP: é assim que o PostgREST
-- escreve, e é a visibilidade pós-insert que prova que a policy casou).
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('com-perfil@com-l6a.test');
-- `with ... insert ... returning` dentro de uma subconsulta escalar não é
-- aceito pelo Postgres ("WITH clause containing a data-modifying statement
-- must be at the top level") — por isso o INSERT vira uma tabela temporária
-- própria, no nível certo, e a asserção só confere o que ela guardou.
create temporary table inserida_11 on commit drop as
with inserida as (
  insert into public.com_vendas_itens (
    tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
    cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota
  )
  select tenant_id, id, 'MF', '2026-08-05', '9002', '1', '5101', 'venda', 'C998', 'P998', 'Produto Teste 2', 1, 1
  from public.com_vendas_importacoes limit 1
  returning id
)
select id from inserida;

select is(
  (select count(*) from inserida_11)::int,
  1,
  'member com perfil que concede vendas.importar consegue inserir, e o RETURNING devolve a linha'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 17. O override do usuário vence o perfil — nos dois sentidos. Aqui o
-- perfil concede vendas.importar, mas o override tira: tem que continuar
-- recusado, senão tirar a permissão de alguém no override não teria efeito
-- nenhum no banco.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  public.tem_permissao((select override_nega from u), 'comercial', 'vendas', 'importar'),
  false,
  'override do usuário (importar: false) vence o perfil que concede — tem_permissao nega'
);

select tests.authenticate_as('override-nega@com-l6a.test');
select throws_ok(
  $sql$
    insert into public.com_vendas_itens (
      tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
      cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota
    )
    select tenant_id, id, 'MF', '2026-08-05', '9003', '1', '5101', 'venda', 'C997', 'P997', 'Produto Teste 3', 1, 1
    from public.com_vendas_importacoes limit 1
  $sql$,
  '42501',
  null,
  'override que nega vendas.importar barra o insert mesmo com o perfil concedendo'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 30–40 (item 2c da auditoria) — o espelho pgTAP da MESMA tabela de casos de
-- src/lib/permissoes.test.ts (CASOS_PERMISSAO). Roda sem autenticar (como o
-- runner): tem_permissao e is_admin_or_higher são SECURITY DEFINER e
-- recebem o _user_id explícito, então não precisam de auth.uid(). A
-- expressão testada em cada caso é a que está de fato na policy —
-- `is_admin_or_higher(...) or tem_permissao(...)` para o braço do cargo,
-- `tem_permissao(...)` sozinho para os casos de perfil/override.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (public.is_admin_or_higher((select owner from u)) or public.tem_permissao((select owner from u), 'comercial', 'vendas', 'importar')),
  true,
  'owner passa sem perfil nenhum atribuído'
);
select is(
  (public.is_admin_or_higher((select admin_user from u)) or public.tem_permissao((select admin_user from u), 'comercial', 'vendas', 'importar')),
  true,
  'admin passa sem perfil nenhum atribuído'
);
select is(
  (public.is_admin_or_higher((select gestor_user from u)) or public.tem_permissao((select gestor_user from u), 'comercial', 'vendas', 'importar')),
  false,
  'gestor (manager) NÃO passa por ser gestor — is_admin_or_higher no banco é só owner/admin'
);
select is(
  public.tem_permissao((select override_null_user from u), 'comercial', 'vendas', 'importar'),
  true,
  'override com JSON null não é "negado": vale o perfil por baixo (que concede importar)'
);
select is(
  public.tem_permissao((select com_perfil from u), 'comercial', 'vendas', 'importar'),
  true,
  'perfil concede, sem override'
);
select is(
  public.tem_permissao((select perfil_nega_user from u), 'comercial', 'vendas', 'importar'),
  false,
  'perfil nega, sem override'
);
select is(
  public.tem_permissao((select perfil_nega_user from u), 'comercial', 'vendas', 'view'),
  false,
  'perfil não fala da ação — vale false, nunca se assume permitido'
);
select is(
  public.tem_permissao((select override_concede_user from u), 'comercial', 'vendas', 'importar'),
  true,
  'override concede por cima de perfil que nega'
);
select is(
  public.tem_permissao((select override_nega from u), 'comercial', 'vendas', 'importar'),
  false,
  'override nega por cima de perfil que concede'
);
select is(
  public.tem_permissao((select sem_modulo from u), 'comercial', 'vendas', 'importar'),
  false,
  'sem perfil nenhum atribuído e sem override — nunca permitido por omissão'
);
select is(
  public.tem_permissao((select perfil_nega_user from u), 'comercial', 'vendas', 'substituir'),
  true,
  'perfil concede substituir (a ação que apaga dado)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4, 5 e 6. Duplicidade, substituição e a conferência de linhas — num
-- import à parte (INBRAS/outubro) para não mexer no dataset acima.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('owner@com-l6a.test');

-- 6. A conferência falha ANTES de gravar qualquer coisa: linhas lidas
-- precisa fechar com itens + descartes, senão a importação inteira é
-- recusada (§4.3) — nunca um mês "quase certo".
select throws_like(
  $sql$
    select public.com_importar_vendas(
      'INBRAS', 'fixture-conferencia-errada.xlsx', 99,
      '{}'::jsonb,
      '[{"emissao":"2026-11-01","documento":"2001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C020","cliente_nome":"Cliente Vinte","produto_codigo":"P020","produto_nome":"Produto Vinte","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb,
      false
    )
  $sql$,
  'Conferência falhou%',
  'linhas_lidas que não fecha com itens + descartes recusa a importação inteira'
);

select public.com_importar_vendas(
  'INBRAS', 'fixture-inbras-out.xlsx', 1,
  '{}'::jsonb,
  '[{"emissao":"2026-10-05","documento":"3001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C010","cliente_nome":"Cliente Dez","produto_codigo":"P010","produto_nome":"Produto Dez","quantidade":1,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb,
  false
);

-- 4. Reimportar a mesma competência+filial sem "substituir" falha, e o
-- total não dobra (§4.2 — a trava não dá falso positivo, e é do banco).
select throws_like(
  $sql$
    select public.com_importar_vendas(
      'INBRAS', 'fixture-inbras-out-de-novo.xlsx', 1,
      '{}'::jsonb,
      '[{"emissao":"2026-10-06","documento":"3002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C010","cliente_nome":"Cliente Dez","produto_codigo":"P011","produto_nome":"Produto Onze","quantidade":1,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb,
      false
    )
  $sql$,
  'A competência%já foi importada%',
  'reimportar a mesma competência+filial sem substituir é recusado'
);
select is(
  (select venda from public.com_faturamento_mensal(2026, 'INBRAS', null) where competencia = '2026-10-01'),
  500::numeric,
  'a tentativa recusada não mudou o total de outubro'
);

-- 5. Com "substituir", o total reflete o NOVO arquivo — nem soma, nem
-- duplica. É o caminho de corrigir um mês, não de duplicar.
select public.com_importar_vendas(
  'INBRAS', 'fixture-inbras-out-substituido.xlsx', 1,
  '{}'::jsonb,
  '[{"emissao":"2026-10-05","documento":"3003","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C010","cliente_nome":"Cliente Dez","produto_codigo":"P010","produto_nome":"Produto Dez","quantidade":1,"valor_nota":800,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb,
  true
);
select is(
  (select venda from public.com_faturamento_mensal(2026, 'INBRAS', null) where competencia = '2026-10-01'),
  800::numeric,
  'com p_substituir, o total de outubro é o do novo arquivo — nem 500, nem 1300'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. com_importar_clientes historiza só quando a tabela MUDA (§4.5).
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_clientes(
  'fixture-clientes-1.csv',
  '[{"codigo":"C001","razao_social":"Cliente Um","fantasia":null,"tabela_preco":"ATACADISTA CONDICAO","ativo":true}]'::jsonb
);
select is(
  (select count(*) from public.com_clientes_tabela_historico where cliente_codigo = 'C001')::int,
  1,
  'mudar a tabela de um cliente pelo import gera uma linha em com_clientes_tabela_historico'
);

select public.com_importar_clientes(
  'fixture-clientes-2.csv',
  '[{"codigo":"C001","razao_social":"Cliente Um","fantasia":null,"tabela_preco":"ATACADISTA CONDICAO","ativo":true}]'::jsonb
);
select is(
  (select count(*) from public.com_clientes_tabela_historico where cliente_codigo = 'C001')::int,
  1,
  'reimportar com a MESMA tabela não gera outra linha no histórico'
);

select tests.clear_authentication();

select * from finish();
rollback;
