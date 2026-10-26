# Helpoint, rodada 2 — correções e melhorias gerais

Proposta de 2026-10-25, depois de fechada a "Helpoint no dia a dia" (etapas 0 a 6). Página para o dono:
https://claude.ai/artifact/B96z1d5XEQNSQSCmbkLpc9 (fonte no scratchpad da sessão, `proposta-r2/`).

Medido com as mesmas ferramentas da proposta anterior (Taste Skill, Web Interface Guidelines da Vercel, UI/UX Pro Max,
Leis de UX), o uso real de 30 dias na produção e quatro levantamentos módulo a módulo do código e do banco.

## Uso real (30 dias, produção, 2026-10-25)

193 chamados e 622 respostas; 343 lançamentos do Comercial; 113 eventos de agenda; 144 mensagens de chat; 9 compras
(todas com chamado por baixo); 4 contas no Financeiro; 0 pedidos novos (no ar desde o mesmo dia); 0 SAC; 0
colaboradores no RH; 6 de 16 pessoas entraram na última semana.

## Decisões do dono (2026-10-25)

1. **Chamado e pedido** — duas palavras só: *chamado* (algo quebrou, preciso de ajuda) e *pedido* (algo que alguém
   aprova e entrega). Um botão "Novo" no lugar de "Abrir chamado", "Pedir", "Solicitação" e "Nova", com duas portas na
   primeira tela. "Solicitação" sai de todas as telas (Compras → "Pedidos de compra"; RH → "Pedidos ao RH").
2. **A compra vira pedido de verdade** — sem chamado por baixo (hoje `compras_solicitacoes.ticket_id` NOT NULL e a
   situação é copiada para o chamado). Sai de Meus chamados, da avaliação com estrelas e do resumo do Início; aparece
   em Pedidos com as etapas. Quem compra segue no quadro de Compras.
3. **Menu do celular** — os setores da pessoa em cima e "Todos os setores" recolhido; sai o botão de três linhas do
   topo abaixo de 860 px (a barra de baixo já tem "Menu").
4. **Letra no celular** — texto corrido em 16 px no celular; no computador fica como está.
5. **RH antes do Meu RH** — uma lista só de pessoas no RH (hoje Holerites/Benefícios/Documentos usam `profiles`, e
   Folha/Faltas usam `rh_employee_profiles`) e importação de colaboradores por planilha.
6. **Opções que não fazem nada: tirar todas** — incluindo tom, contexto e instruções da Lyra (o chat não as lê),
   "Notificações por e-mail" dos alertas da TI e as permissões que nenhuma tela pergunta (Inventário › Exportar,
   Indicadores › Exportar fora da TI, Laudos › Ver). O dono escolheu isto no lugar da recomendação (fazer o chat seguir
   o tom). Atenção: tirar permissão do perfil não pode tirar acesso de ninguém — só some a caixinha que não tinha efeito.
7. **Portal completo antes do primeiro distribuidor** — primeiros passos, estoque inicial por planilha, editar e apagar
   salão e venda, remarcar e cancelar visita, "fiz a visita" na ficha, histórico de visitas, preço da tabela sugerido,
   aviso de venda acima do estoque, salões por vendedor, compras dele à Minasflor na ficha do Comercial.
8. **Ordem** — a do roteiro.

## Roteiro

