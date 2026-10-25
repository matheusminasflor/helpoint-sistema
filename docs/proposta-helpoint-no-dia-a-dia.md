# Helpoint no dia a dia — proposta aprovada (dono, 2026-10-24)

Status: **aprovada em 2026-10-24**, versão 5. A página com as telas desenhadas, as 30 leis de UX e as fotos em
computador, tablet e celular está em https://claude.ai/artifact/UuRoGKfX42KyB9RDCijVxx (privada). Este arquivo é a
especificação que vale no repositório; onde ele e a página divergirem, ele ganha.

A régua são as leis de https://lawsofux.com/. Foram usadas quatro ferramentas de avaliação: Taste Skill (desenho e
inspeção das telas), Web Interface Guidelines da Vercel (leitura do código), Playwright CLI (navegação e medição em
quatro aparelhos) e UI UX Pro Max (base de regras de UX; a busca dele pede Python, que não está instalado).

## A nova cara (decidida em 2026-10-24)

Preto e branco, como o logo da Minasflor. Estilo "achromatic-ledger" do Taste Skill.

- Fundo `#f5f4f2` (pedra clara), cartões brancos com borda `#e4e3e0`, **sem sombra** em nada parado.
- Texto `#0a0a0a`, apoio `#5f5f5c`. Botão principal preto (`#141414`), um por tela; o resto é contornado.
- Cor só no dado: vermelho `#c4242a` só no atrasado; azul `#1d5fbf` só no dado principal (o prazo de hoje).
  **Zero não ganha cor.** Situação em palavras ("venceu ontem", "hoje 11:30"), não em pílula colorida.
- Letra Geist em cinco tamanhos (12, 14, 16, 24, 30); negrito só em dinheiro; números à direita, com algarismos de
  mesma largura. Sem rótulo pequeno em caixa alta, sem emoji, sem ícone em círculo colorido, sem degradê.
- Números do topo numa faixa dividida (rótulo, número, uma frase de contexto), no máximo quatro.
- O logo da Minasflor no topo do menu e na tela de entrada (sai o "H" azul).
- Elementos próprios: **a régua do dia** no Meu dia (expediente, almoço em que o prazo pausa, agora, cada prazo) e
  **a hora de recomprar** no Portal (o ciclo de cada salão e o atraso).
- Modo escuro com as mesmas regras: fundo preto, cartões um tom acima, botão principal branco.

## Celular, tablet e computador

| Tamanho | Menu | Listas e filas |
|---|---|---|
| Celular (até 640 px) e tablet em pé (641–860) | Barra de baixo com 5 destinos, ícone e nome; o do meio é a ação principal do perfil. Em cima, só o título. | Tabela vira lista de duas linhas; a fila mostra uma coisa por vez. |
| Tablet deitado e notebook (861–1100) | Menu lateral de 200 px | Fila com lista e chamado; detalhes embaixo. |
| Computador (acima de 1100) | Menu lateral de 240 px | Fila em três colunas. |

No toque, tudo clicável tem 44 px; campos com letra 16 (o iPhone não dá zoom); nada sob o entalhe ou a barra de
gestos. No mouse, nenhum alvo abaixo de 24 px.

## Um sistema só: o Portal do Distribuidor é o Helpoint

Mesma entrada, mesmo aplicativo, mesma cara; o menu muda pelo perfil. O distribuidor vê Meu dia, Salões, Meus pedidos,
Meu estoque, Agenda e Falar com a Minasflor. Detalhes e decisões abertas do portal: `docs/proposta-portal-distribuidor.md`.

## Aplicativo no celular: PWA

O Helpoint vira PWA para todos (equipe, distribuidor): manifesto com nome e logo, service worker (abre a última tela sem
internet, guarda o que foi escrito), aviso no celular (Web Push; no iPhone só instalado e iOS 16.4+), tela "Instalar o
Helpoint". Em 2026-10-24 não havia manifesto nem service worker (`public/` só tinha `robots.txt`). Loja (Capacitor) só
se um dia for pedido; não refaz tela.

## As sete decisões (dono, 2026-10-24)

1. **Saem do chamado e viram solicitação:** RH, Compras, Reembolso, Adiantamento, Arte e Acessos.
   (Reembolso e Adiantamento no Financeiro; Arte no Marketing; Acessos na TI.)
2. **Férias: só o RH aprova.** Depois que o RH aprova, o gestor do setor da pessoa **é avisado**. Onde: o dono deixou
   comigo; escolhi o **"Lyra avisa" do Meu dia** (onde todos os avisos já moram desde 2026-10-02) e, com o PWA, o
   **aviso no celular**, os dois levando às férias aprovadas. Não no Chat: mensagem automática enterra a conversa
   das pessoas e não abre a solicitação.
