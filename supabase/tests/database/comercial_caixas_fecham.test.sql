-- AS CAIXAS FECHAM — o teste que impede o número de fugir da realidade
-- (migration 20261027010000_caixas_do_faturamento.sql)
--
-- Pedido do dono, 2026-09-25: "o relatório de insights comercial e diretor
-- precisa estar 100% preciso e funcional. Me preocupo com os dados fugirem da
-- realidade." Esta suíte é a resposta mecânica a essa frase.
--
-- O DEFEITO QUE ELA EXISTE PARA PEGAR não é um erro de conta, é um SILÊNCIO.
-- `com_painel_totais` e `com_faturamento_mensal` têm caixa para `venda`,
-- `devolucao` e `bonificacao`. `com_classe_do_cfop` produz CINCO classes — as
-- outras duas (`industrializacao` e `outros`) não tinham caixa em tela nenhuma:
-- R$ 243.989,69 da base de teste entravam pela importação e não saíam em lugar
-- nenhum. Nada acusava, porque uma soma incompleta não parece errada: parece
-- menor.
--
-- A ESTRATÉGIA. Uma fixture com as CINCO classes ao mesmo tempo, cada uma com
-- um valor diferente, e a asserção de que a soma das caixas é IDÊNTICA ao total
-- importado. Valores diferentes de propósito: com valores iguais, trocar duas
-- caixas de lugar não mudaria nada e a suíte passaria verde por cima do defeito.
--
-- E a guarda estrutural (bloco 4): a lista de classes que a TABELA aceita tem
-- de ser exatamente a lista de caixas que a FUNÇÃO tem. Acrescentar uma sexta
-- classe ao CHECK sem dar caixa a ela reprova aqui, com o nome da classe nova
-- na mensagem — antes de o dinheiro sumir da tela de alguém.
begin;
\ir _helpers.psql

select plan(10);

-- Dois tenants: o principal e um segundo, que existe só para o bloco 9.
-- `com_caixas` NÃO é `security definer` de propósito — quem separa as empresas
-- é a policy de SELECT de `com_vendas_itens`, que já libera para Comercial ou
-- Diretoria. O bloco 9 é o que prova que essa escolha segura.
create temporary table f on commit drop as
select tests.create_tenant('com-caixas', 'Comercial Caixas', false) as tenant,
       tests.create_tenant('com-caixas-outro', 'Comercial Caixas Outro', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@com-caixas.test', (select tenant from f)) as owner,
       tests.create_user('owner@com-caixas-outro.test', (select outro_tenant from f)) as owner_outro;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select owner_outro from u), 'owner');

grant select on f, u to authenticated;

select tests.authenticate_as('owner@com-caixas.test');

insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values
  ('CA1', 'Cliente Caixas Um', 'ATACADISTA', true),
  ('CA2', 'Cliente Caixas Dois', 'ATACADISTA', true),
  ('CA3', 'Cliente Caixas Tres', 'ATACADISTA', true);

