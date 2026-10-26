# Rodada 3 — uma porta por setor, Lyra desligada, catálogo na liberação, admissão pelo RH

Pedido do dono em 2026-10-26, depois de fechada a rodada 2 ("as solicitações e chamados ficaram confusos").

## Medido (produção, 30 dias, 2026-10-26)

- Chamados: TI 100, Marketing 55, RH 9, Financeiro 9, Comercial 8, Expedição 5, Educacional 4, Produção 3,
  Qualidade 1. Pedidos: só os 9 de compra. **Nenhum pedido de arte** desde 25/10: o Marketing segue recebendo
  chamado ("Outros" 21, "Criação de Arte" 9). No Financeiro ainda entrou 1 chamado "Reembolso".
- A Lyra: o "Ativar Lyra" (`tenants.settings.lyra.enabled`) só é lido pela função `ai-secretary`; nenhuma tela o
  respeita. Sem chave de IA na produção, o chat e os botões de IA falham.
- Aviso no celular: `push_inscricoes` vazia — ninguém inscreveu aparelho; o botão só existe em Todos os avisos. O
  robô `avisos-push` roda a cada minuto e responde 200.
- Portal: o botão "Pedir na MF / INBRAS" lê `conecta_catalogos`, que só se enche com as chaves do Conecta.
- Admissão: o chamado escolhe a pessoa entre quem tem login — o funcionário novo não tem.

## Decisões do dono (2026-10-26, as quatro iguais à recomendação)

1. **Uma porta por setor.** RH, Financeiro e Compras: só pedido (aprovação e etapas). Marketing, TI e os demais: só
   chamado. O pedido de arte e o pedido de acesso voltam a ser chamado.
2. **Lyra desligada:** some o que usa IA (Pergunte à Lyra, refinar texto, busca com IA); o painel de avisos da tela
   inicial fica, com o nome "Avisos". O "Ativar" passa a valer na tela.
3. **Catálogo do Conecta colado na liberação** do distribuidor (link MF e link INBRAS da tabela dele); as chaves do
   Conecta deixam de ser pré-requisito.
4. **Admissão pela lista do RH:** o chamado (ou pedido) de admissão escolhe o novo funcionário entre os colaboradores
   do RH, antes de ele ter login.

Segunda rodada (2026-10-26):

5. **Um pedido por setor, com assunto:** "Pedido ao RH" e "Pedido ao Financeiro"; o assunto é a lista das categorias
   de hoje; etapas Pedido → Em andamento → Concluído. Reembolso, adiantamento e compra seguem com os seus caminhos.