3. **O card RH some da grade** de abrir chamado; o pedido ao RH é só pelo Meu RH.
4. **A opção "Perfis" sai** do menu de permissões dos setores. Ela não faz nada: editar perfis continua só com dono e
   administrador.
5. **Diretoria vira setor** no menu de permissões, com "Ver" por tela.
6. **PWA** para todos.
7. **Portal: um login por pessoa** — o distribuidor e cada vendedor dele, com o distribuidor vendo tudo.

### Decisões da etapa 4b (dono, 2026-10-25)

- **Meu RH**: construir os sete pedidos e a tela de Solicitações do RH, e **ligar só quando o RH cadastrar os
  colaboradores** (em 2026-10-25 a produção tinha 0 colaboradores cadastrados; ligado, abriria vazio).
- **Reembolso e adiantamento** (Financeiro): o **gestor do setor** de quem pede aprova; depois o **Financeiro paga** e
  a solicitação vira conta a pagar.
- **Arte** (Marketing): o **Marketing aceita ou recusa** com motivo e entrega o arquivo na própria solicitação; sem
  aprovação do gestor de quem pede.
- **Acessos** (TI): o **gestor do setor** da pessoa aprova; a **TI libera** e marca como feito.

## As 19 regras que valem em toda tela

1. Desfazer em vez de "tem certeza?" (e confirmação em toda exclusão) · 2. A tela responde antes do banco ·
3. Um seletor de período · 4. Toda tabela busca, ordena e exporta · 5. Filtros no endereço da tela ·
6. Comparação em todo número · 7. Um número, uma conta, um lugar · 8. Ações com nome ·
9. Clicar no número abre a lista · 10. Lista longa carrega aos poucos · 11. Ajuda no campo, não em janela ·
12. Lyra só onde é IA · 13. Zero não ganha cor · 14. Números alinhados à direita ·
15. Vazio, carregando e erro no próprio bloco · 16. Teclado e toque valem o mesmo que o mouse ·
17. Voltar e atualizar não mudam de lugar · 18. Feito para o polegar (44 px, letra 16, barra de baixo) ·
19. Funciona com internet fraca.

## Os 20 defeitos (etapa 0)

1. RH · Aprovações: datas de férias um dia antes; atestado "recebido" aparece como "Rejeitado"; recusar não grava quem
   nem o motivo.
2. RH · avisos: decisão de férias e atestado leva ao Meu RH pausado, que joga no Início.
3. RH · Folha: editar célula não recalcula o líquido; gerar de novo apaga correções.
4. Qualidade · Configurações: "Campos do formulário" do SAC grava e o formulário do cliente não lê.
5. TI · Licenças: "Vencem este mês" e "Próximos 30 dias" mostram o mesmo número.
6. TI · Troca de equipamento: três gravações separadas; falha no meio deixa o inventário errado.
7. Compras · Catálogo: "Último preço" mostra o total, não o preço da unidade.
8. Compras · Indicadores: texto aponta o teto no Financeiro; os dois "tempos de aprovação" têm contas diferentes.
9. Financeiro · Fluxo de caixa: previsão inclui o pago e esquece vencidas de meses anteriores.
10. Financeiro · Contas: "Liquidar" grava sempre hoje.
11. Marketing · Cronograma: post não é editável.
12. Agenda: evento não é editável; o lembrete rápido do Início nasce vencido.
13. Chamados · configuração: a alça de arrastar não arrasta.
14. RH · Aprovações: aprovar ou recusar não fecha o chamado criado junto.
15. Apagar sem perguntar: as duas Caixinhas, estoque de Compras, estoque do Marketing, Jornal, Chat, anexo da notícia.
16. O aviso de prazo vencido volta a cada tela, mesmo depois de "Ver depois" (cada rota tem o próprio `StaffRoute`, o
    `AppLayout` remonta e o estado do `AvisoDePrazos` se perde).
17. Atualizar (F5) ou abrir link direto numa tela de setor leva ao Início (causa provável: `GuardaDoSetor` fica fora
    do `StaffRoute` e decide antes de o login carregar; a consulta de módulos desligada diz "não carregando"). Provar
    antes de consertar.
18. Abrir chamado: o botão fica cinza sem dizer o que falta.
19. Nova solicitação: "Voltar" apaga a descrição sem perguntar.
20. RH · Aprovações: "Recusar" num clique, sem confirmar; clique duplo grava duas vezes.

Também na etapa 0: as telas que perguntam uma coisa e o banco outra (Performance da equipe, Indicadores do SAC,
Diretrizes, restos de "Inventário" nas regras do Marketing).

## Andamento

