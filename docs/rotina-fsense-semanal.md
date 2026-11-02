# Tarefa semanal — FSENSE → Helpoint (TI › Indicadores › Semanal)

Combinado com o dono em 2026-11-01 (`docs/proposta-indicadores-da-semana.md`, decisão 1): o FSENSE não tem API nem
MCP; o Claude lê a tela no Chrome do dono e lança no Helpoint; **quem confirma é o dono**. Provado na semana de
26/10 a 01/11/2026 (10 pessoas, números idênticos aos rótulos do gráfico).

## Quando

Segunda de manhã, para a semana de segunda a domingo que acabou. O Chrome do dono aberto, logado no FSENSE e no
Helpoint, com a aba do FSENSE dentro do grupo do Claude.

## Passos

1. **FSENSE**, `https://app.fsense.com/app/index.html#!/summary` (Resumo). No filtro **Data**, escolher a semana que
   acabou (segunda a domingo). Não mexer em mais nada.
2. **Ler pelo gráfico, não pela imagem.** O gráfico "Atividades por pessoa" é Highcharts; os números exatos (horas por
   categoria, por pessoa) estão em `Highcharts.charts.filter(Boolean)[1]`: o nome de cada barra no rótulo do eixo X
   (`xAxis[0].ticks[t].label.textStr`) e uma série por categoria (`series[].name`, `data[i].y` em horas).
3. **As contas, como o FSENSE e a planilha**: horas = trabalho + bloqueada + suspenso + ocioso (as séries "Uso de
   trabalho", "Estação de trabalho bloqueada", "Suspenso", "Tempo ocioso"); cada % sobre essa soma. "Uso pessoal",
   "Não classificado" e as outras ficam fora (é o mesmo total que aparece em cima de cada barra).
4. **Nomes**: trocar o login do FSENSE pelo nome do histórico (tabela abaixo). **Login que não está na tabela: não
   adivinhar** — lançar com o login e avisar o dono, que diz quem é (e a tabela ganha a linha).
5. **Helpoint**, TI › Indicadores › **Semanal** › Lançamentos do FSENSE › **Lançar semana**: dia que fecha a semana = o
   domingo; colar uma pessoa por linha (`Nome⇥horas⇥%trabalho⇥%bloqueada⇥%ocioso⇥%suspenso`); conferir a prévia e
   **Gravar**.
6. **Nunca clicar em "Confirmar semana".** Mandar ao dono a tabela lida (login → nome, horas e os quatro %) e avisar
   que está "A confirmar".

## Logins do FSENSE → nome no Helpoint

| FSENSE | Helpoint |
|---|---|
| jacqueline.cardoso | Jacqueline |
| gislene.almeida | Gislene |
| producao.minasflor | Rondinelly |
| fenicio.rocha | Fenicio |
| matheus.freitas | Matheus Freitas |
| vinicius.gomes | Vinicius |
| raquel.silva | Raquel |
| luciene.souza | Luciene |
| thayna.ramos | Thayna |
| lucas.gomes | Lucas |

Entram todos que o FSENSE mediu na semana (dono, 2026-11-01).