-- ═══════════════════════════════════════════════════════════════════════════
-- A FIXTURE DAS CINCO CLASSES — ano 2031, filial MF.
--
-- O `classe` do JSON é DECORAÇÃO: `com_importar_vendas_lote` ignora o que vem
-- na planilha e grava `com_classe_do_cfop(cfop)`. Quem decide a classe aqui é o
-- CFOP, e é por isso que cada linha abaixo tem um CFOP de uma família
-- diferente. Escrever a classe "certa" no JSON e o CFOP errado daria um teste
-- que prova o contrário do que diz.
--
--   CFOP   classe             série   valor      qtd   cliente  produto
--   5101   venda                1     1000.00     10   CA1      PA
--   5101   venda               75      200.00      2   CA2      PB
--   5910   bonificacao          1       50.00      5   CA3      PC
--   5910   bonificacao         75      300.00      3   CA3      PC
--   5901   industrializacao     1      400.00      1   CA1      PD
--   5151   outros              75        7.00      1   CA1      PE
--   1201   devolucao            1       30.00      1   CA1      PA
--
--   venda_total        = 1000 + 200 = 1200.00
--   devolucao          =               30.00
--   bonificacao        =   50 + 300 =  350.00   (as DUAS séries — a série diz
--                                               se tem nota, nunca finalidade)
--   industrializacao   =              400.00
--   outros             =                7.00
--   ─────────────────────────────────────────
--   soma das caixas    =             1987.00  ==  total importado
--
--   faturamento_liquido = 1200 − 30 = 1170.00
--   unidades_vendidas   = 10 + 2 − 1 =    11  (a devolução SUBTRAI)
--   unidades_bonificadas=      5 + 3 =     8
--   clientes_ativos     = CA1, CA2   =     2  (CA3 só recebeu de graça)
--   skus_vendidos       = PA, PB     =     2  (PC só saiu de graça)
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas('MF', 'fixture-caixas-cinco-classes.xlsx', 7, '{}'::jsonb,
  $items$[
    {"emissao":"2031-01-10","documento":"C101","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CA1","cliente_nome":"Cliente Caixas Um","produto_codigo":"PA","produto_nome":"Produto A","quantidade":10,"valor_nota":1000.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-01-11","documento":"C102","serie":"75","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CA2","cliente_nome":"Cliente Caixas Dois","produto_codigo":"PB","produto_nome":"Produto B","quantidade":2,"valor_nota":200.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-01-12","documento":"C103","serie":"1","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"CA3","cliente_nome":"Cliente Caixas Tres","produto_codigo":"PC","produto_nome":"Produto C","quantidade":5,"valor_nota":50.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-01-13","documento":"C104","serie":"75","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"CA3","cliente_nome":"Cliente Caixas Tres","produto_codigo":"PC","produto_nome":"Produto C","quantidade":3,"valor_nota":300.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-01-14","documento":"C105","serie":"1","tipo_documento":"NFe","cfop":"5901","classe":"industrializacao","cliente_codigo":"CA1","cliente_nome":"Cliente Caixas Um","produto_codigo":"PD","produto_nome":"Produto D","quantidade":1,"valor_nota":400.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-01-15","documento":"C106","serie":"75","tipo_documento":"NFe","cfop":"5151","classe":"outros","cliente_codigo":"CA1","cliente_nome":"Cliente Caixas Um","produto_codigo":"PE","produto_nome":"Produto E","quantidade":1,"valor_nota":7.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2031-01-16","documento":"C107","serie":"1","tipo_documento":"NFe","cfop":"1201","classe":"devolucao","cliente_codigo":"CA1","cliente_nome":"Cliente Caixas Um","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":30.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. AS CAIXAS SOMAM O TOTAL IMPORTADO. A asserção que dá nome à suíte.
--
-- `fora_das_caixas` é a diferença entre o total importado e a soma das caixas,
-- calculada DENTRO da função — a tela mostra esse número quando ele não é zero,
-- em vez de esconder dinheiro. Aqui tem de ser zero, e o total tem de ser
-- 1987,00: se alguma caixa deixar de existir, o total não muda (ele soma a
-- tabela inteira) e a sobra aparece.
--
-- Mutação: tirar `+ c.industrializacao` da conta de `fora_das_caixas` faz a
-- sobra virar 400,00 e esta asserção acusar.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(total_importado, fora_das_caixas) from public.com_caixas(2031)),
  row(1987.00::numeric, 0::numeric),
  'as caixas somam exatamente o total importado — nenhuma classe fica sem caixa'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CADA CAIXA COM O SEU VALOR. Sete números numa asserção só, de propósito:
-- é a comparação que pega troca de lugar entre caixas, que uma asserção por
-- caixa não pegaria (cada uma passaria contra o valor que ela mesma produziu).
--
-- Mutações que esta pega:
--   • esquecer a série na venda (somar tudo em `venda_com_nota`) → 1200/0;
--   • filtrar a bonificação por série (o erro de 2026-09-25, desfeito na
--     migration 20261026050000) → 50 ou 300 em vez de 350;
--   • mandar `industrializacao` para dentro de `outros` → 0/407.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(venda_com_nota, venda_sem_nota, venda_total, devolucao, bonificacao, industrializacao, outros)
     from public.com_caixas(2031)),
  row(1000.00::numeric, 200.00::numeric, 1200.00::numeric, 30.00::numeric,
      350.00::numeric, 400.00::numeric, 7.00::numeric),
  'cada caixa com o seu valor: a série separa a VENDA em duas e some na bonificação'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. O NÚMERO DE NEGÓCIO. As caixas são BRUTAS (`abs`) para fecharem contra o
-- total; o líquido é venda menos devolução, e é ele que responde "quanto a
-- empresa faturou de verdade". As unidades seguem a mesma regra: a devolução
-- subtrai (10 + 2 − 1 = 11), e o que saiu de graça conta à parte (5 + 3 = 8).
--
-- Só esta suíte tem devolução: a base real da Minasflor não tem NENHUMA em
-- quatro anos (confirmado pelo dono, 2026-09-25), então nenhum outro teste
-- exercita o sinal. Sem este bloco, trocar `− c.devolucao` por `+ c.devolucao`
-- passaria verde em toda a suíte do repositório.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(faturamento_liquido, unidades_vendidas, unidades_bonificadas, clientes_ativos, skus_vendidos)
     from public.com_caixas(2031)),
  row(1170.00::numeric, 11::numeric, 8::numeric, 2::bigint, 2::bigint),
  'o líquido desconta a devolução, as unidades também, e quem só recebeu de graça não é cliente ativo'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. A GUARDA ESTRUTURAL — a razão de esta suíte continuar valendo depois que