| Etapa | O que entra |
|---|---|
| R1 · Correções sem pergunta | "Vendido com nota fiscal" somando venda não concluída; total da equipe que pode contar a nota duas vezes (conferir); carrinhos da ficha × painel do Comercial; compra em "Para avaliar"/"Aguardando você"; Pedidos abrindo na aba vazia; pedido sem negrito na Lyra avisa e sem agrupar em Todos os avisos; "Seus últimos setores → Compras" caindo no formulário antigo; "Configurações › Carteiras" (é "Equipe e carteiras"); texto do cadastro de clientes; `/comercial/clientes` bloqueando a vendedora; atalhos mortos do Início; manual comercial atualizado (faturado manda); as opções sem efeito (decisão 6) |
| R2 · Chamado e pedido | Decisões 1 e 2 |
| R3 · Celular, parte 2 | Decisões 3 e 4; Carteiras, quadro de Compras, matriz produto × cliente, Folha e Cronograma no celular; "em breve" explicado no toque; atalhos no ícone do aplicativo |
| R4 · RH e Meu RH | Decisão 5; indicadores do RH (quantas pessoas, entradas e saídas, faltas, custo da folha, férias vencendo); "Reembolsos" do RH vira "Vales e auxílios" |
| R5 · Portal completo | Decisão 7 |
| R6 · Módulos e relatórios | Exportar para Excel no Comercial; projeção do fechamento do mês; clientes novos e positivados; um seletor de período; ranking num lugar só; canal Distribuidor na Diretoria; cidade/UF no cliente; compra ligada à conta a pagar; "Conferência de vendas"; relatórios de reembolsos e de consumo do estoque; termos da TI; prazo do SAC na tela; conectar a conta social no Cronograma; indicadores de Marketing e Educacional; "Meus treinamentos" |
| R7 · Todo o sistema e limpeza | Nome em botão só de ícone, foco visível, "…", modo escuro com `color-scheme`, animações de chamar atenção, um modelo de cabeçalho; tabelas `mkt_assets`, `mkt_events` e os três perfis antigos (com backup); código sem uso |

Cada etapa sobe com o CI verde e vira notícia no Jornal com prints.

## Andamento

- **R1 — feita (2026-10-25).** "Vendido com nota fiscal" só soma Concluído (a mesma regra do banco); ficha do
  distribuidor com a regra de carrinho do painel; compra fora de Meus chamados (sem estrelas, sem "Aguardando você");
  Pedidos abre na aba que tem o que ver, com contador em "Minhas compras"; pedido em negrito na Lyra avisa e agrupado em
  Todos os avisos; "Seus últimos setores" sem Compras; "Equipe e carteiras" nos quatro textos; `/comercial/clientes`
  leva à tela de clientes do Comercial; atalhos mortos do Início removidos; manual comercial com o aviso do que mudou;
  textos do Financeiro. Decisão 6: a Lyra ficou com "Ativar" e o nome (`ai-secretary` não lê mais tom, contexto, foco e
  instruções — nenhuma empresa os tinha mudado); "Notificações por e-mail" saiu dos alertas da TI; "Exportar" saiu de
  todo perfil menos os Indicadores da TI; "Ver" saiu dos Laudos; "Chamados SAC" virou "Chamados internos".
  **Desvios, com o motivo:** (1) o total da equipe que contaria duas vezes a nota de carteira compartilhada não foi
  reescrito — nenhuma carteira tem duas pessoas hoje; o teto e a saída estão em `src/lib/resumo-equipe.ts`; (2) o texto
  do cadastro de clientes ("pedido de cliente novo chega por chamado") está certo — é a decisão do dono de 2026-10-01; o
  levantamento errou; (3) "Tutoriais" da Qualidade não era opção sem efeito: o banco já deixava escrever; faltava o
  caminho — ganhou `/qualidade/tutoriais` no menu da Qualidade.
- **R2 — decisões de 2026-10-25 (as quatro iguais à recomendação):** (a) os 9 chamados das compras antigas: copiar a
  conversa, os registros e o número para o pedido, passar os avisos antigos para o pedido e **apagar os chamados**;
  (b) **todo pedido tem conversa** ("Escrever", não só a compra); (c) **e-mail em todo pedido**, como o chamado (a
  compra já mandava 39 em 30 dias); (d) o formulário público do SAC também diz **"chamado"**.
  **Como ficou:** migration `20270206010000_compra_vira_pedido.sql` — a compra é um pedido (`solicitacoes`, tipo
  'compra', setor 'compras'); `compras_solicitacoes.ticket_id` saiu, entraram `solicitacao_id`, `comprador_id` e
  `category_id`; a etapa do pedido segue a compra (`compra_anda_no_pedido`, que também escreve cada decisão no histórico);
  `notify_compra` no lugar de `notify_ticket`; `pedido_escrever` (conversa; na compra, "Somente leitura" de Compras vê e
  não escreve); `pedido_emails_pendentes` (o robô do e-mail do chamado manda também o do pedido). Tela: "Novo" com duas
  portas (Chamado / Pedido) no lugar de "Abrir chamado" e "Pedir"; Pedidos numa lista só (saiu "Minhas compras"); a
  página do pedido de compra mostra o painel da compra; "solicitação" saiu das telas.
