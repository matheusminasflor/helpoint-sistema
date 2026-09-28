-- O LANÇAMENTO DA VENDEDORA (migration 20261113010000, LEVA O)
--
-- A especificação é `docs/manual-gestao-comercial.md`. Cada asserção aqui é uma regra de
-- lá — e as que mais importam não são o caminho feliz:
--
--   3 e 9 — o GANCHO que o dono pediu: a vendedora não lança cliente da colega sem o escape,
--           e não puxa para si o cliente da colega. Se isto cair, cai o motivo de a leva
--           existir (lançar é o que obriga a montar a carteira);
--   5     — indicador exige cliente, ação não (§3.1 e §4);
--   14    — agendado não soma, valor zero não soma (§3.1: "vendas só somam com Concluído");
--   15    — os três tickets com o exemplo do PRÓPRIO manual (§7.1): se um dia os dois números
--           coincidirem, alguém "consertou" o que estava certo;
--   17    — "quando eu tiver um vendedor novo cadastrado, ele vai ter esses indicadores".
--
-- Toda escrita da vendedora passa por `com_salvar_interacao`, que é o que a tela chama — e
-- dentro dela o insert leva `returning` (lição 11). Testar o insert direto na tabela provaria
-- outro caminho, não o que a vendedora percorre (lição 8).
begin;
\ir _helpers.psql

select plan(19);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-lancamento', 'Lançamento Comercial', false) as a;

create temporary table u on commit drop as
select tests.create_user('ana@lanc.test',   (select a from f)) as ana,
       tests.create_user('bia@lanc.test',   (select a from f)) as bia,
       tests.create_user('chefe@lanc.test', (select a from f)) as chefe,
       tests.create_user('carla@lanc.test', (select a from f)) as carla;

select tests.grant_module((select ana from u),   (select a from f), 'comercial');
select tests.grant_module((select bia from u),   (select a from f), 'comercial');
select tests.grant_module((select chefe from u), (select a from f), 'comercial');
select tests.grant_module((select carla from u), (select a from f), 'comercial');
select tests.grant_role((select chefe from u), 'admin');

-- A tabela temporária nasce com o papel do runner; depois de `authenticate_as` o teste roda
-- como `authenticated`. Sem este grant: "permission denied for table f" (CI #148).
grant select on f, u to authenticated;

-- Ana responde por NORTE, Bia por SUL.
insert into public.com_carteira_membros (tenant_id, user_id, carteira)
values ((select a from f), (select ana from u), 'NORTE'),
       ((select a from f), (select bia from u), 'SUL');

-- C-N é da Ana, C-S da Bia, C-H está no Histórico (sem carteira).
-- C01..C10 são da Ana e compraram em 15/04 — os "10 ativos" do exemplo do manual.
-- C-120 e C-121 são da Bia e compraram há exatamente 120 e 121 dias de 30/06.
insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, ativo, origem)
select (select a from f), c.codigo, 'CLIENTE ' || c.codigo, c.carteira, true, 'cadastro'
  from (values ('C-N', 'NORTE'), ('C-S', 'SUL'), ('C-H', null),
               ('C01', 'NORTE'), ('C02', 'NORTE'), ('C03', 'NORTE'), ('C04', 'NORTE'), ('C05', 'NORTE'),
               ('C06', 'NORTE'), ('C07', 'NORTE'), ('C08', 'NORTE'), ('C09', 'NORTE'), ('C10', 'NORTE'),
               ('C-120', 'SUL'), ('C-121', 'SUL')) as c(codigo, carteira);