- **Etapa 0 — feita em 2026-10-24** (CI #435 a #439, produção atualizada). Os 20 defeitos. Das telas que
  divergiam do banco: Performance da equipe passou a perguntar a caixinha da tela (`chamados_do_desempenho`);
  Indicadores do SAC ficou com "Indicadores", e a opção "Painel" saiu; as regras antigas de "Inventário" do Marketing
  ficaram só para o administrador (a tabela `mkt_assets` não tem mais tela, e o código que a contava saiu).
  **Diretrizes de Compras continua pedindo permissão de propósito**: é a decisão do dono de 2026-10-09 ("quem tem só
  Aprovar vê só Aprovar compras"); nos outros setores, quem é do setor lê.
- **Etapa 0b — feita em 2026-10-24/25.** "Perfis" e as opções mortas saíram do menu. Diretoria é setor, com "Ver" por
  tela (`dir_pode_ver`; Clientes, Produtos e Metas leem tabelas do Comercial e ali o "Ver" vale no menu e na rota — teto
  anotado na migration `20270130010000`). Quatro ações próprias em Chamados (abrir em nome de outro, chamar para atender
  junto, registrar viagem, criar e editar automações). TI "Conferir devolução"; RH "Reembolsos" (no menu); Financeiro
  "Relatório de compras" e "Ver todas as caixinhas"; Compras: quem aprova compra aprova a da Caixinha; Qualidade "SACs de
  clientes" e "Laudos" (escrever ≠ assinar); Educacional "Treinamentos". Tudo nasceu ligado para quem já passava; o Gestor
  do RH e o do Educacional ganharam o que só o administrador fazia na tela do próprio setor. Falta: o Estoque de Compras
  aparecer no menu de quem é responsável de Caixinha sem ter Compras.
- **Etapa 2 — primeira parte no ar (2026-10-25).** Tokens preto e branco (claro e escuro), Geist, sem sombra em nada
  parado, indicadores sem ícone em círculo (cor só no número que pede ação), logo no login; a Identidade visual da
  Minasflor passou a preto e Geist. **Desvio deliberado:** os tamanhos de letra ficaram os de 2026-10-06 (13 e 15 px no
  lugar de 12 e 14), porque o dono reclamou da letra pequena; a escala de cinco tamanhos vale para os novos.
- **Etapa 2b — no ar (2026-10-25).** Manifesto, service worker (página sempre da rede; sem internet, a última guardada),
  "Instalar o Helpoint" no menu da pessoa, barra de baixo até 860 px, 44 px e letra 16 no toque. Falta: aviso no
  celular (Web Push), que pede chaves VAPID e uma função no Supabase — entra com a etapa 4b (o aviso das férias).
- **Etapa 3 — no ar (2026-10-25).** Fila e Contas buscam, ordenam pela coluna e exportam (Excel); filtros de onze telas no
  endereço; Ctrl+K com ações, item aberto direto, Jornal e Diretrizes; Início "Meu dia" com três números e a régua do
  dia; indicador com comparação (`anterior` no `KPICard`). O seletor de período único e a comparação em cada número
  entram tela a tela na etapa 4, junto com o resto de cada módulo.
- **Etapa 1 — feita (2026-10-25).** "Feito · Desfazer" (8 s, `src/lib/desfazer.ts`): assumir e atribuir na fila, assumir e
  mudar status no chamado, liquidar no Financeiro. O banco só grava ao fim dos 8 s (gravar e desfazer com outra gravação
  dispararia de novo os avisos e as automações do chamado). "Mover compra" não existe: os quadros de Compras não arrastam.
  Confirmação em toda exclusão, ações com nome e aviso de prazo uma vez já vieram na etapa 0.

## Roteiro

| Etapa | O que entra |
|---|---|
| 0 · Defeitos | Os 20 acima e as telas que divergem do banco |
| 0b · Permissões | As opções que faltam no menu, tirar as que não valem ("Perfis" e outras), Diretoria como setor; toda opção nova nasce ligada para quem já entra |
| 1 · Sem susto | Desfazer, confirmação em toda exclusão, tela que responde antes do banco, ações com nome, aviso de prazo uma vez |
| 2 · Nova cara | O visual acima, feito nos componentes |
| 2b · Celular e aplicativo | PWA, barra de baixo, 44 px |
| 3 · Achar e decidir | Seletor de período, busca/ordenar/exportar, filtros lembrados, comparação, Ctrl+K, Início "Meu dia" |
| 4 · Módulo a módulo | Chamados, Comercial, Compras, Financeiro, RH, Diretoria, demais |
| 4b · Solicitações | Meu RH ligado e as solicitações da decisão 1, com o aviso da decisão 2 |
| 5 · Relatórios novos | Os 10 relatórios da proposta |
| 6 · Portal do Distribuidor | Dentro do Helpoint, no mesmo app |
