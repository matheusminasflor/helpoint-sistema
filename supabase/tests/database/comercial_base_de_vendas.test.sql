-- Painel Comercial (L6a) — a base de vendas do Forteplus e a porta.
-- Ver .scratch/plano-painel-comercial.md §6/L6a para a tabela de asserções.
begin;
\ir _helpers.psql

select plan(24);

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
       tests.create_user('outro-tenant@com-l6a.test',    (select outro_tenant from f)) as outro_user;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select sem_modulo from u), 'member');
select tests.grant_role((select com_modulo from u), 'member');
select tests.grant_module((select com_modulo from u), (select tenant from f), 'comercial');
select tests.grant_role((select com_perfil from u), 'member');
select tests.grant_module((select com_perfil from u), (select tenant from f), 'comercial');
select tests.grant_role((select override_nega from u), 'member');
select tests.grant_module((select override_nega from u), (select tenant from f), 'comercial');
select tests.grant_role((select outro_user from u), 'owner');

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