- **R3 — celular, parte 2 (2026-10-25).** Menu que desliza (celular e tablet): Início, os setores da pessoa
  (`setores_da_pessoa`) e a Diretoria em cima; o resto em "Todos os setores", recolhido (abre sozinho quando a tela atual
  é de fora e na busca); Configurações no fim; sem setor nenhum, tudo à vista (`src/lib/menu-dos-meus-setores.ts`). O
  botão de três linhas do topo some abaixo de 860 px (a barra de baixo tem "Menu"). Letra: no celular `text-sm`/14 px
  vira 16 e 13 px vira 15 (uma regra em `index.css`, 1.900 lugares). "Em breve" explica o motivo no toque. Atalhos no
  ícone do aplicativo (Novo, Chamados, Pedidos, Chat). Telas largas medidas a 390 px: quadros de Compras em coluna única;
  número da faixa de indicadores 22 px no celular (cortava "R$ 1.096,80"); matriz produto × cliente segue grade com o
  produto parado; rótulo da tabela-lista com cabeçalho de duas linhas ("out/26embaixo") corrigido; fila do gestor com 3
  de cada no celular; caixas de mês e empresa do RH na largura da tela. Folha e Cronograma já cabiam.
- **R4 — decisões de 2026-10-25:** (a) a lista do RH começa **copiando as 16 pessoas com login** (o dono preferiu isto
  à planilha como ponto de partida; quem não é funcionário o RH tira); (b) na planilha o **CPF é obrigatório** e
  identifica a pessoa (importar de novo atualiza); sem CPF igual, acha pelo e-mail — as 16 copiadas entram sem CPF;
  (c) empresa que a planilha traz e o RH não tem é **criada pelo nome**; (d) **férias vencendo acende 60 dias antes**
  do fim do prazo de tirar (CLT). Medido: as 16 tabelas do RH estavam vazias na produção; "Reembolsos" do RH é VA, VT,
  combustível e descontos (vira "Vales e auxílios"); dois defeitos nos indicadores (aniversariantes sem nome para quem
  não tem login; combustível sempre zero por colunas que não existem).
  **Como ficou:** migration `20270207010000_rh_uma_lista_so.sql` — holerites, documentos, benefícios, férias e atestados
  passam a ser do colaborador (`employee_id`); o login (`user_id`) fica como espelho mantido por gatilho, para o Meu RH e
  os avisos; férias aprovadas atualizam "últimas férias"; `rh_importar_colaboradores` (prévia e confirmação),
  `rh_logins_fora_da_lista`, `rh_indicadores`.
  **Fica para depois:** o chamado de admissão ainda escolhe a pessoa entre quem tem login (2 chamados até hoje, nenhum
  com a pessoa); ligar o chamado de admissão/desligamento ao colaborador do RH é uma decisão à parte.
