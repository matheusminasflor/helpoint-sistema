# Proposta — Indicadores da semana (TI primeiro)

Pedido do dono, 2026-11-01: levar para o Helpoint a planilha `GESTAO_MKT_E_TI_2.xlsx`, que ele preenche à mão e
apresenta ao diretor toda segunda-feira. **Complemento, não substituição.** O Marketing fica para depois (o dono vai
reavaliar); esta proposta é só da TI.

## O que a planilha de TI tem e o que o Helpoint já cobre

| Planilha (PAINEL TI) | Helpoint |
|---|---|
| HelpDesk Suporte geral, Forteplus, Forteplus Erro/Bug | **Já tem — não mexer.** A planilha só separava "Forteplus" e "suporte geral" porque antes não havia o Helpoint. TI › Indicadores mostra cada categoria, com período personalizado e análise por categoria (dono, 2026-11-01) |
| 3 · Demandas do Matheus (TI × MKT) | **Já tem — não construir** (decisão 4). TI › Indicadores filtra por colaborador e período; projetos ficam em Projetos |
| Interrupções (luz, sistema, internet, intranet, outras) ↓ | **Não tem** → registro próprio (decisão 2) |
| % Trabalho e % Ocioso da equipe; 2 · Produtividade por colaborador (FSENSE) | **Não tem** → aba nova (decisões 1 e 3) |

## Decisões do dono (2026-11-01)

1. **FSENSE: o Claude preenche, o dono confirma.** O FSENSE não tem API conhecida nem MCP (a busca só acha o
   pfSense, que é firewall), e o dono não consegue gerar relatório dele. Então:
   - o Helpoint ganha a tela de lançamento (uma linha por pessoa por semana) com uma caixa **Colar** que aceita a
     tabela copiada, e o botão **Confirmar semana**;
   - fazemos um teste com o dono olhando: o Claude abre o FSENSE no Chrome do dono (já logado por ele), lê a tela e
     cola no Helpoint. Se a leitura sair certa, vira tarefa semanal automática; se não (tela só em gráfico), o dono
     digita — uns 3 minutos;
   - **o que entra fica "a confirmar" até alguém clicar Confirmar semana**, e o painel só mostra semana confirmada.
     Um número lido errado não chega à reunião. O Claude nunca clica em Confirmar.
2. **Interrupções: registro próprio na TI** — tipo (luz, internet, sistema, intranet, outra), início, fim (vazio =
   ainda parado) e observação. Conta quantas na semana e as horas paradas. Queda não é pedido de ninguém, por isso
   não vira chamado.
3. **Quem vê a produtividade por pessoa: TI, dono/admin e Diretoria.** O FSENSE mede gente de outros setores; os
   outros gestores não veem.
4. **Demandas TI × MKT: o que existe basta.**

## Como fica

Aba nova **Semanal** em TI › Indicadores, com o seletor da planilha (competência + semana):

- **S1** = dias 1–7, **S2** = 8–14, **S3** = 15–21, **S4** = 22 ao fim do mês, ou **Mês inteiro**.
- **Comparativo**: mês inteiro → mês anterior; S2–S4 → semana anterior; S1 → S4 do mês anterior.
- **Farol**: verde na meta; amarelo até 70% da meta (ou até 130% quando menor é melhor, ↓); vermelho fora.
- **Metas mensais editáveis**: % Trabalho 65%, % Ocioso 20% ↓ (não dividem por semana), Interrupções 2/mês ↓ (a
  meta da semana é a mensal ÷ 4).

Blocos:

1. **Indicadores** — Interrupções (quantas e horas paradas), % Trabalho médio da equipe, % Ocioso médio da equipe:
   meta do período, anterior, realizado, comparativo, farol.
2. **Produtividade por colaborador** — quem tem lançamento confirmado no período: horas, % trabalho, % ocioso,
   anterior, comparativo, farol do ocioso.
3. **Lançar FSENSE** (data do fim da semana, linhas por pessoa, Colar, Confirmar) e **Interrupções** (lista e
   "Registrar interrupção").

Médias como na planilha: média simples das pessoas com valor > 0 no período; uma pessoa com várias linhas no
período usa a média das linhas dela (horas somadas).

**Histórico**: as linhas da aba FSENSE (desde janeiro) e as interrupções da aba TI - Lançamentos (desde maio) entram
uma vez, já confirmadas, para o comparativo funcionar desde o primeiro dia. As interrupções antigas só têm a
quantidade por semana, sem horário: entram como registros sem duração.

## Marketing

Parado até o dono reavaliar. O que foi medido em 2026-11-01 e pode servir depois: o Kommo responde leads por
segmento (37 em 22–31/10; a planilha tinha 0); o Reportei já tem as três contas do Instagram e a conta de anúncios
"MF INTERNO - Marketing" conectadas (@minasflor com 108.916 seguidores em 31/10).
