-- Frente 1 — importar qualquer período (Comercial). Ver
-- .scratch/plano-frente1-importar-qualquer-periodo.md. A propriedade que
-- carrega a leva inteira: item de importação inacabada NUNCA aparece em
-- painel nenhum (§3) — por isso a espera, e é isso que esta suíte prova.
begin;
\ir _helpers.psql

select plan(17);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixtures — um tenant, um owner (bypassa a permissão granular via
-- is_admin_or_higher, como as suítes irmãs do Comercial já fazem) e um
-- segundo tenant só para a asserção de isolamento do fim.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table f on commit drop as
select tests.create_tenant('com-f1', 'Comercial Frente 1', false) as tenant,
       tests.create_tenant('com-f1-outro', 'Comercial Frente 1 Outro Tenant', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@com-f1.test',       (select tenant from f)) as owner,
       tests.create_user('outro-tenant@com-f1.test', (select outro_tenant from f)) as outro_user;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select outro_user from u), 'owner');

grant select on f, u to authenticated;

select tests.authenticate_as('owner@com-f1.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1/2/3 — a propriedade central (§3): enquanto a importação está
-- "em_andamento" (um lote gravado, fim ainda não chamado), o item mora na
-- espera e NÃO aparece em com_vendas_itens, nem em com_faturamento_mensal,
-- nem em com_curva_abc. Competência 2032-06 (mês só desta suíte).
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table imp_meio on commit drop as
select public.com_importar_vendas_inicio(
  'MF', 'fixture-f1-meio.xlsx', 2,
  '{}'::jsonb,
  '[{"competencia":"2032-06-01","linhas":2,"total_venda":300}]'::jsonb,
  2, false, null
) as id;

grant select on imp_meio to authenticated;

select public.com_importar_vendas_lote(
  (select id from imp_meio),
  $items$[
    {"emissao":"2032-06-05","documento":"F001","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente F1","produto_codigo":"PF1","produto_nome":"Produto F1","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2032-06-06","documento":"F002","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente F1","produto_codigo":"PF1","produto_nome":"Produto F1","quantidade":1,"valor_nota":200,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb
);

select is(
  (select count(*)::int from public.com_vendas_itens where documento in ('F001', 'F002')),
  0,
  'item na espera (importação em_andamento, fim ainda não chamado) não aparece em com_vendas_itens'
);

select is(
  (select coalesce(sum(venda), 0) from public.com_faturamento_mensal(2032, 'MF', null) where competencia = '2032-06-01'),
  0::numeric,
  'item na espera não aparece em com_faturamento_mensal'
);

select is(
  (select count(*)::int from public.com_curva_abc('2032-06-01', '2032-06-30', 'MF', 'valor') where produto_codigo = 'PF1'),
  0,
  'item na espera não aparece em com_curva_abc'
);

-- Fecha esta importação AGORA, antes de qualquer outro `inicio` na mesma
-- filial: `inicio` limpa importações "em_andamento" abandonadas da mesma
-- filial (§3 do plano) — se esta continuasse em_andamento, o próximo
-- `inicio` (bloco 4/5) a apagaria por baixo, e o `fim` usado mais abaixo
-- (§13/14/15) acharia "importação não encontrada".
select public.com_importar_vendas_fim((select id from imp_meio));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4/5 — fim com a espera INCOMPLETA levanta e não publica nada: a
-- importação disse que esperava 2 itens, só 1 chegou (o navegador fechou no
-- meio). Competência 2032-07, à parte da anterior.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table imp_incompleta on commit drop as
select public.com_importar_vendas_inicio(
  'MF', 'fixture-f1-incompleta.xlsx', 2,
  '{}'::jsonb,
  '[{"competencia":"2032-07-01","linhas":2,"total_venda":300}]'::jsonb,
  2, false, null
) as id;

grant select on imp_incompleta to authenticated;

select public.com_importar_vendas_lote(
  (select id from imp_incompleta),
  '[{"emissao":"2032-07-05","documento":"F101","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente F1","produto_codigo":"PF1","produto_nome":"Produto F1","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb
);

select throws_like(
  $sql$ select public.com_importar_vendas_fim((select id from imp_incompleta)) $sql$,
  '%mas eram esperados%',
  'fim com a espera incompleta (1 de 2) levanta e não publica'
);

select is(
  (select count(*)::int from public.com_vendas_itens where documento = 'F101'),
  0,
  'nada foi publicado — a espera incompleta não vaza para com_vendas_itens'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6/7 — a conferência externa (§3 do plano, opcional): total_impresso
-- divergindo mais de um centavo levanta; dentro da tolerância, publica.
-- Competências 2032-08 (diverge) e 2032-09 (dentro da tolerância).
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table imp_diverge on commit drop as
select public.com_importar_vendas_inicio(
  'MF', 'fixture-f1-diverge.xlsx', 1,
  '{}'::jsonb,
  '[{"competencia":"2032-08-01","linhas":1,"total_venda":100}]'::jsonb,
  1, false, 999
) as id;

grant select on imp_diverge to authenticated;

select public.com_importar_vendas_lote(
  (select id from imp_diverge),
  '[{"emissao":"2032-08-05","documento":"F201","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente F1","produto_codigo":"PF1","produto_nome":"Produto F1","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb
);

select throws_like(
  $sql$ select public.com_importar_vendas_fim((select id from imp_diverge)) $sql$,
  '%não bate com o total impresso%',
  'total_impresso divergindo mais de um centavo (999 x 100) levanta e não publica'
);

create temporary table imp_tolerancia on commit drop as
select public.com_importar_vendas_inicio(
  'MF', 'fixture-f1-tolerancia.xlsx', 1,
  '{}'::jsonb,
  '[{"competencia":"2032-09-01","linhas":1,"total_venda":100}]'::jsonb,
  1, false, 100.005
) as id;

grant select on imp_tolerancia to authenticated;

select public.com_importar_vendas_lote(
  (select id from imp_tolerancia),
  '[{"emissao":"2032-09-05","documento":"F301","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente F1","produto_codigo":"PF1","produto_nome":"Produto F1","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb
);

select lives_ok(
  $sql$ select public.com_importar_vendas_fim((select id from imp_tolerancia)) $sql$,
  'total_impresso dentro de um centavo (100.005 x 100) publica sem erro'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8 — o ataque/bug do resumo mentiroso: `inicio` reserva a competência
-- 2032-10 (é o que o navegador mandou), mas o item de verdade que chega no
-- lote é de 2032-11. `fim` tem que recusar — a reserva não pode destravar
-- um mês sem os dados baterem.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table imp_mentira on commit drop as
select public.com_importar_vendas_inicio(
  'MF', 'fixture-f1-mentira.xlsx', 1,
  '{}'::jsonb,
  '[{"competencia":"2032-10-01","linhas":1,"total_venda":100}]'::jsonb,
  1, false, null
) as id;

grant select on imp_mentira to authenticated;

select public.com_importar_vendas_lote(
  (select id from imp_mentira),
  '[{"emissao":"2032-11-05","documento":"F401","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente F1","produto_codigo":"PF1","produto_nome":"Produto F1","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb
);

select throws_like(
  $sql$ select public.com_importar_vendas_fim((select id from imp_mentira)) $sql$,
  '%não batem com o resumo reservado%',
  'competência real (2032-11) diferente da reservada em início (2032-10) — fim recusa e não publica'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9/10 — descartar uma importação "em_andamento" apaga a linha por inteiro
-- (não só marca): a reserva de competência (2032-12) some com ela, e um
-- reimport DEPOIS do descarte, para a MESMA competência, tem que funcionar
-- — "recomeçar é barato" (§4 do plano) só é verdade se isto for verdade.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table imp_descartada on commit drop as
select public.com_importar_vendas_inicio(
  'MF', 'fixture-f1-descartar.xlsx', 1,
  '{}'::jsonb,
  '[{"competencia":"2032-12-01","linhas":1,"total_venda":50}]'::jsonb,
  1, false, null
) as id;

grant select on imp_descartada to authenticated;

select public.com_descartar_importacao((select id from imp_descartada));

create temporary table imp_depois_do_descarte on commit drop as
select public.com_importar_vendas_inicio(
  'MF', 'fixture-f1-depois-do-descarte.xlsx', 1,
  '{}'::jsonb,
  '[{"competencia":"2032-12-01","linhas":1,"total_venda":777}]'::jsonb,
  1, false, null
) as id;

grant select on imp_depois_do_descarte to authenticated;

select public.com_importar_vendas_lote(
  (select id from imp_depois_do_descarte),
  '[{"emissao":"2032-12-10","documento":"F501","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente F1","produto_codigo":"PF1","produto_nome":"Produto F1","quantidade":1,"valor_nota":777,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb
);

select public.com_importar_vendas_fim((select id from imp_depois_do_descarte));

select is(
  (select venda from public.com_faturamento_mensal(2032, 'MF', null) where competencia = '2032-12-01'),
  777::numeric,
  'depois de descartar a importação abandonada, a MESMA competência é reimportada sem índice único reclamar'
);

select throws_like(
  $sql$ select public.com_descartar_importacao((select id from imp_depois_do_descarte)) $sql$,
  '%já foi concluída%',
  'descartar uma importação já concluída é recusado — não se desfaz o que já publicou'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 11/12 — lote e fim recusam id de importação que não existe, ou que já
-- não está "em_andamento" (concluída — reusa a de cima, já finalizada).
-- ═══════════════════════════════════════════════════════════════════════════
select throws_like(
  $sql$ select public.com_importar_vendas_lote('00000000-0000-0000-0000-000000000000'::uuid, '[]'::jsonb) $sql$,
  '%não encontrada%',
  'lote com id de importação inexistente é recusado, nomeando o motivo'
);

select throws_like(
  $sql$ select public.com_importar_vendas_lote(
    (select id from imp_depois_do_descarte),
    '[{"emissao":"2032-12-11","documento":"F502","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente F1","produto_codigo":"PF1","produto_nome":"Produto F1","quantidade":1,"valor_nota":1,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb
  ) $sql$,
  '%não está em andamento%',
  'lote numa importação já concluída é recusado, nomeando o status'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 13/14/15 — com_periodo_importado (§5 do plano, pedido do dono): a verdade
-- sobre o que está PUBLICADO, por filial e no total. Só 2032-06 (bloco
-- 1/2/3), 2032-09 e 2032-12 (MF) publicaram de verdade nesta suíte; um
-- publish à parte em INBRAS (2032-05) prova o filtro por filial.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas(
  'INBRAS', 'fixture-f1-inbras.xlsx', 1, '{}'::jsonb,
  '[{"emissao":"2032-05-05","documento":"F601","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CF1","cliente_nome":"Cliente F1","produto_codigo":"PF1","produto_nome":"Produto F1","quantidade":1,"valor_nota":10,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb,
  false
);

select is(
  (select row(competencia_de, competencia_ate, competencias) from public.com_periodo_importado('MF')),
  row('2032-06-01'::date, '2032-12-01'::date, 3::bigint),
  'com_periodo_importado(MF): de 2032-06 a 2032-12, 3 competências publicadas — nunca conta a espera nem a última importação'
);

select is(
  (select row(competencia_de, competencia_ate, competencias) from public.com_periodo_importado('INBRAS')),
  row('2032-05-01'::date, '2032-05-01'::date, 1::bigint),
  'com_periodo_importado(INBRAS): só a competência publicada nessa filial, isolada da MF'
);

select is(
  (select competencias from public.com_periodo_importado(null)),
  4::bigint,
  'com_periodo_importado sem filial soma as duas — 4 competências distintas no total'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 16 — isolamento entre tenants (ADR-005): usuário de outro tenant não vê
-- nenhuma competência em com_periodo_importado, mesmo pedindo o mesmo
-- recorte que tem dado no tenant principal.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro-tenant@com-f1.test');

select is(
  (select competencias from public.com_periodo_importado(null)),
  0::bigint,
  'usuário de outro tenant não vê nenhuma competência em com_periodo_importado'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-f1.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 17 — "N × lote" de verdade, não só um lote com N itens dentro: DUAS
-- chamadas separadas de `com_importar_vendas_lote` para a MESMA importação
-- (1 item, depois 2) acumulam na espera e publicam os três juntos. É o
-- mecanismo que o go-live (centenas de milhares de linhas, ~150 lotes de
-- 2.000) depende de estar certo — verificado manualmente pelo executor
-- contra o test-helpoint (relatório desta leva) e fixado aqui.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table imp_multilote on commit drop as
select public.com_importar_vendas_inicio(
  'MF', 'fixture-f1-multilote.xlsx', 3, '{}'::jsonb,
  '[{"competencia":"2033-04-01","linhas":3,"total_venda":600}]'::jsonb,
  3, false, null
) as id;

grant select on imp_multilote to authenticated;

select public.com_importar_vendas_lote(
  (select id from imp_multilote),
  '[{"emissao":"2033-04-05","documento":"ML1","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CML","cliente_nome":"Cliente ML","produto_codigo":"PML","produto_nome":"Produto ML","quantidade":1,"valor_nota":100,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}]'::jsonb
);

select public.com_importar_vendas_lote(
  (select id from imp_multilote),
  $items$[
    {"emissao":"2033-04-06","documento":"ML2","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CML","cliente_nome":"Cliente ML","produto_codigo":"PML","produto_nome":"Produto ML","quantidade":1,"valor_nota":200,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2033-04-07","documento":"ML3","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CML","cliente_nome":"Cliente ML","produto_codigo":"PML","produto_nome":"Produto ML","quantidade":1,"valor_nota":300,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb
);

select public.com_importar_vendas_fim((select id from imp_multilote));

select is(
  (select venda from public.com_faturamento_mensal(2033, 'MF', null) where competencia = '2033-04-01'),
  600::numeric,
  'dois lotes separados (1 item + 2 itens) para a mesma importação publicam os três juntos (100+200+300)'
);

select * from finish();
rollback;