-- O histórico importado: `importacao_id` é NOT NULL. CTE, não subconsulta — comando que
-- escreve só entra numa consulta como CTE (CI #141).
create temporary table imp on commit drop as
with nova as (
  insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
  select a, 'vendas', 'pgtap-lancamento.xls', 12 from f
  returning id
)
select id from nova;

insert into public.com_vendas_itens
  (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
   cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
select (select a from f), (select id from imp), 'MF', v.emissao, v.doc, '1', '5102', 'venda',
       v.cliente, 'P1', 'Produto', 1, 100
  from (values ('2026-04-15'::date, 'D01', 'C01'), ('2026-04-15', 'D02', 'C02'), ('2026-04-15', 'D03', 'C03'),
               ('2026-04-15', 'D04', 'C04'), ('2026-04-15', 'D05', 'C05'), ('2026-04-15', 'D06', 'C06'),
               ('2026-04-15', 'D07', 'C07'), ('2026-04-15', 'D08', 'C08'), ('2026-04-15', 'D09', 'C09'),
               ('2026-04-15', 'D10', 'C10'),
               ('2026-03-02', 'D11', 'C-120'),   -- 30/06 menos 120 dias
               ('2026-03-01', 'D12', 'C-121')    -- 30/06 menos 121 dias
       ) as v(emissao, doc, cliente);

-- ── 1. Empresa nova nasce com a lista da planilha ─────────────────────────────
select is(
  (select count(*)::int from public.com_indicadores where tenant_id = (select a from f)),
  26,
  'empresa nova nasce com os 14 indicadores e as 12 acoes da planilha'
);

-- ── Ana lança ─────────────────────────────────────────────────────────────────
select tests.authenticate_as('ana@lanc.test');

-- 2. Cliente da carteira dela, com indicador: entra.
select lives_ok($$
  select public.com_salvar_interacao(null,
    '{"cliente_codigo":"C-N","data":"2026-08-10","status":"em_andamento"}'::jsonb,
    array[(select id from public.com_indicadores where nome = 'Contato para venda' and tenant_id = (select a from f))])
$$, 'a vendedora lanca contato para cliente da propria carteira');

-- 3. O GANCHO: cliente da colega, sem o escape, é recusado.
select throws_ok($$
  select public.com_salvar_interacao(null,
    '{"cliente_codigo":"C-S","data":"2026-08-10"}'::jsonb, null)
$$, '42501', null,
  'a vendedora NAO lanca cliente de outra carteira sem marcar "fora da minha carteira"');

-- 4. Com o escape, entra — e fica registrado como fora da carteira.
select lives_ok($$
  select public.com_salvar_interacao(null,
    '{"cliente_codigo":"C-S","data":"2026-08-11","fora_da_carteira":true}'::jsonb, null)
$$, 'com o escape "fora da minha carteira", o lancamento para cliente da colega entra');

-- 5. Indicador exige cliente (§3.1).
select throws_ok($$
  select public.com_salvar_interacao(null,
    '{"data":"2026-08-12","status":"concluido"}'::jsonb,
    array[(select id from public.com_indicadores where nome = 'Venda ativa' and tenant_id = (select a from f))])
$$, '23514', null,
  'indicador comercial sem cliente e recusado');

-- 6. Ação do FAROL não exige (§4).
select lives_ok($$
  select public.com_salvar_interacao(null,
    '{"data":"2026-08-12","status":"concluido"}'::jsonb,
    array[(select id from public.com_indicadores where nome = 'Campanhas' and tenant_id = (select a from f))])
$$, 'acao do FAROL sem cliente entra: campanha e treinamento podem ser internos');

-- 7 e 8. Trazer do Histórico para a PRÓPRIA carteira é permitido — é o gancho funcionando.
select lives_ok($$
  select public.com_atribuir_carteira_em_lote(array['C-H'], 'NORTE')
$$, 'a vendedora traz para a sua carteira um cliente que estava no Historico');

select is(
  (select carteira from public.com_clientes where codigo = 'C-H' and tenant_id = (select a from f)),
  'NORTE',
  'e o cliente passa de fato para a carteira dela'
);

-- 9. Puxar o cliente da colega, não. Nem pela ficha (update direto).
select throws_ok($$
  update public.com_clientes set carteira = 'NORTE'
   where codigo = 'C-S' and tenant_id = (select a from f)
$$, '42501', null,
  'a vendedora NAO tira cliente da carteira da colega');

-- Os lançamentos que o painel vai medir, em maio (§5, os três cenários):
--   C01 concluída R$ 12.000 e C02 concluída R$ 8.000   → somam (R$ 20.000);
--   C03 AGENDADA com R$ 5.000                            → não soma;
--   C04 concluída com valor ZERO                         → não soma.
select public.com_salvar_interacao(null, '{"cliente_codigo":"C01","data":"2026-05-10","status":"concluido","valor_venda":"12000"}'::jsonb,
  array[(select id from public.com_indicadores where nome = 'Venda ativa' and tenant_id = (select a from f))]);
select public.com_salvar_interacao(null, '{"cliente_codigo":"C02","data":"2026-05-12","status":"concluido","valor_venda":"8000"}'::jsonb, null);
select public.com_salvar_interacao(null, '{"cliente_codigo":"C03","data":"2026-05-14","status":"agendado","valor_venda":"5000"}'::jsonb, null);
select public.com_salvar_interacao(null, '{"cliente_codigo":"C04","data":"2026-05-15","status":"concluido","valor_venda":"0"}'::jsonb, null);

-- E a reativação: C-121 estava inativo pelo histórico; Ana vende a ele em julho (fora da
-- carteira dela, porque ele é da Bia).
select public.com_salvar_interacao(null, '{"cliente_codigo":"C-121","data":"2026-07-10","status":"concluido","valor_venda":"500","fora_da_carteira":true}'::jsonb, null);

select tests.clear_authentication();

-- ── Bia lança e lê ────────────────────────────────────────────────────────────
select tests.authenticate_as('bia@lanc.test');
select public.com_salvar_interacao(null, '{"cliente_codigo":"C-S","data":"2026-08-10"}'::jsonb, null);

-- 10. Uma vendedora não lê o lançamento da outra.
select is(
  (select count(*)::int from public.com_interacoes where vendedor_id = (select ana from u)),
  0,
  'a vendedora nao le os lancamentos da colega'
);
select tests.clear_authentication();

-- ── O gestor ──────────────────────────────────────────────────────────────────
select tests.authenticate_as('chefe@lanc.test');

-- 11. O gestor lê as duas — inclusive o lançamento feito pelo escape.
select is(
  (select count(distinct vendedor_id)::int from public.com_interacoes where tenant_id = (select a from f)),
  2,
  'o gestor le os lancamentos das duas vendedoras, inclusive os feitos fora da carteira'
);

-- 12. 120 dias é ativo; 121 é inativo (§10).
select is(
  (select array_agg(situacao order by cliente_codigo)
     from public.com_situacao_120_dias('2026-06-30')
    where cliente_codigo in ('C-120', 'C-121')),
  array['ativo', 'inativo'],
  'classificacao de 120 dias: 120 dias ainda e ativo, 121 ja e inativo'
);

-- 13. A venda lançada e concluída reativa quem o histórico dava como inativo.
select is(
  (select situacao from public.com_situacao_120_dias('2026-07-31') where cliente_codigo = 'C-121'),
  'ativo',
  'venda lancada e concluida reativa o cliente que o historico dava como inativo'
);

-- 14. Só soma o que foi concluído com valor > 0: 12.000 + 8.000, e não os 5.000 agendados.
select is(
  (select realizado from public.com_painel_do_gestor('2026-05-01')
    where vendedor_id = (select ana from u) and metrica = 'valor_vendas'),
  20000::numeric,
  'venda agendada e venda de valor zero nao somam: o valor do mes e 20.000, nao 25.000'
);

-- 15. O exemplo do manual (§7.1): 10 ativos, 2 compradores, R$ 20.000.
select is(
  (select row(ticket_ativos, media_base_ativa)::text from public.com_resumo_da_carteira('2026-05-01')
    where vendedor_id = (select ana from u)),
  row(10000.00, 2000.00)::text,
  'os tres tickets do manual: ticket de ativos 10.000 e media da base ativa 2.000 — de proposito diferentes'
);

-- 16. O farol (§6.2), no limite exato de 70%, e meta zero sem cor.
select is(
  array[public.com_cor_do_farol(69.99, 100), public.com_cor_do_farol(70, 100),
        public.com_cor_do_farol(100, 100),   public.com_cor_do_farol(5, 0)],
  array['vermelho', 'amarelo', 'verde', 'sem_meta'],
  'farol: abaixo de 70% vermelho, a partir de 70% amarelo, na meta verde, e meta zero sem cor'
);

select tests.clear_authentication();

-- 17. Vendedora nova ganha os indicadores sozinha: basta estar numa carteira.
insert into public.com_carteira_membros (tenant_id, user_id, carteira)
values ((select a from f), (select carla from u), 'LESTE');

select tests.authenticate_as('chefe@lanc.test');
select ok(
  (select count(*) from public.com_painel_do_gestor('2026-09-01')
    where vendedor_id = (select carla from u)) >= 18,
  'vendedora nova, recem-colocada numa carteira, aparece no painel com os indicadores sem nenhum outro passo'
);

-- 18. O nome da carteira é normalizado ao gravar. "leste " digitado no cliente tem de casar
--     com "LESTE" da vendedora — senão ela não consegue lançar para o próprio cliente, e
--     nada explica por quê.
select public.com_atribuir_carteira_em_lote(array['C05'], 'leste ');
select is(
  (select carteira from public.com_clientes where codigo = 'C05' and tenant_id = (select a from f)),
  'LESTE',
  'o nome da carteira e normalizado ao gravar: "leste " vira "LESTE"'
);

-- 19. Renomear a carteira leva os clientes junto. Sem isso, "NORTE" → "NORTE MG" deixaria
--     os clientes da Ana presos ao nome antigo, e ela sem conseguir lançar para eles.
select public.com_renomear_carteira('NORTE', 'NORTE MG');
select is(
  (select count(*)::int from public.com_clientes
    where tenant_id = (select a from f) and carteira = 'NORTE MG'),
  -- C-N, C01..C10 e C-H (trazido do Histórico no teste 7), menos C05 (que foi para LESTE no 18).
  11,
  'renomear a carteira leva os clientes junto: os 11 clientes da Ana passam para NORTE MG'
);
select tests.clear_authentication();

select * from finish();
rollback;