- **R5 — decisões de 2026-10-26 (as três iguais à recomendação):** (a) o preço que a venda ao salão já traz é o **último
  que ele cobrou** daquele salão por aquele produto (sem venda anterior ao salão, o último que cobrou de qualquer salão) —
  medido: "a tabela dele" é o preço que ele paga, e nenhum preço do Conecta existe ainda (chaves pendentes); (b) salão
  **com venda não se apaga, vira "Perdido"**; só o sem venda se apaga (o banco apagaria as vendas junto e o estoque
  "voltaria"); (c) venda acima do estoque **avisa e deixa salvar**. Medido: as tabelas do Portal estão vazias na produção.
  **Como ficou:** migration `20270208010000_portal_completo.sql` — gatilho que recusa apagar salão com venda (só no
  `delete` direto: apagar o distribuidor ainda leva tudo), `dist_corrigir_venda`, `dist_importar_estoque` (o "tenho" de
  muitos produtos, com a diferença) e `dist_tirar_da_equipe` passando salões e visitas marcadas ao responsável. Tela:
  primeiros passos no Meu dia (salões, estoque, equipe; somem quando feitos ou escondidos); "Planilha" no Estoque;
  editar e apagar salão; "Fiz uma visita agora", remarcar e cancelar na ficha e na Agenda, com o histórico das feitas;
  corrigir e apagar venda; preço sugerido e aviso de estoque na venda; filtro e escolha do vendedor do salão (só o
  responsável); "Perdido" fora de "Todos"; na ficha do Comercial, as notas dele dos últimos 12 meses e o link para a
  ficha do cliente.
- **R6 — decisões de 2026-10-26.** O dono pediu **cautela nos relatórios comerciais** (os dados vêm do Forteplus e os
  defeitos custaram a sair): nenhum cálculo existente é reescrito; número novo sai de função já validada e é conferido
  contra a tela atual na produção. (a) **Exportar** no Comercial e na Diretoria só com a caixinha "Exportar" do perfil
  (ligada para Gestor e Diretoria, desligada para a vendedora); nas outras telas, quem vê exporta. (b) **Projeção do
  mês por dias úteis** (seg–sex sem feriado), com o realizado medido até o dia do último dado importado — medido: a
  última nota importada é de 16/10, dez dias antes. (c) **Cliente novo = sem compra nos 120 dias antes do mês** (a
  régua de "inativo"); medido em set/26: 44 positivados, 3 de primeira compra, 4 sem compra em 120 dias — o histórico
  importado começa em jan/26, por isso "primeira compra da história" não serve ainda. (d) **Um seletor de período só,
  desde que não mude dado**: cada tela recebe as mesmas datas de hoje (Lançamentos segue por mês), e os números de
  cada tela são conferidos antes e depois. (e) **Prazo do SAC = o prazo dos chamados da Qualidade**
  (`prazo_padrao_do_chamado` com módulo 'qualidade'). Medido também: não há chave do app da Meta na produção
  (`META_APP_ID`/`META_APP_SECRET`) — o botão de conectar Instagram/Facebook só funciona depois de cadastrada.
  **R6a (o que não mexe em venda), como ficou:** migration `20270209010000` — `rel_reembolsos_e_adiantamentos`,
  `rel_consumo_do_estoque`, o gatilho `sac_prazo_da_qualidade` e `meus_treinamentos()`. Tela: a compra, o reembolso, o
  adiantamento e a Caixinha mostram a conta a pagar que geraram (Contas a pagar abre uma conta só por `?conta=`); os
  dois relatórios no Financeiro, em Compras e na Diretoria; "Conferência de vendas"; componentes de Compras em
  `src/components/compras/`; cidade e UF no cadastro do cliente (a lista não carregava as duas colunas — salvar teria
  apagado a cidade vinda do Forteplus); Distribuidores na Diretoria; termos de responsabilidade nos Indicadores da TI;
  Exportar no Inventário; prazo e "como foi resolvido" no SAC; conectar a conta no Cronograma; pedidos de arte,
  estoque e Benefício nos Indicadores do Marketing; treinamentos nos Indicadores do Educacional; "Meus treinamentos".
  Achado na conferência: os Indicadores do Marketing não abriam desde ca97ebfe (balão do gráfico fora do
  `ChartContainer`) — virou `DicaDoGrafico`, o mesmo da TI.
  **R6b (Comercial), como ficou — nenhuma conta de venda nova:** "Exportar para Excel" lê as tabelas que a tela mostra
  (`exportarTabelasDaTela`) nas análises, Indicadores, Carteiras e na Diretoria, só com a caixinha (no Comercial é
  `reports.export`, que ficou guardada desde antes da R1: Gestor ligado, Operador desligado; na Diretoria, `exportar`,
  ligada no "Diretor"). Positivados, novos e conversão são números que `com_resumo_da_carteira` já devolvia
  (`compradores`, `compradores_inativos` — "inativo" é a régua de 120 dias — e `relacionados`/`relacionados_sem_compra`).
  A projeção usa o realizado da tela e `com_ritmo_do_mes` (migration `20270209020000`: dias úteis do mês e até o último
  dado; mês encerrado conta inteiro). O seletor é uma peça só (`SeletorDePeriodo`) com os tratadores de cada tela
  intactos. Conferência: os números de 9 telas (Indicadores e Carteiras de set/26, Vendas, Clientes, Bonificação,
  Cashback e três visões da Diretoria) foram fotografados duas vezes antes (idênticos) para comparar depois.
  Não feito: "o mesmo ranking em um lugar" — medido, Vendas e Diretoria já chamam a mesma função
  (`com_ranking_clientes`); a diferença é só o limite (20 × 10) e o filtro de série.
