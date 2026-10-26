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

## Ordem

- **R3a:** Lyra desligada na tela; botão do aviso no celular à vista; link do catálogo na liberação do distribuidor.
- **R3b:** uma porta por setor (arte e acesso voltam a chamado; Pedido ao RH e ao Financeiro com assunto e prazo;
  os abertos viram pedido); admissão e desligamento saindo do RH para a TI.

Feito na hora (pedido direto do dono): a pessoa desativada que ainda entrava foi bloqueada (`banned_until`); Matheus
Freitas virou Gestor do RH. TI, Compras e Marketing ficam sem perfil de gestor: `gestores_da_pessoa` já cai no dono.
Sai da lista de pendências: e-mail (funciona) e o valor semanal da Caixinha (é só sugestão).
