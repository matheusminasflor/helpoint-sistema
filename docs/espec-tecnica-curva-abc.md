Especificação Técnica — Curva ABC Minasflor (para reimplementação em sistema web) Público-alvo: uma 
IA de desenvolvimento (ex.: Claude Code) ou um dev que vai reconstruir este processo dentro de um sistema 
web. Objetivo deste documento: explicar, passo a passo, o que é feito, por que, e a causa de cada regra , 
para que dê para reimplementar a lógica sem depender do fluxo atual (Cowork + Google Drive + arquivos HTML 
gerados à mão). Fonte de verdade do processo operacional atual: Comercial/Curva ABC/INSTRUCOES.md (v7). 
Este documento é a versão de engenharia, orientada a reimplementação. 0. Visão geral em 30 segundos Todo 
período, dois arquivos de venda exportados do ERP Forteplus (um por empresa: INBRAS e MF/Minasflor ) são 
transformados em: 1. Uma base de dados consolidada (hoje uma planilha .xlsx , aba BASE ); 2. Um Painel 
Comercial (responde: quem eu abordo e o que ofereço ); 3. Um Painel Diretor (responde: este produto ainda 
vale a pena e vou bater a meta ). Ambos os painéis têm filtro por empresa (INBRAS / MF / Todas) e por 
período. Num sistema web, a "planilha BASE" vira uma tabela de banco de dados , e os painéis viram páginas 
que consultam a API . 1. Entidades e dimensões - Empresa: 1 = INBRAS , 2 = MF (Minasflor) . Toda linha de 
venda pertence a uma empresa. No fluxo atual, a empresa é derivada do nome do arquivo de origem ( INBRAS* 
→ 1; MF* / MINASFLOR* → 2). Num sistema web, viria de qual empresa o usuário selecionou ao subir o 
arquivo, ou de um campo da integração. - Competência: o mês dos dados, AAAA-MM , derivado da data de 
emissão de cada linha (nunca do nome do arquivo). - Cliente: identificado por código (inteiro). Nome é só 
exibição. - Produto: identificado por código . Descrição é só exibição. - Vendedor: código + nome 
(com ressalvas — ver §9). - Tabela de preço do cliente (ATACADISTA, VIP, VIP MAIS, REVENDA, SALÃO REF, 
DIRETORIA e variantes com sufixo CONDICAO): vem de um cadastro externo ( CLIENTESXTABELA ). 2. Entradas 
(inputs) Input O que é Frequência Observações Export Forteplus — INBRAS Relatório "Mercadorias 
Vendidas — Produto" , agrupado por cliente, do período semanal (sexta) 1 arquivo .xlsx Export Forteplus 
— MF Idem, da outra empresa semanal 1 arquivo .xlsx CLIENTESXTABELA. csv Cadastro CODIGO; ATIVO; 
RAZAOSOCIAL; FANTASIA; TABELA semanal / quando muda cruza tabela de preço por código de cliente 
HISTORICO_METAS. json Faturamento por carteira (VIP, MG, DEMAIS ESTADOS, BERÇÁRIO) e metas , por ano, mês 
a mês, desde 2022 manual, diretoria Dado externo, não calculado do ERP. Origem: planilha "Apresentação 
Comercial acumulado" do diretor METAS_<ano>.json Metas vigentes editadas pelo diretor quando o diretor muda 
se existir, sobrepõe as metas do HISTORICO Causa de o export ser "Mercadorias Vendidas — Produto agrupado 
por cliente": é o único relatório do Forteplus que traz, por cliente, cada item com CFOP, série, 
quantidade, valor, desconto e vendedor — os campos necessários para classificar e montar a curva. 3. 
Leitura e limpeza do export (passo a passo + porquê) O relatório do Forteplus não é uma tabela limpa . 
Antes de qualquer cálculo: 1. Descartar cabeçalhos repetidos. O relatório repete o cabeçalho a cada 
página. Regra: jogar fora qualquer linha em que a 1ª coluna ( Cod ) contenha o texto Cod . Causa: senão o 
cabeçalho entra como se fosse dado. 2. Descartar linhas em branco. Há uma linha vazia entre cada item. 
Causa: ruído do formato de impressão. 3. Tratar a linha de grupo do cliente. O cliente aparece sozinho numa 
linha, no formato NOME DO CLIENTE-1352 . Não é item — é o cabeçalho do grupo. Extrair o código do fim 
( -1352 → 1352 ) e aplicá-lo a todas as linhas de item seguintes, até o próximo grupo. Causa: é assim 
que o relatório amarra itens ao cliente. Campos relevantes de cada linha de item: Emissão, Documento, 
Série (Sr), CFOP, Cód. Produto, Descrição, Quantidade, Total Venda, Desconto, Cód. Vendedor, Vendedor . 
A empresa vem da origem do arquivo, não do conteúdo. Num sistema web: este passo vira um parser de 
ingestão (um "loader"). Idealmente o ERP exporta CSV/JSON estruturado e esse pré-tratamento some — mas 
enquanto a fonte for esse relatório, o parser precisa replicar as 3 regras acima. 4. Classificação por 
CFOP (o coração de tudo) Cada linha é classificada pelo CFOP : Tipo CFOPs Entra na curva? Vai para Venda 
5101, 5102, 5401, 5403, 6101, 6102, 6107, 6401, 6403, 7101, 7949 Sim curva/faturamento Devolução 1201, 
1202, 1410, 1411, 2201 Sim (negativo) abate do faturamento Bonificação 5910, 5911, 6910, 6911 Não seção 
BONIFICAÇÃO / custo de cashback Tipo CFOPs Entra na curva? Vai para Industrialização 5901, 5902, 6901, 
6902, 6903, 1901, 1902 Não fora de tudo Outros qualquer CFOP fora das listas Não registrar para revisão 
humana Por que isto é o passo mais crítico: sem separar por CFOP, o relatório mede a coisa errada. Exemplo 
real (jul/2026): 83% da quantidade movimentada não era venda ; uma única linha de industrialização (CFOP 
6901) tinha 47.650 unidades , 4× todas as vendas do mês. Bonificação nunca é faturamento — aparece em 
seção própria e como custo no cashback, jamais somada à venda. Regra de segurança: CFOP desconhecido 
não é "chutado" — vira Outros , fica fora da curva, e a quantidade/valor é registrada para um humano 
revisar. Causa: um CFOP novo pode ser venda ou não; errar aqui contamina tudo. 5. Chaves e enriquecimento - 
Cliente = código, nunca nome. Grafias variam entre meses e entre sistemas ( ITALO AUGUSTO MEDICE vs ITALO 
MEDICE ); o mesmo código aparece com razões sociais diferentes no ERP e nas planilhas. Causa: usar nome 
cria "clientes fantasmas". Nome exibido = a grafia mais frequente do código em toda a base. - Produto = 
código, nunca descrição. Mesma lógica. - Tabela de preço: join do código do cliente com CLIENTESXTABELA 
. Cliente sem correspondência → SEM TABELA (registrar). - Empresa: carimbada na linha (1 ou 2). - 
Competência: derivada de Emissão ( AAAA-MM ). 6. A BASE (modelo de dados) A aba BASE (num sistema web: 
tabela de fatos ) tem uma linha por item de venda, colunas: Competencia | Empresa | Cod_Cliente | Cliente | 
Cod_Produto | Produto | CFOP | Serie | Tipo | Entra_na_curva | Quantidade | Valor | Desconto | Cod_Vendedor | 
Vendedor | Documento | Emissao Invariantes (regras de ouro) — valem para qualquer implementação: 1. O 
histórico só cresce. Meses fechados nunca mudam. Ao entrar agosto, jan–jul continuam idênticos. 
Conferência: linhas_antes + linhas_novas = linhas_depois . Se encolheu, aborta. 2. Dedup por Competencia + 
Empresa . Não reimportar um par que já existe (no modelo mensal). No modelo semanal com "mês corrente 
atualizável" (ver §11), o mês em aberto é reprocessado a cada semana; os fechados, não. 3. Toda linha 
tem empresa. Sem empresa identificável, a linha não entra (vira pendência). Todas as análises abaixo são 
derivadas da BASE — num sistema web, são queries / materialized views , não dados digitados. 7. Cálculos 
derivados 7.1 Curva ABC Ordena os itens do período por faturamento (ou quantidade, se o usuário trocar o 
critério), acumula o percentual, e classifica: A até 80%, B até 95%, C acima de 95%. Recalcula por 
período e por empresa selecionados — a classe de um produto é sempre relativa ao recorte na tela. 7.2 
Cashback Apurado mês a mês : em cada mês, a faixa depende de quanto o cliente comprou naquele mês , e o 
percentual incide sobre a compra do mês. Num período de vários meses, o cashback é a soma das apurações 
mensais (nunca % sobre o acumulado). Grades por tabela (mínimo → %): - ATACADISTA: 5.000→2%, 
7.500→2,5%, 10.000→3%, 15.000→3,5%, 20.000→4%, 30.000→4,5%, 40.000→5%, 60.000→5,5%, 
80.000→6%, 100.000→6,5%, 120.000→7% - VIP: 5.000→4%, 8.000→5%, 15.000→6%, 25.000→7%, 
40.000→8%, 60.000→9%, 120.000→10% - VIP MAIS: 3.000→4%, 5.000→5%, 10.000→6%, 20.000→7%, 
35.000→8%, 50.000→9%, 80.000→10% Tabelas com sufixo CONDIÇÃO usam a grade da tabela base. REVENDA, 
SALÃO REF, DIRETORIA não têm grade → "sem programa", contadas à parte, nunca estimadas . 7.3 Pedidos em 
condição Identificação: cliente em tabela CONDIÇÃO + Série 75 (as duas juntas). Duas regras 
invioláveis: 1. Valores = os da nota fiscal. Nada de multiplicador ou "valor fora de nota". 2. É recorte, 
não parcela. Esses pedidos já estão no faturamento total — não somar a seção ao total (senão conta 
em dobro). Para dividir carteira, o corte é por cliente (condição vs. demais) e fecha com o total. 7.4 
Metas e carteiras (painel diretor) Vêm do HISTORICO_METAS.json (externo). Carteiras: VIP, MG, DEMAIS 
ESTADOS, BERÇÁRIO (esta desde 2022/2026), por ano, mês a mês, + total e meta . Conciliação 
obrigatória: a planilha de metas conta bonificação como faturamento , o painel não → mostrar o quadro 
com: valor da apresentação, venda líquida Forteplus, bonificação, soma e a diferença residual 
(jan–jul/2026 = R$ 216.090, sem explicação no ERP). Regra: mostrar a diferença, nunca ajustar o número 
. 8. Saída 1 — A planilha CURVA_ABC_<AAAA-MM>.xlsx Abas (num sistema web, cada uma vira uma view 
/endpoint): Aba Conteúdo RESUMO métricas do mês + série mensal do ano ABC_GERAL produtos do mês por 
faturamento, % acumulado, classe, nº de clientes ABC_CLIENTE cliente × produto, curva calculada dentro de 
cada cliente MATRIZ produto × cliente em quantidade, do mês MOVIMENTOS cliente × produto que comprava e 
parou (comprou em ≥2 dos 3 meses anteriores e não no atual) Aba Conteúdo EVOLUCAO faturamento por cliente 
em cada mês, média móvel e variação ABC_SEMESTRE curva acumulada dos últimos 6 meses BONIFICACAO venda, 
valor bonificado e % por cliente BASE os dados (a tabela de fatos). Não editar. LEIA-ME resumo das regras 
Requisitos atuais (planilha): fórmulas, não valores digitados (recalcula quando a BASE muda); formatação 
R$/quantidade/%; sem erro de fórmula. Num sistema web, isto deixa de ser Excel e vira consultas ao banco. 9. 
Saída 2 — Painel Comercial (estrutura e comportamento) Controles no topo (todos recalculam o painel 
inteiro): - Empresa: Todas / INBRAS / MF. (No dado atual: empresas = {"1":"01 INBRAS","2":"02 MF"} ; cada 
linha tem o código da empresa; filtro empresa com 'T' =todas.) - Período: cada mês, últimos 3, últimos 
6, ano todo. - Critério da curva: faturamento (padrão) ou quantidade (com ressalva de que unidades misturam 
sachê de 12ml com máscara de 1kg). Seções, na ordem: 1. Indicadores do período (faturamento, clientes 
ativos, SKUs na faixa A, bonificação). 2. Gráfico do ano mês a mês, período selecionado destacado. 3. 
Pedidos em condição (§7.3). 4. Curva completa (Pareto de todos os SKUs; cortes em 80% e 95%; contagem por 
faixa). 5. Todos os produtos por faixa (lista com classe, faturamento, quantidade, % acumulado, nº de 
clientes, quanto falta; filtro por faixa). 6. Ficha do cliente (busca por nome; indicadores; faturamento mês 
a mês; mix por faixa; evolução por faixa; evolução produto a produto vs. período anterior de mesmo 
tamanho, marcando novo / zerou ; o que compra; produtos bonificados; parou de comprar; nunca comprou). 7. 
Bonificação por cliente. 8. Cashback (§7.2). Nota de arquitetura: o painel atual é um HTML de ~1 MB com 
todos os dados embutidos num objeto JS ( D = {rows, empresas, faixas, ...} ) e todo o cálculo em JavaScript 
no navegador. Num sistema web isso deve mudar: os dados ficam no banco, o backend expõe endpoints agregados, 
e o frontend só renderiza. Ver §12. 10. Saída 3 — Painel Diretor Mesmos filtros (empresa + período, 
abrindo em "ano todo"). Seções: 1. Metas e histórico (§7.4 — indicadores do ano, meta × realizado mês 
a mês, simulador de metas, carteiras mês a mês e ano a ano, comparativo entre anos, conciliação). 2. 
Tendência produto a produto (histórico em miniatura, faixa, meses com venda, nº clientes, variação, 
situação). 3. Detalhe do produto (gráfico mensal + nº de clientes, quem compra, leitura em texto). 4. 
Faturamento por cliente (histórico mensal, SKUs, meses ativos, bonificação). 5. Evolução por faixa, 
todos os clientes (barra empilhada A/B/C por mês). 6. Produto × cliente (matriz, com 
quantidade/faturamento; remover CPF/CNPJ do fim dos nomes mantendo o nome completo no tooltip). 
Classificação de situação (divide o período em duas metades e compara): Novo, Descontinuado, Esporádico 
(venda em ≤30% dos meses), Crescendo (2ª metade ≥25% acima), Caindo (≥25% abaixo), Estável (±25%). 
Com um único mês não há tendência (marcar — ). Sinalizar concentração quando >50% do faturamento do 
produto saiu num único mês (sazonalidade/pedido pontual, não tendência). Simulador de metas: 12 campos 
editáveis (um por mês); ao mudar, recalcula cobertura, total anual e projeções. Persistência: o diretor 
copia o JSON para METAS_<ano>.json ; a rotina lê na próxima geração. Nunca sobrescrever METAS_<ano>.json 
(é do diretor). 11. Cadência e o "mês corrente atualizável" (importante para o web) A operação virou 
semanal (sexta) . Isso conflita com "dedup por competência" puro: se o mês em aberto (ex.: setembro) entrar 
numa sexta e ficar travado, as vendas das semanas seguintes do mesmo mês nunca entram. Regra correta para 
semanal: - Meses fechados → congelam na base, imutáveis. - Mês corrente → reprocessado a cada semana a 
partir do export mais recente (substitui a versão da semana anterior daquele mês). Ao fechar o mês, ele 
congela. Num sistema web isso é trivial (um DELETE WHERE competencia = mes_corrente AND empresa = X seguido 
de INSERT , ou um UPSERT ), e é uma das maiores vantagens de sair de arquivos que "só criam, não 
sobrescrevem". 12. Recomendação de arquitetura para o sistema web Para a IA/dev que vai construir: Backend 
/ dados - Tabela vendas (a BASE): as colunas do §6, com índices por (competencia, empresa) , cod_cliente , 
cod_produto , cfop . - Tabela clientes_tabela (o CLIENTESXTABELA): codigo, ativo, razao_social, fantasia, 
tabela . - Tabela metas_historico (o HISTORICO_METAS): ano → carteira → 12 meses; + metas. - Job de 
ingestão (substitui o parser + limpeza + classificação): recebe o export por empresa, aplica §3, §4, 
§5, faz UPSERT por (competencia, empresa) respeitando §6/§11. - Endpoints agregados (substituem as abas 
§8 e as seções dos painéis): curva ABC por período/empresa/critério, cashback, condição, movimentos, 
evolução, matriz, metas/conciliação. Frontend - Duas páginas (Comercial e Diretor) consumindo os 
endpoints, com os controles de empresa/período/critério. A lógica de cálculo sai do navegador e vai para 
o backend (hoje ela está toda no JS embutido do HTML). Regras de negócio que NÃO podem se perder na 
migração (são o valor do processo): 1. Classificação por CFOP (§4) — venda/devolução entram; 
bonificação/industrialização não. 2. Código é a chave (cliente e produto), nome é exibição. 3. 
Bonificação nunca é faturamento. 4. Pedidos em condição = recorte, valores de NF, não somar ao total. 
5. Cashback apurado mês a mês, por grade de tabela; tabelas sem grade não são estimadas. 6. Curva A/B/C = 
80/95, relativa ao recorte (período + empresa + critério). 7. Metas/carteiras são dado externo (do 
diretor), e a conciliação com o ERP é mostrada, não ajustada. 8. Histórico só cresce; mês fechado é 
imutável; mês corrente é atualizável. 9. Filtro por empresa em tudo (INBRAS/MF/Todas). 13. Glossário - 
Forteplus: o ERP de origem das vendas. - CFOP: código fiscal que diz a natureza da operação (venda, 
devolução, bonificação, industrialização…). - Competência: mês dos dados ( AAAA-MM ), da data de 
emissão. - Carteira: agrupamento comercial (VIP, MG, DEMAIS ESTADOS, BERÇÁRIO) usado só no painel do 
diretor, vindo da planilha de metas. - Bonificação: mercadoria dada sem faturar; custo, nunca receita. - 
Pedidos em condição: vendas de tabela CONDIÇÃO na série 75; mostradas como recorte. - Curva ABC: 
classificação de Pareto por peso no faturamento (A = os que mais pesam). Este documento descreve a lógica 
de negócio e a arquitetura-alvo. A implementação atual (Cowork + Google Drive + HTML gerado por Python) é 
apenas o "como está hoje"; a intenção do sistema web é preservar as regras dos §4–§11 num backend com 
banco de dados e frontend que consome API.