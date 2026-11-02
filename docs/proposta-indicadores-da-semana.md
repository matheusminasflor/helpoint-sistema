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

> **Revisto no mesmo dia (dono, 2026-11-01)**: a primeira versão tinha uma aba "Semanal" com o seletor S1–S4 da
> planilha. O dono recusou: "se já tem como personalizar o período, precisa mesmo ter campo semanal?". Ficou um filtro
> só para a tela inteira (revisão dos Indicadores da TI com as Leis de UX, aprovada no mesmo dia).

Bloco **Equipe** na Visão Geral de TI › Indicadores, no filtro de período da tela (Semana passada, Esta semana, Mês
passado, Este mês, Personalizado):

- **Comparação**: com o período anterior do mesmo tamanho, como os outros indicadores.
- **Farol**: verde na meta; amarelo até 70% da meta (ou até 130% quando menor é melhor, ↓); vermelho fora.
- **Metas mensais editáveis** (Diretoria): % Trabalho 65%, % Ocioso 20% ↓ (valem para qualquer período),
  Interrupções 2/mês ↓ (proporcional aos dias do período: 0,5 numa semana).

Conteúdo:

1. **Indicadores** — Interrupções (quantas e horas paradas), % Trabalho médio da equipe, % Ocioso médio da equipe:
   meta do período, anterior, realizado, comparação, farol.
2. **Por colaborador** — quem tem lançamento confirmado no período: horas, % trabalho, % ocioso, anterior, farol do
   ocioso. O "anterior" da equipe é só de quem está no período (regra da planilha).
3. **Lançar semana do FSENSE** numa grade como a planilha (nomes da semana anterior, colar a tabela numa célula, soma
   dos % = 100%), a semana "a confirmar" até **Confirmar semana**, lápis para corrigir; **Interrupções** (lista e
   "Registrar interrupção"). A semana fecha na sexta (a tarefa roda sexta às 17h40).

Médias como na planilha: média simples das pessoas com valor > 0 no período; uma pessoa com várias linhas no
período usa a média das linhas dela (horas somadas).

**Histórico**: as linhas da aba FSENSE (desde janeiro) e as interrupções da aba TI - Lançamentos (desde maio) entram
uma vez, já confirmadas, para o comparativo funcionar desde o primeiro dia. As interrupções antigas só têm a
quantidade por semana, sem horário: entram como registros sem duração.

## Rodada 2 (dono, 2026-11-02)

Proposta: https://claude.ai/artifact/8KiJeDHv7ZoM51iMDecrcU. Aprovadas as quatro recomendações.

**Falhas a corrigir:**

1. A semana do FSENSE é gravada sempre no domingo, e lançar de novo substitui. Antes, a grade sugeria a sexta e o histórico usava o domingo, então a mesma semana podia entrar em dobro.
2. O status por pessoa vale o pior entre % trabalho e % ocioso. Antes, a tela bloqueada a 92,5% saía "No alvo".
3. "Semana do FSENSE a confirmar" aparece em "Atenção agora".
4. O PDF leva tudo o que a Visão Geral mostra.
5. Os rótulos do Analítico se separam em "na semana" e "agora":
   - "Agendou com o prazo já vencido";
   - "SLA violados" na semana e "fora do prazo agora";
   - coluna "Outros status" para a linha de categoria fechar;
   - abaixo de 20 chamados, a variação é a diferença ("+6") e não a porcentagem.

**Metas padrão:** você ajusta em Configurações de TI › Metas, com o mercado ao lado.

| Indicador | Meta padrão |
|---|---|
| SLA cumprido | 90% |
| 1ª resposta no prazo | 90% |
| Tempo médio de resolução ↓ | 8 h |
| % trabalho | 60% |
| % ocioso ↓ | 15% |
| Interrupções ↓ | 2 por mês |