6. **O pedido tem o prazo do setor** (o mesmo dos chamados), e o "Fora do prazo" da Performance segue contando.
7. **Os chamados abertos do RH e do Financeiro viram pedido** (com a conversa), como as compras na R2.
8. **Admissão e desligamento: o RH manda para a TI, sem gestor no meio** (o dono recusou "pedido ao RH que avisa a
   TI"): o RH registra a admissão ou o desligamento do colaborador e a TI recebe o chamado de acessos e equipamentos,
   já com a pessoa da lista do RH.

## Revisão das decisões 1, 5, 6 e 7 (dono, 2026-10-26, depois de medir o custo)

Medido: o pedido (`solicitacoes`) não tem atendente, prioridade, prazo com pausas, responsável da categoria, repasse
nas férias, automações nem relatórios — fazer RH e Financeiro "só pedido" por dentro seria reconstruir tudo isso.
O dono pediu o projeto visual. A primeira versão (https://claude.ai/artifact/Jj9z2NuZrywtunN1peuprU) foi recusada em
três pontos: RH e Financeiro têm de ser **Pedido** junto com Compras; quem pede **não** pode ver se vai ao gestor ou ao
atendente (induz a escolher a categoria errada); o Meu RH não pode duplicar o Novo. E o visual preto e branco foi
recusado ("simplório, cara de IA, cores fracas"). Segunda versão, com cor, celular e as 15 correções da auditoria:
https://claude.ai/artifact/6CMeXsn28WsqckWhiuSgTT — "Pedido" é o nome que quem pede vê (etapas traduzidas, como no
portal do Jira); por dentro o RH e o Financeiro seguem com prazo, responsável e relatórios.

**APROVADO pelo dono em 2026-10-26: "tem que ser igual foi projetado nesse documento".** O documento publicado é a
especificação (fonte em `docs/proposta-rodada-3-visual.html`). As cinco escolhas = as recomendadas:
1. Marca **Petróleo #0F5E73** (escuro: #6CC4D9).
2. Barra de baixo do celular: **Início · Meus · Novo · Avisos · Menu**; o Chat vai para o Menu.
3. Letra **Inter**, com o corte Display (eixo `opsz`) nos títulos; sai a Geist.
4. Etapas que quem pede vê: **Recebido → Com o setor → Concluído**, mais **Esperando você** quando falta algo dele;
   a aprovação do gestor fica dentro de "Com o setor".
5. Ordem **A (cor e peças de base) → B (uma porta só) → C (celular, telas principais) → D (celular, telas de setor)**.

Paleta da especificação:
- Estado (fundo · texto · ponto): Recebido #E9EAED · #44464D · #7D818A; Com o setor #E9F2FE · #1558BC · #1868DB;
  Esperando você #FFF5DB · #9E4C00 · #C27C0E; Atrasado #FFECEB · #AE2E24 · #C9372C; Concluído #DCFFF1 · #216E4E · #22A06B.
- Setor (fundo · texto): TI #CFE1FD · #1558BC; Marketing #FDD0EC · #943D73; Qualidade #C6EDFB · #206A83; Comercial
  #BAF3DB · #216E4E; Educacional #EED7FC · #803FA5; Expedição #FCE4A6 · #9E4C00; Produção #D3F1A7 · #4C6B1F; RH #F5E989 ·
  #7F5F01; Financeiro #FFD5D2 · #AE2E24; Compras #DDDEE1 · #505258.
- Fundo #F6F7F8, cartão #FFFFFF, texto #000000 (decisão de 2026-10-06), secundário #5B5E66, borda de campo #8A8D93 (3,3 : 1).

## Ordem

- **R3a:** Lyra desligada na tela; botão do aviso no celular à vista; link do catálogo na liberação do distribuidor.
- **R3b:** uma porta por setor (arte e acesso voltam a chamado; Pedido ao RH e ao Financeiro com assunto e prazo;
  os abertos viram pedido); admissão e desligamento saindo do RH para a TI.

Feito na hora (pedido direto do dono): a pessoa desativada que ainda entrava foi bloqueada (`banned_until`); Matheus
Freitas virou Gestor do RH. TI, Compras e Marketing ficam sem perfil de gestor: `gestores_da_pessoa` já cai no dono.
Sai da lista de pendências: e-mail (funciona) e o valor semanal da Caixinha (é só sugestão).

## Andamento (projeto aprovado)

- **R3a no ar (2026-10-26, CI #535, produção 67d7ba40):** Lyra desligada na tela (`iaLigada`), link do catálogo na
  liberação do distribuidor (migration `20270211010000`), "Receber avisos no celular" no Perfil. Lyra desligada no banco.
- **A no ar (CI #536 e #537, produção e136519c):** paleta (estado, setor, marca Petróleo), Inter, pílula `.estado-*`,
  `ChipDoSetor`, diálogo como folha de baixo no celular, abas que rolam, contrastes. A "Identidade visual" gravada no
  banco passou a Petróleo e Inter. Lição: classe montada por texto (`estado-${x}`) some na compilação — vai no
  `safelist` do Tailwind.
- **B no ar (CI #538, produção fbed1104):** Novo de uma porta só (setor → assunto → formulário, passo no endereço),
  `estado-para-quem-pediu` (Recebido → Com o setor → Concluído + Esperando você), `/meus`, barra Início · Meus · Novo ·
  Avisos · Menu, Meu RH como consulta, arte e acesso de volta a chamado.
  **Não feito na B, fica para decidir com o dono:** a admissão pela lista do RH (decisão 8) não estava no documento
  aprovado; o assunto "Admissão / Desligamento" continua no Novo › RH como antes. Os 3 chamados abertos do RH e do
  Financeiro (decisão 7) não foram convertidos: na revisão eles continuam chamado por dentro, só aparecem como "Pedido".
- **C e D:** ver o commit "celular - Inicio, formulario, detalhe, toque, Agenda, Chat e Comercial".
