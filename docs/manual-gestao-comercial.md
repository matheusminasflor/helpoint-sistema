# Manual da Planilha de Gestão Comercial Minasflor — a especificação dos indicadores do Comercial

> **O que é este arquivo.** O dono enviou em 2026-09-28 a planilha
> *Gestão_Comercial_Minasflor_Atualizada_Carteiras_e_Cadastros_3.xlsx* (11 abas) e o
> *Manual de Uso da Planilha de Gestão Comercial Minasflor* (versão setembro/2026), pedindo
> que isso vire os indicadores do módulo Comercial. **Este arquivo é a transcrição do manual**
> e é a especificação que o código obedece — quando o código e este texto divergirem, a
> divergência é defeito até alguém decidir o contrário e registrar aqui.
>
> A planilha em si não entra no repositório: tem CNPJ, endereço e telefone de clientes reais.
>
> **As decisões do dono sobre o porte** estão em `docs/plano-geral.md`, na LEVA O. A mais
> importante, e que contraria a primeira proposta: **os números vêm do lançamento da
> vendedora, como na planilha — não da nota fiscal importada.** O lançamento é o gancho que
> obriga cada vendedora a montar a carteira e manter o cadastro.

---

## Objetivo

Centralizar em uma única ferramenta o registro diário dos vendedores, a leitura gerencial dos
indicadores, o FAROL de ações, o acompanhamento das carteiras e a geração das metas comerciais.

- **Usuários:** Jaqueline, Fenício, Júlia e gestão comercial
- **Responsável pelo painel:** gestor comercial

**Regra principal: lançar corretamente uma vez para alimentar todos os painéis.**

## 1. Como a ferramenta está organizada

O vendedor registra o trabalho na sua aba individual; a Base de Clientes completa os dados
cadastrais; o Painel do Gestor consolida indicadores e ações; e as abas de carteira
transformam o histórico em acompanhamento e metas.

| Aba | Quem usa | Finalidade | O que pode ser editado |
|---|---|---|---|
| Painel do Gestor | Gestor | Selecionar a competência, definir metas dos indicadores e acompanhar o consolidado | Competência e metas |
| Base de Clientes | Gestor/administrador | Cadastro mestre, vínculo de vendedor, carteira, cliente de acompanhamento e situação em 120 dias | Somente campos cadastrais autorizados |
| Jaqueline / Fenício / Júlia | Cada vendedor | Registrar contatos, indicadores, ações, vendas, prazos e observações | Campos de lançamento; nunca colunas automáticas |
| VIP - Fenício / MG - Júlia / Outros Estados - Jaqueline | Gestor e o vendedor | Acompanhar a carteira, metas e resultados por cliente | Ajuste do gestor e competência do ajuste |
| Cadastro - &lt;vendedor&gt; | Vendedor e gestor | Solicitar cadastro; o gestor aprova e confirma a aplicação na base | Linha de solicitação; parecer do gestor |

**Fluxo recomendado:** selecionar o mês → lançar a atividade → concluir a venda → conferir o
painel → acompanhar carteira e metas.

**Responsabilidade.** O vendedor é responsável pela qualidade da origem: Cliente, Data,
Status, marcações Sim/Não, Valor, Prazo e Observações. O gestor é responsável pela
competência, metas dos indicadores, ajustes aprovados e manutenção da base.

## 2. Seleção do mês de trabalho

A competência é **Mês atual** (operação cotidiana: o primeiro dia do mês corrente) ou uma
competência explícita **MM/AAAA** (fechamento, auditoria, consulta histórica). Todos os
cálculos passam a usar a competência escolhida.

> **Atenção.** Antes de analisar qualquer número, confirme o mês exibido. Um lançamento com
> data fora do mês exibido não aparece naquele recorte, mesmo que esteja correto em outro mês.

## 3. Lançamento diário nas abas dos vendedores

**Cada interação ocupa uma linha**, registrada no dia em que ocorreu.

### 3.1 Campos

| Campo | Como preencher | Regra |
|---|---|---|
| Cliente | Selecione pela lista da Base de Clientes | Obrigatório para indicadores comerciais e vendas |
| Vendedor, Cidade/UF, Telefone | Não digite | Preenchimento automático a partir do cliente |
| Data | Data real da atividade | Define o mês e a semana dos painéis |
| Status | Em andamento, Agendado ou Concluído | **Vendas só somam com Concluído** |
| Indicadores comerciais | Sim quando ocorreu; senão Não | **Exigem Cliente e Data** para entrar no painel |
| Ações do FAROL | Sim quando ocorreu; senão Não | **Exigem Data; cliente é opcional** |
| Valor da venda | Valor efetivamente vendido | **Maior que zero e Status Concluído** |
| Prazo | Próximo prazo combinado | Prazos vencidos e não concluídos recebem alerta visual |
| Observações | Contexto, próximo passo, informação útil | Evite textos vagos como apenas "falado" |
| Cliente de acompanhamento, Classificação 120 dias | Não digite | Automáticos pela Base de Clientes |