- **Origem:** SLA e 1ª resposta seguem a prática de contrato de suporte, de 90% a 95%.
- **Trabalho e ocioso:** vêm do histórico, com 158 semanas por pessoa (mediana de 54,9% de trabalho e 14,8% de ocioso). O mercado fica em cerca de 50% produtivo (WorkTime e Hubstaff).
- **Amarelo:** em percentual, até **10 pontos abaixo** da meta (antes era até 70% da meta). Em tempo e quantidade, a regra antiga continua.
- **Quem muda:** quem tem "Configurar" na TI e quem define metas na Diretoria. A tabela é a mesma de hoje, `dir_metas_dos_setores`.

**Projetos:** os Indicadores leem o módulo Projetos, só os projetos em que a TI participa. Os 5 abertos da aba DEMANDAS da planilha entram uma vez, com o término dela:

- Sistema Helpoint;
- Sistema IA do Distribuidor;
- Tráfego pago Power Complex;
- Migração do site para a VPS Hostinger;
- Infraestrutura.

**Telas:**

- **Visão Geral** em 5 blocos:
  - atenção agora;
  - frase de resumo montada com os números, sem IA;
  - chamados, com meta, cor e as últimas 8 semanas;
  - equipe;
  - projetos.
- **Equipe em barras**, uma por pessoa: trabalho, tela bloqueada, ocioso e suspenso, com a linha da meta.
- **Analítico**, ex-"Análise Detalhada", com um índice por seção.
- **Modo apresentação**, uma tela por vez, como slides:
  1. Resumo;
  2. Chamados;
  3. Categorias;
  4. Equipe;
  5. Projetos.

  Avança pela seta ou pelo clique; Esc sai.
- **Tarefa de sexta:** a mensagem pergunta se teve queda na semana.

**Ordem de entrega:**

1. As falhas, as metas, as barras e a tabela enxuta.
2. Projetos.
3. A Visão Geral e o Analítico.
4. O modo apresentação e o PDF.

## Rodada 3 (dono, 2026-11-02)

Proposta: https://claude.ai/artifact/Syu6gZsfGyds6BpHNRmRUY.

- **Meta em escada.** A TI tem 1 pessoa no helpdesk e o dono, que é Líder de Recursos Operacionais e atende quando
  dá. Projetos de infraestrutura param o helpdesk; essas paradas são registradas como pausa do setor.
  - O SLA por semana foi 100%, 83%, 88%, 71% e 76% (média de 80% nas últimas 4 semanas). Com isso, 90% não se sustenta.
  - Degraus padrão:

    | Indicador | Nov–dez | Jan–fev | A partir de mar |
    |---|---|---|---|
    | SLA | 80% | 85% | 90% |
    | 1ª resposta | 85% | 90% | 90% |
    | Tempo médio | 24 h | 16 h | 12 h |
    | Trabalho | 55% | 60% | 60% |
    | Ocioso | 20% | 15% | 15% |
    | Interrupções | 2 por mês, sempre | | |

    O tempo médio conta horas corridas: os 8 h da rodada 2 estavam errados.
  - O dono muda os degraus em Configurações de TI › Metas.
  - A tela mostra a meta do mês e o próximo degrau.
  - O período usa o degrau que vale no último dia dele.
- **Total de chamados.** Um quinto cartão, "Total de chamados", e "Chamados resolvidos" continua.
- **Eficiência por pessoa.** No Analítico, a "Equipe por semana" é trocada pela "Eficiência por pessoa", que obedece
  ao filtro de período da tela.
  - As cores são as mesmas: verde, amarelo e vermelho.
  - Mostra horas, % trabalho, % ocioso, o anterior e o status.
- **Jornal.** Toda notícia de melhoria sai no tom de comunicado da empresa (memória do dono).
  - As notícias de 30/10 a 02/11 são reescritas.
  - As duas sobre notícias viram uma só.
  - As duas dos Indicadores da TI viram uma só, nova, para a TI e a Diretoria; as antigas saem do Jornal.
- **Projetos.** Ficam para depois: o dono vai trazer os pontos.

## Marketing

Parado até o dono reavaliar. O que foi medido em 2026-11-01 e pode servir depois: o Kommo responde leads por
segmento (37 em 22–31/10; a planilha tinha 0); o Reportei já tem as três contas do Instagram e a conta de anúncios
"MF INTERNO - Marketing" conectadas (@minasflor com 108.916 seguidores em 31/10).