- **R7 — todo o sistema e limpeza (2026-10-26).** Medido antes de mexer:
  * **Animações de chamar atenção:** as 30 do levantamento eram quase todas "carregando" (esqueleto, três pontinhos
    da Lyra, avatar da Lyra só enquanto pensa) e o ponto de gravação, que ficam, como a proposta diz. Saiu a única
    sem uso (`pulse-critical`). A chama da "Sua Performance" fica: foi pedido do dono (2026-10-09/13).
  * **Foco:** os 21 `outline-none` que sobravam trocam o contorno por fundo destacado (itens de menu do Radix) ou
    anel no contêiner; o `:focus-visible` global de `index.css` vale no resto. Nada a corrigir.
  * **"…":** 190 linhas de texto de tela (carregando, placeholders), por script que não toca comentário nem spread.
  * **Modo escuro:** `color-scheme` em `:root` e `.dark` — barra de rolagem, calendário e campos nativos seguem o tema.
  * **Botão só de ícone:** os 87 sem nome para leitor de tela ganharam `aria-label`.
  * **Cabeçalho:** as telas que montavam o título na mão (5 do Comercial, 8 do RH, as vistas de formulário/detalhe
    da TI, o editor de tutorial) e as que embutiam o `PageHeader` no conteúdo passam ao modelo único (faixa no topo).
  * **Tabelas (migration `20270210010000`):** saem `mkt_assets` (10 itens, todos já no estoque novo do Marketing),
    `mkt_events`, `mkt_quotations`, `mkt_ai_generations` e os perfis antigos `ti_access_profiles`/`ti_user_profiles`/
    `qualidade_access_profiles`/`qualidade_user_profiles` (vazios; eram quatro, não três). Cópia no esquema `arquivo`,
    que a API não alcança. `is_qualidade_tech`, `archive_profile`, `restore_profile` e `rh_desativa_o_desligado`
    deixam de ler os perfis antigos; com eles vazios, ninguém perde acesso. A Lyra (`ai-lyra-chat`) deixa de ler
    os eventos do Marketing.
  * **Código sem uso:** 21 arquivos que nenhuma tela importava (o pedido de cadastro de cliente, três importadores
    de cliente, o editor de blocos de tutorial e o que só ele usava, os ganchos de orçamento e criativo do Marketing,
    os relatórios de insight, entre outros) e 6 bibliotecas nunca usadas (`three` e afins, `gifshot`, `html-to-image`).
    Ficam, sem tela: as tabelas `com_solicitacoes_cadastro` e `ti_insight_reports` e a função `mkt-ai-creative`.