-- eu sair daqui.
--
-- A tabela tem um CHECK que limita `classe` a cinco valores. `com_caixas` tem
-- uma caixa para cada um desses cinco. As duas listas têm de ser A MESMA: quem
-- acrescentar uma sexta classe ao CHECK (porque o Forteplus passou a exportar
-- consignação, remessa para conserto, o que seja) e não der caixa a ela reprova
-- AQUI, com o nome da classe nova na mensagem de erro do pgTAP — antes de o
-- dinheiro sumir silenciosamente da tela do diretor.
--
-- A alternativa era escrever `outros` como "todo o resto" (`classe not in
-- (...)`), e aí as caixas fechariam sempre, por construção, e o bloco 1 nunca
-- acusaria nada. O teste de fechamento só vale porque a soma PODE não fechar.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select array_agg(x order by x) from (
     select unnest(regexp_matches(pg_get_constraintdef(oid), '''([a-z_]+)''::text', 'g')) as x
     from pg_constraint where conname = 'com_vendas_itens_classe_check'
   ) s),
  array['bonificacao','devolucao','industrializacao','outros','venda'],
  'as classes que a tabela aceita são exatamente as caixas que com_caixas tem — classe nova sem caixa reprova aqui'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. `com_painel_totais` CONCORDA COM `com_caixas`. As duas funções leem a
-- mesma tabela com a mesma janela; a mais antiga é a que o cartão do topo do
-- Comercial usava sozinho. Se uma mudar e a outra não, a tela mostra dois
-- números para a mesma pergunta — e foi assim que a curva e o painel
-- divergiram antes (docs/nao-funciona.md).
--
-- `painel.venda` é a venda das duas séries somada, que é `caixas.venda_total`.
-- `painel.liquido` soma `valor_curva`, que é outro caminho para o mesmo
-- 1170,00 de `caixas.faturamento_liquido` — dois cálculos diferentes chegando
-- ao mesmo lugar é o que dá valor à comparação.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(p.venda, p.devolucao, p.liquido, p.bonificacao, p.unidades, p.clientes_ativos, p.skus_vendidos)
     from public.com_painel_totais(2031) p),
  (select row(c.venda_total, c.devolucao, c.faturamento_liquido, c.bonificacao, c.unidades_vendidas,
              c.clientes_ativos, c.skus_vendidos)
     from public.com_caixas(2031) c),
  'com_painel_totais e com_caixas concordam nos sete números que as duas calculam'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. A SOMA DA TABELA MÊS A MÊS É O TOTAL DO ANO. O que a pessoa faz na tela:
-- confere o cartão do topo somando as linhas da tabela do meio. Se não fechar,
-- ela perde a confiança nos dois números — e está certa.
--
-- `clientes_ativos`/`skus_vendidos` ficam FORA desta soma de propósito:
-- `count(distinct …)` não se soma entre grupos de mês/filial/série (achado 1 da
-- auditoria da L6a — somar dava 129 clientes onde a verdade era 58). As
-- unidades entram: é aqui que a divergência entre `quantidade` e
-- `quantidade_curva` aparecia, e ela só aparece porque a fixture tem devolução.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(sum(m.venda), sum(m.devolucao), sum(m.liquido), sum(m.bonificacao), sum(m.unidades))
     from public.com_faturamento_mensal(2031) m),
  (select row(c.venda_total, c.devolucao, c.faturamento_liquido, c.bonificacao, c.unidades_vendidas)
     from public.com_caixas(2031) c),
  'a soma do mês a mês é igual ao total do ano — inclusive as unidades, que contavam por fórmulas diferentes'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7 e 8. AS DUAS JANELAS. `p_de`/`p_ate` recortam por emissão; `p_filial`
-- recorta por empresa do grupo. A fixture nova põe 2032 em DOIS meses e DUAS
-- filiais, com valores distintos, para um recorte errado aparecer como número
-- e não como zero.
--
--   2032-01-05  MF       5101  venda   série 1    100.00
--   2032-03-05  MF       5101  venda   série 1    900.00
--   2032-01-06  INBRAS   5101  venda   série 1     70.00
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_vendas('MF', 'fixture-caixas-janela-mf.xlsx', 2, '{}'::jsonb,
  $items$[
    {"emissao":"2032-01-05","documento":"C201","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CA1","cliente_nome":"Cliente Caixas Um","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":100.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2032-03-05","documento":"C202","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CA1","cliente_nome":"Cliente Caixas Um","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":900.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

select public.com_importar_vendas('INBRAS', 'fixture-caixas-janela-inbras.xlsx', 1, '{}'::jsonb,
  $items$[
    {"emissao":"2032-01-06","documento":"C203","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"CA1","cliente_nome":"Cliente Caixas Um","produto_codigo":"PA","produto_nome":"Produto A","quantidade":1,"valor_nota":70.00,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

-- Com `p_de`/`p_ate` preenchidos, o `p_ano` é ignorado — o `case` da função
-- escolhe a emissão. Passar 2031 aqui de propósito: se a função somasse as duas
-- condições em vez de escolher uma, o resultado viria zero e esta asserção
-- acusaria.
select is(
  (select row(venda_total, total_importado) from public.com_caixas(2031, null, '2032-01-01', '2032-01-31')),
  row(170.00::numeric, 170.00::numeric),
  'p_de/p_ate recortam por emissão e ganham do p_ano — janeiro de 2032 traz as duas filiais (100 + 70), não março'
);

select is(
  (select row(venda_total, total_importado) from public.com_caixas(2032, 'INBRAS')),
  row(70.00::numeric, 70.00::numeric),
  'p_filial recorta por empresa do grupo — INBRAS não vê os 1000,00 da MF no mesmo ano'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. O ISOLAMENTO ENTRE EMPRESAS, que aqui é obra da RLS e não da função.
-- `com_caixas` não é `security definer`: ela roda com os poderes de quem
-- chama, e a policy de SELECT de `com_vendas_itens` (tenant + Comercial ou
-- Diretoria) é a única coisa entre uma empresa e a venda da outra. Se alguém
-- puser `security definer` nela sem escrever o filtro de tenant lá dentro —
-- que foi exatamente o que `com_conciliacao` precisou fazer — esta asserção
-- vira 1987,00 e acusa.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('owner@com-caixas-outro.test');

select is(
  (select row(venda_total, bonificacao, total_importado) from public.com_caixas(2031)),
  row(0::numeric, 0::numeric, 0::numeric),
  'empresa sem venda importada vê zero — a RLS de com_vendas_itens é o que segura, sem security definer'
);

select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. `anon` NÃO EXECUTA. Fica por último porque é catálogo, não dado.
--
-- `revoke ... from public` não resolve isto, e foi medido: o Supabase tem
-- `alter default privileges` dando `execute` a `anon` em toda função nova do
-- schema `public`, e esse grant é DIRETO, não herdado de `public`. A migration
-- revoga de `anon` explicitamente; esta asserção é o que impede a próxima
-- recriação da função de perder o revoke em silêncio.
--
-- As 50 e tantas RPCs do Comercial que já existem continuam abertas para
-- `anon` — é a leva B do docs/plano-geral.md, e não é esta. O que este bloco
-- garante é que a dívida não cresce pela função nova.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  has_function_privilege('anon', 'public.com_caixas(integer,text,date,date)', 'execute'),
  false,
  'anon não executa com_caixas — o revoke explícito está na migration e fica preso aqui'
);

select * from finish();
rollback;