**Uma linha por interação.** Se várias atividades aconteceram na mesma interação e na mesma
data, podem ser marcadas como Sim na mesma linha. Em datas diferentes, linhas diferentes.

### 3.2 Indicadores comerciais (14)

| Campo | O que representa |
|---|---|
| Contato para venda | Contato comercial realizado com o cliente |
| Venda ativa | Venda originada por atuação ativa do vendedor |
| Venda passiva | Venda originada pela procura do cliente |
| Passiva aumentada | Venda passiva cujo valor/escopo foi ampliado pela atuação do vendedor |
| Venda promocional | Venda vinculada a promoção |
| Marcar reunião técnica | Agendamento de reunião para dúvidas técnicas |
| Reunião técnica realizada | Reunião técnica efetivamente concluída |
| Venda de evento | Venda relacionada a evento |
| Evento realizado | Evento efetivamente realizado |
| Prospecção ativa | Contato de prospecção por iniciativa do vendedor |
| Prospecção passiva | Contato de prospecção por iniciativa do cliente |
| Contato inadimplente | Contato feito com cliente inadimplente |
| Venda inadimplente/inativo | Venda realizada para cliente inadimplente ou inativo |
| Demanda pontual | Demanda específica registrada para acompanhamento |

## 4. Ações e FAROL (12)

As ações alimentam o quadro **FAROL — AÇÕES REALIZADAS NO MÊS**, que conta quantas vezes cada
vendedor marcou Sim em cada ação dentro da competência exibida:

Campanhas · Eventos · Treinamento semanal com distribuidores · Pós-venda · Indicação de novos
distribuidores · Venda direta · Evento PCF · Proposta para diretoria · Dúvidas relacionadas aos
produtos · Pedido para evento · Pedidos gerais · Cashback

> **Por que uma ação pode contar sem cliente?** Campanhas, treinamentos e outras ações podem
> ser internas ou gerais. O FAROL exige Data válida e marcação Sim, mas não Cliente.

## 5. Os três cenários de lançamento

| Cenário | Cliente | Status | O que marcar | Valor | Resultado |
|---|---|---|---|---|---|
| **1. Contato sem venda** | O atendido | Em andamento ou Agendado | Contato para venda = Sim, e o que mais ocorreu | Vazio | Contato e indicadores entram; nenhuma venda soma |
| **2. Venda concluída** | O comprador | **Concluído** | O tipo correto de venda | **> 0** | Atualiza vendas, compradores, ticket, carteira, meta e última compra |
| **3. Ação interna** | Pode ficar vazio | Coerente com a execução | A ação (Campanha, Treinamento…) | — | Aparece no FAROL; não entra em indicador que exige cliente nem em venda |

## 6. Painel do Gestor

Consolida os lançamentos pela competência exibida. **A atribuição é feita pela aba em que o
lançamento foi registrado** — isto é, por quem lançou.

### 6.1 Os 19 indicadores por vendedor

Cada um tem **Meta** (o gestor define, por vendedor) e **Realizado** (automático):

1. Valor de venda acumulada do mês
2. % de vendas acumulada x meta
3. Quantidade de clientes com vendas no mês
4. Quantidade de clientes que relacionou
5. Quantidade de contatos para vendas
6. Número de vendas ativas
7. Número de vendas passivas
8. Número de vendas passivas aumentadas
9. Número de vendas de promoções
10. Marcação de reunião de dúvidas técnicas na semana
11. Reuniões de dúvidas técnicas realizadas no mês
12. Venda de eventos na semana
13. Eventos realizados no mês
14. Quantidade de contatos de prospecção ativa
15. Quantidade de contatos de prospecção passiva
16. Contatos feitos com inadimplentes
17. Vendas para inadimplentes ou inativos
18. Demandas pontuais na semana
19. Demandas pontuais em aberto

### 6.2 Cores de desempenho

| Cor | Condição | Leitura |
|---|---|---|
| Verde | Realizado igual ou acima da meta | Meta atingida ou superada |
| Amarelo | Abaixo da meta, mas em pelo menos 70% | Atenção: exige acompanhamento |
| Vermelho | Abaixo de 70% da meta | Ação corretiva prioritária |
| — | **Meta zerada** | Não existe referência válida; o gestor deve cadastrar a meta |

### 6.3 Mensais e semanais

"No mês" considera toda a competência. "Na semana" usa o recorte semanal, sempre condicionado
às datas dos lançamentos. **A Data é indispensável.**

## 7. Resumo comercial e os tickets

| Indicador | Como interpretar |
|---|---|
| Clientes na carteira | Atribuídos à carteira atual |
| Clientes ativos / inativos | Pela compra consolidada dos últimos 120 dias |
| Clientes relacionados | Distintos com algum lançamento no mês |
| Clientes compradores | Distintos com venda concluída e valor positivo |
| Relacionados sem compra | Trabalhados, mas sem venda concluída no mês |
| Vendas | Soma das vendas concluídas e positivas |
| Compradores e vendas ativos / inativos | A parte que pertence a ativos / a inativos ou reativados |

