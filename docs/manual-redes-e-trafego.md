# Manual — lançar Redes sociais e Tráfego pago nos Indicadores do Marketing

Pedido do dono, 2026-11-03: enquanto a ligação com a Meta não traz os números sozinha, o Marketing lança à mão, uma
vez por semana. É o mesmo que as abas "MKT - Redes" e "MKT - Tráfego e Comunidade" da planilha GESTAO_MKT_E_TI.

## Onde

**Marketing › Indicadores › Visão Geral** › botão **Lançar semana** (no topo, ao lado de "Lançamento da semana", e no
bloco Redes sociais). Um formulário só, com uma aba "Tráfego e leads" e uma aba por conta. Aparece para quem tem, no
perfil do Marketing, **Indicadores › Lançar redes e tráfego** (dono e admin
sempre).

## A semana

- Escolha **qualquer dia da semana**: o Helpoint grava no **domingo que fecha a semana** (de segunda a domingo).
- Lançar de novo a mesma semana (e, em redes, a mesma conta) **substitui** o que estava.
- Campo em branco fica sem número (não vira zero).
- Os blocos somam as semanas cujo domingo está no período escolhido no topo da tela.

## Redes sociais — uma vez por conta, por semana

Contas: `@minasflor`, `@mf.pro`, `@by.mf` (pode escrever outra). No Instagram: perfil › **Painel profissional ›
Insights**, com o período da semana (segunda a domingo).

| Campo | O que é | Onde ver |
|---|---|---|
| Posts no feed | posts de foto ou carrossel publicados na semana | grade do perfil |
| Reels | reels publicados na semana | aba Reels do perfil |
| Sequências de stories | dias em que houve stories | Insights › Conteúdo compartilhado › Stories |
| Taxa de engajamento (%) | interações ÷ alcance × 100 | Insights › Interações e Alcance (faça a conta) ou o relatório que já usam |
| Novos seguidores | seguidores ganhos na semana | Insights › Seguidores › Seguiram |
| Quedas de seguidores | deixaram de seguir na semana | Insights › Seguidores › Deixaram de seguir |
| Total de seguidores | número no fim da semana (domingo) | perfil |
| Visitas ao perfil | visitas ao perfil na semana | Insights › Atividade do perfil |

Compartilhamentos saíram em 2026-11-04 (dono): o Insights da Meta não mostra o número, então não havia como conferir.

Na tela, cada conta mostra a **soma** das semanas do período; **seguidores** é o total da última semana e
**engajamento** é a média das semanas.

## Tráfego pago e leads — uma vez por semana

No **Gerenciador de Anúncios** (adsmanager.facebook.com), conta **MF Interno - Marketing**, período da semana.

| Campo | O que é |
|---|---|
| Investimento em tráfego (R$) | coluna "Valor usado" do total da conta |
| Alcance | coluna "Alcance" do total da conta |
| Visitas ao perfil (tráfego) | resultados "Visitas ao perfil do Instagram" das campanhas |
| Campanhas ativas | campanhas no ar no domingo |
| Leads — Distribuidor / Consumidor final / Salão | leads que entraram em cada funil do Kommo na semana |

Na tela: investimento, alcance, visitas e leads somam; **custo por visita** = investimento ÷ visitas; **campanhas
ativas** é o número da última semana.

## Histórico

Outubro de 2026 (semanas de 04, 11, 18 e 25/10) foi importado da planilha em 2026-11-03. O total de seguidores do
@minasflor estava digitado com ponto de milhar ("108.672") e entrou como 108.672 seguidores.

## Quando a Meta e o Kommo estiverem ligados

Estes números passam a vir sozinhos; o lançamento à mão continua possível para corrigir uma semana.

## Versão 3 (2026-11-03)

- **Um formulário só**: a aba **Tráfego e leads** (total da conta de anúncios e os leads de cada funil do Kommo,
  inclusive **Sem triagem**) e uma aba por conta, com as redes **e o tráfego pago daquela conta** (investimento,
  alcance, visitas ao perfil pelo anúncio, campanhas no ar). Em cinza, o número da semana anterior; o que já foi
  lançado vem preenchido. Investimento total em branco vira a soma das contas.
- **Novos e Deixaram de seguir** são lançados à mão (decisão do dono, 2026-11-03), até o coletor da Meta trazê-los.
  O **saldo** (total de um domingo menos o do anterior) aparece sempre e é exato.
- **Coletor da Meta** (`mkt-meta-coletar`): todo dia às 6h busca a semana em andamento; na segunda, fecha a que acabou.
  Só grava número que a Meta deu — nunca apaga o lançado à mão. Corrigir a semana que acabou: depois da coleta de
  segunda. Sem a conta de anúncios na ligação, só as redes chegam: conecte de novo marcando **MF INTERNO - Marketing**.
- O tráfego de outubro e da semana de 26/10 a 01/11 por conta veio do Gerenciador de Anúncios (campanhas
  "MINASFLOR – …", "MF.PRO – …" e "25 ANOS MINASFLOR"); o @by.mf não teve anúncio no período.

## Versão 4 (2026-11-04) — mais do Instagram

Proposta aprovada em https://claude.ai/artifact/38uLvZFcbX9kXD2efuQxqZ. Tudo vem do coletor; nada novo se lança à mão.
A conferência é sempre direto na Meta (Meta Business Suite › Insights), não no Reportei.

| Na tela | De onde vem | Onde conferir |
|---|---|---|
| Alcance e Visualizações (cartão da conta) | insights da conta, `reach` e `views` | Insights › Resultados |
| Melhores posts (3 por conta, pelo alcance) | insights de cada post e reels | Insights › Conteúdo, coluna Alcance |
| Alcance médio por publicação (reels, feed, stories) | idem; stories com o maior alcance visto enquanto no ar | Insights › Conteúdo |
| Quem segue (gênero, idade, Brasil, cidades) | `follower_demographics` do mês, em `mkt_publico_ig` | Insights › Público › Dados demográficos |
| Mais online (dia e hora, Brasília) | `online_followers`, últimos 30 dias, se a Meta entregar | Insights › Público |

- O coletor passa **a cada 3 horas** (era às 6h): é o que pega o alcance de cada story antes de ele sair do ar. O
  público do mês é buscado uma vez por dia (passada das 6h) e no "Buscar agora".
- Na segunda, a semana que acabou é buscada o dia todo (a Meta fecha os números com atraso); o total de seguidores dela
  sai só da passada da meia-noite.
- Ficaram de fora, a pedido do dono: **mensagens no Direct** e **cliques no link da bio** — a Meta não entrega esses
  números a sistemas de fora (2026-11-04).
