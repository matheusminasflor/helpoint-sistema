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
