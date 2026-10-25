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