### 7.1 As três leituras de ticket

| Métrica | Fórmula | Responde |
|---|---|---|
| Ticket de clientes ativos | vendas de ativos ÷ **compradores ativos únicos** | quanto compra, em média, cada ativo que comprou |
| Ticket de inativos/reativados | vendas de inativos ÷ compradores inativos únicos | quanto compra cada recuperado |
| Média de venda da base ativa | vendas de ativos ÷ **total de clientes ativos da carteira** | a produtividade da carteira inteira, inclusive quem não comprou |

> **Diferença importante.** Os dois números não devem ser iguais. Exemplo do manual: 10 ativos,
> 2 compraram, R$ 20.000 → ticket de ativos R$ 10.000; média da base ativa R$ 2.000.

## 8. Dashboards das carteiras

Por cliente da carteira: código, cliente, tabela, UF-cidade, classificação 120 dias, última
compra; realizado histórico, média mensal, nº compras, recompra, % recompra; meta individual,
venda no mês, realizado %, diferença, situação da meta; contatos no mês, último contato,
status, próximo prazo, observações; meta automática, ajuste do gestor, competência do ajuste;
metas e compras de janeiro a dezembro.

Cabeçalho: meta total, venda total, diferença total e cobertura (venda ÷ meta).

## 9. Metas comerciais

### 9.1 Meta automática por cliente

1. Vendas concluídas e positivas do cliente nos **12 meses anteriores** à competência.
2. Soma ÷ **quantidade de meses em que houve compra** — média dos meses compradores, não do calendário.
3. × **1,20** (crescimento de 20%).
4. **Limita a mudança a −20% / +20% da meta anterior.**
5. Sem histórico válido: média mensal × 1,20.

Exemplo: 4 meses com compra somando R$ 40.000 → média R$ 10.000 → meta bruta R$ 12.000.
Com meta anterior R$ 9.000 (faixa R$ 7.200 a R$ 10.800) → **R$ 10.800**. Com meta anterior
R$ 15.000 (faixa R$ 12.000 a R$ 18.000) → **R$ 12.000**.

### 9.2 Ajuste aprovado pelo gestor

Valor autorizado + competência do ajuste. **Vale só naquele mês**; em outra competência volta
à meta automática. **Nunca digitar por cima** da meta individual nem da automática —
rastreabilidade e retorno automático à fórmula.

### 9.3 Metas dos indicadores

Diferentes das metas de venda por cliente: referências gerenciais de quantidade, valor ou
percentual, **por indicador e por vendedor**. O realizado é automático e não se digita.

## 10. Base de Clientes e classificação de 120 dias

Última compra **consolidada** = combina a última compra histórica com a última venda
registrada. **Ativo** até 120 dias desde ela; **Inativo** acima. **Reativação automática:**
quando um inativo recebe venda concluída, com data e valor positivo, a classificação passa a
considerar a nova data.

Cadastro de cliente novo: chave única, vendedor, carteira e cliente de acompanhamento
corretamente preenchidos. Nome divergente impede a ligação com a carteira e as metas.

## 11. Rotina

| | Vendedor | Gestor |
|---|---|---|
| **Diária** | Registrar cada interação no mesmo dia; atualizar status, prazo e observações; concluir vendas corretamente | Conferir pendências críticas e consistência |
| **Semanal** | Revisar prazos, atividades abertas e indicadores semanais | Acompanhar metas, cores, relacionados sem compra e FAROL |
| **Mensal** | Confirmar que todas as vendas e ações foram lançadas | Selecionar a competência, fechar indicadores, revisar carteira, validar metas e registrar ajustes |

## 12. Quando o número não aparece

| Sintoma | Verifique |
|---|---|
| Indicador não conta | Cliente vazio; Data vazia ou fora da competência; marcação diferente de Sim |
| Ação não aparece no FAROL | Data vazia/fora do mês; ação não marcada |
| Venda não soma | Status diferente de Concluído; valor vazio, zero ou negativo; cliente/data ausentes |
| Carteira não atualiza | Cliente de acompanhamento vazio ou divergente |
| Meta manual não entra | Competência do ajuste diferente da exibida |
| Cliente continua inativo | Venda não concluída, data incorreta ou valor não positivo |
| Cor do indicador não faz sentido | Meta zerada ou inadequada |
| Resultado em outro mês | Competência do painel diferente da Data do lançamento |

## 13. Erros que devem ser evitados

Digitar nas colunas automáticas · uma linha para atividades em datas diferentes · marcar todos
os indicadores como Sim sem que tenham ocorrido · registrar venda Em andamento ou Agendada e
esperar que some · valor sem Cliente ou sem Data · editar a meta individual ou a automática ·
criar cliente com nome diferente do cadastro oficial · analisar sem confirmar o mês exibido.
