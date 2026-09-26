# Plano geral — o que falta no Helpoint

Escrito em 2026-09-25, a pedido do dono ("me passe planejamento completo"),
a partir do **repositório**, não de memória: cada item abaixo tem origem
citada em `docs/nao-funciona.md`, `docs/decisoes.md`, nos planos de
`.scratch/` ou nas suítes de `supabase/tests/database/`.

**Ordem recomendada em uma linha:** consertar o que eu errei → fechar as
portas de segurança → ligar o aviso que não existe → terminar o que o dono
pediu → limpar os defeitos pequenos → só então o que é novo.

---

## O que já existe e funciona

Para o planejamento não parecer que o sistema está vazio. Com prova pgTAP:

| Área | Estado |
|---|---|
| Chamados (TI, RH, Marketing, Qualidade, Financeiro, Comercial, Educacional, Expedição) | funciona |
| CRM (funil, contatos, negócios, produtos, pedidos, importação, indicadores) | funciona — a área mais coberta, 9 suítes |
| Automações (fluxos, modelos, ramificação, worker) | funciona |
| Projetos e quadro (kanban) | funciona |
| Chat interno (canais, menção, conversa direta) | funciona |
| Educacional (treinamentos) | funciona |
| Notificações (o sino, todos os módulos) | funciona |
| Metas / OKR | funciona |
| Comercial e Diretoria (Insights, ficha, curva, cashback, conciliação) | funciona |
| Expedição e estoque por lote | funciona (um depósito só) |

---

## ~~LEVA A~~ — FEITA em 2026-09-25

**Feita.** A palavra "publicidade" saiu do sistema; a remessa gratuita voltou
a ser um número só, das duas séries; o farol passou a contar as duas.

Em 2026-09-25 eu tratei toda a bonificação da **série 1** como publicidade,
a partir da lista de UM cliente. O dado da base inteira nega: **98,7% do
valor da série 1 é produto que também é vendido** (OJON MÁSCARA 1KG,
R$ 232 mil; STYLO REPARADOR, R$ 136 mil), e só 1,3% é material que nunca
foi vendido (sacola, avental, sachê).

A natureza da operação — o campo que separaria de verdade — **não vem no
export do Forteplus** (44 colunas conferidas: tem CFOP e série, não tem
natureza).

O que muda:

1. o rótulo "Publicidade (série 1)" vira **"Remessa gratuita com nota"**,
   na ficha, na Diretoria → Clientes, no Painel Comercial e na Conciliação;
2. a coluna `publicidade` some do banco — nome que mente é defeito, não
   estética;
3. **o farol passa a contar as duas séries.** Hoje ele exclui R$ 2,15
   milhões de produto dado de graça, e por isso deixa de apontar
   **3 clientes e R$ 70 mil**:

   | | Hoje | Corrigido |
   |---|---|---|
   | Recebeu sem comprar | 9 clientes · R$ 222.086,71 | **10 · R$ 292.262,15** |
   | Recebeu mais do que comprou | 14 clientes | **16** |

4. a Conciliação mostra as duas linhas de remessa gratuita, nenhuma
   chamada de publicidade.

**Não muda:** a separação venda com nota × venda sem nota, que está certa e
provada (o informado do diretor bate com a venda série 1 com 0,49%).

---

## ~~LEVA A2 — Insights precisos~~ — FEITA em 2026-09-25

**Feita.** Pedido do dono logo depois da leva A: "o relatório de insights
comercial e diretor precisa estar 100% preciso e funcional. Me preocupo com os
dados fugirem da realidade."

Eram três defeitos, nenhum deles uma conta errada:

1. **duas classes de CFOP não tinham caixa em tela nenhuma.**
   `com_classe_do_cfop` produz cinco classes; as telas tinham três. R$ 243.989,69
   entravam pela importação e não saíam em lugar nenhum. Soma incompleta não
   parece errada — parece menor;
2. **`unidades` contava por duas fórmulas diferentes** em duas funções que
   mostram o mesmo rótulo. Iguais enquanto não houver devolução; 10 contra 9 na
   primeira;
3. **"Realizado no período", no Resumo da Diretoria, é a planilha do diretor** e
   nada na tela dizia isso. A diferença contra o ERP, em 2026, é de
   **R$ 401.302,64** — venda série 75, cobrada e não registrada.

O que entrou:

- **`com_caixas`** (migration `20261027010000`) — uma conta só, num lugar só,
  com caixa para as cinco classes, o total importado da janela e a SOBRA entre
  os dois. Sem `p_serie`: a série é coluna, porque com filtro as caixas
  deixariam de fechar. `com_faturamento_mensal` passou a contar unidades pela
  mesma coluna gerada que o painel;
- **`CaixasDoPeriodo`** — um componente, duas telas (Comercial → Vendas e
  Diretoria → Conciliação). O dono não pergunta "quanto deu no Comercial" e
  "quanto deu na Diretoria": ele pergunta quanto deu;
- **"O que o ERP importou nos mesmos meses"** no Resumo da Diretoria, com a
  conta que `com_conciliacao` já fazia — nenhum cálculo novo, só posta onde o
  diretor olha primeiro;
- **`comercial_caixas_fecham.test.sql`** (10 asserções) — o fechamento, a
  concordância entre as três funções, as duas janelas, o isolamento por empresa
  e `anon` sem `EXECUTE`. A guarda estrutural compara a lista de classes que o
  CHECK da tabela aceita com a lista de caixas da função: classe nova sem caixa
  reprova ali, antes de o dinheiro sumir de alguma tela.

**Fica registrado como dívida pequena:** a Curva ABC de Vendas não escuta o
filtro de série (`com_curva_abc` não tem `p_serie`) — a tela deixou de prometer
o recorte, mas dar o parâmetro à curva é migration própria e o dono não pediu.

### O quarto número: cashback (mesma leva, 2026-09-25)

O dono listou quatro coisas; o cashback era a única que a Diretoria **não tinha
em tela nenhuma**. E ligar a tela não bastava: o número chegaria **zero, em
silêncio**, porque `com_faixas_cashback` liberava SELECT só para o Comercial e as
funções de cashback leem com os poderes de quem chama. Medido: 0,00 para o
diretor puro contra 120,00 para o Comercial, na mesma empresa.

**MUDANÇA DE RLS — precisa do seu olho.** A migration `20261027020000` recria
**uma** policy: a de SELECT de `com_faixas_cashback`, que passou a aceitar
"Comercial **ou** Diretoria" — a mesma condição, palavra por palavra, que
`com_vendas_itens`, `com_clientes`, `com_produtos`, `com_metas`,
`com_carteira_membros` e `com_carteira_renomeacoes` já usavam. As policies de
INSERT/UPDATE/DELETE **não foram tocadas**: quem configura faixa continua sendo
quem tem `tem_permissao(..., 'cashback', 'configurar')`. O diretor passou a ler,
não a administrar, e há asserção de pgTAP para cada uma das duas metades.

Na tela: "Cashback apurado em {ano}" entrou ao lado das caixas, na Conciliação,
com a frase que impede a soma errada — **apurado e entregue não se somam**, seria
contar a mesma mercadoria duas vezes. Nos dados de teste de 2026: cashback
apurado **R$ 170.559,81** (4,50% do comprado) contra bonificação entregue
**R$ 2.934.616,89**, e 7 clientes fora da conta (6 com tabela sem faixa, 1 sem
tabela no cadastro) — a linha nomeia quantos e por quê, senão o total pareceria
cobrir todo mundo.

---

## ~~LEVA B — As portas que ficaram abertas~~ — FEITA EM PARTE, 2026-09-25

**Feito:**

- ~~**`anon` tem `EXECUTE` nas RPCs.**~~ Eram **185 das 246** funções do schema,
  não só as do Comercial. Agora são **21** não-gatilho: 5 portas públicas de
  verdade (formulário do site, proposta por token, aceitar convite, portal do
  SAC, e `get_tenant_by_hostname`, que a edge function `tenant-resolve-host` chama
  com a chave anon) e 16 que a RLS chama de dentro das policies. Migration
  `20261028010000`, guarda em `anon_so_nas_portas_publicas.test.sql`.

  **A armadilha era outra do que eu escrevi na leva A2.** Eu disse que o acesso
  vinha de um grant direto do `alter default privileges` da Supabase; isso vale
  para função nova e **não como regra geral**. O caminho principal é o `=X` de
  **PUBLIC** no `proacl` — o padrão do Postgres, em todas as 167 funções
  não-gatilho. Revogar só de `anon` não mudou nada. Tem de revogar dos dois. E
  `authenticated` também dependia de PUBLIC em 28 funções, então a migration
  concede a `authenticated` **antes** de revogar PUBLIC, ou o sistema cairia para
  todo mundo;
- ~~**três funções que escrevem sem perguntar quem chama**~~ saíram de `anon` e de
  `authenticated`: `seed_default_access_profiles` (gravava perfil de acesso em
  qualquer empresa), `create_ticket_checklists_for_ticket` e
  `sync_ticket_checklist_status` (marcava checklist como concluído, derrubando a
  trava que impede fechar chamado com checklist pendente);
- ~~**diretor puro alcança o Insights do Comercial pela URL**~~ — `RequireComercial`,
  mesma régua de `has_comercial_access`. Na verdade era **qualquer pessoa
  logada**, e o estrago não era vazamento: a tela aparecia inteira zerada
  ("Faturamento R$ 0,00"), porque a RLS devolve zero linha sem erro;
- ~~**duas das três issues de segurança**~~ — `check-alerts` e `mkt-publish-due`
  **já estavam corrigidas** no código e ficaram três semanas marcadas como
  abertas. Conferido no código e no banco. **Mas conferir se o par funciona achou
  um defeito novo:** o `check-alerts` estourava o tempo do cron **toda hora**,
  seis horas seguidas, e `cron.job_run_details` dizia `succeeded` porque mede o
  enfileiramento, não a resposta. Corrigido na `20261028020000` (60 s em vez dos 5
  s padrão do `pg_net`).

- ~~**três funções `security definer` esquecidas pela lista de fechaduras**~~ —
  `automation_tick_deal_idle` (varria os fluxos de todas as empresas, sem filtro
  de tenant; a irmã `automation_tick` estava fechada desde setembro) e o par
  `rh_calc_inss`/`rh_calc_irpf`, que recebe o tenant e lê a tabela de imposto
  daquela empresa. Fechadas junto das 26 que já existiam.

**O ERRO QUE EU COMETI NESTA LEVA, porque ele vale mais registrado que escondido:**
a primeira versão da migration concedia a `authenticated` sem testar se a função
já era alcançável, e **reabriu 26 funções que quinze migrations anteriores tinham
fechado a dedo** — o motor de automação, `notify_users`, `crm_whatsapp_receber`,
`exp_pick_lot`, `tenant_set_config`, as sementes. O CI pegou duas, porque só duas
tinham teste. Pior: eu medi o banco **depois** de aplicar a versão errada e
escrevi a medição como achado — a primeira redação da issue 05 listava 22 funções
"abertas" que eu mesmo tinha acabado de abrir.

Ficou no código o que impede a repetição: `scripts/funcoes-so-por-dentro.mjs`
extrai a lista do repositório, a migration reafirma as 29 fechaduras antes de
qualquer grant, e a asserção 8 prende a classe inteira (antes eram 26 casos com 2
asserções).

**Fica aberto:**

1. **vazamento de sim/não sobre um uuid** — `get_user_role`, `has_role`,
   `is_admin`, `tem_permissao` e companhia respondem "este uuid é admin?" para
   quem está logado, e dezesseis delas **têm de** ficar abertas até para `anon`,
   porque as policies deste sistema são escritas em função. Fechar exige reescrever
   as policies: não é leva de segurança, é leva de arquitetura;
2. **a terceira issue** (`mkt_artist_contracts` com duas chaves estrangeiras na
   mesma coluna, tabela ininserível) — a própria issue diz "é decisão de domínio,
   não de schema. Não corrigir sozinho": `mkt_artists` e `mkt_influencers` são a
   mesma coisa renomeada, ou dois conceitos?;
3. **RLS de `tickets` por módulo** (decisão D12 do plano da Fase 3): hoje a
   separação por módulo é feita só no navegador. É mudança de RLS no coração do
   sistema e precisa do seu aval.

---

## ~~LEVA C — O aviso que não existe~~ — FEITA em 2026-09-26

O dono viu os três desenhos e escolheu: **vermelho no canto, saindo sozinho** —
que já é o padrão dos outros avisos do sistema, então não é coisa nova de
aprender.

`src/App.tsx` montava o cliente de consultas sem tratamento de erro, então toda
leitura recusada morria em silêncio e a tela mostrava vazio. Eu já havia
corrigido tela a tela quatro vezes, sempre depois de uma auditoria apontar.

A frase diz o que importa: "o que aparece pode estar **incompleto**". O perigo
nunca foi a tela vazia — foi a tela com menos dado parecendo completa. O detalhe
técnico do Postgres vai na segunda linha, porque quem opera este sistema hoje é a
própria TI.

Quatro decisões, cada uma com motivo: só nas leituras (as escritas já avisam, e
somariam dois toasts); `id` fixo, para oito falhas simultâneas darem UM aviso;
sessão vencida cala, porque o login já derruba e "não consegui ler" contaria a
história errada; e é o CHÃO — as telas que já tratam erro com texto próprio
continuam valendo, porque elas sabem qual número faltou.

Regra em `src/lib/aviso-de-consulta.ts` (módulo sem dependência, para o teste não
arrastar o roteador), provada em `aviso-de-consulta.test.ts` — 9 asserções.

---

## ~~Marketing: os cadastros que nunca existiram~~ — FEITA em 2026-09-26

Decisão do dono sobre a issue 03: **apagar**. Saíram sete tabelas com zero linhas
e zero referência no código, entre elas `mkt_artist_contracts`, que carregava duas
chaves estrangeiras na mesma coluna e por isso **nunca aceitou uma linha** desde
maio. Migration `20261029010000`; 456 linhas a menos no `types.ts`.

**`mkt_events` ficou** — não é órfã: a tela de orçamentos de Marketing lê o evento
pelo nome, e o criativo de IA grava o `event_id`. Apagá-la seria apagar a tela de
orçamentos junto. Se você quiser que saia mesmo assim, é leva própria, com a
decisão sobre orçamento e criativo.

---

## LEVA D — Farol de cashback

**Tamanho:** média. **Decide:** eu (o desenho, com sua confirmação).

A outra metade da etapa 5. O par do farol de bonificação, que já está no ar:
quem **nunca participou**, quem **não bateu a meta**, quem está **perto de
bater**. As três perguntas que fazem alguém ligar para o cliente.

---

## LEVA E — Simplificado × analítico nas telas que faltam

**Tamanho:** média. **Decide:** eu.

O dono pediu para **todos** os relatórios do Comercial e da Diretoria.
Entreguei 4 de 9:

| Tem | Falta |
|---|---|
| Ficha do cliente · Bonificação · Diretoria → Resumo · Diretoria → Metas e carteiras | Vendas · Clientes (Comercial) · Cashback · Diretoria → Clientes · Diretoria → Produtos |

Junto vai a regra que já está escrita em `src/lib/visao-relatorio.ts`: tela
de **ler** abre simplificada, tela de **trabalhar** abre analítica.

---

## LEVA F — Os defeitos pequenos do Comercial

**Tamanho:** pequena, tudo numa leva só. **Decide:** eu.

- o **seletor de período não responde** em Clientes, Cashback e Atendimento
  (as RPCs só aceitam o ano) — seletor que não muda nada é pior que nenhum;
- **CFOP 7949 conta como venda** (R$ 24.302 em quatro anos);
- **nome de produto cortado em 18 letras** no gráfico de Pareto;
- **o título da ficha mostra o código**, não o nome do cliente;
- **a lista de clientes do Comercial não marca CONDIÇÃO** (a ficha marca);
- **objetivo cancelado aparece como válido** na tela de Metas;
- **`useUserModules` engole erro do banco** e a chave de consulta não leva a
  empresa;
- **quem recebe aviso de meta pelo sino** cai numa tela onde não vê a
  própria meta;
- o **filtro de série é fixo em 1 e 75**: uma série nova apareceria na
  tabela e não no filtro.

---

## LEVA G — Cadastro de cliente no Comercial

**Tamanho:** média. **Decide:** o dono — há uma contradição a resolver.

O dono pediu "em comercial ter Cadastro de cliente, uma aba Clientes", e
disse para deixar por último. Está bloqueada por uma contradição registrada:
ele disse que **cliente não tem carteira** ("quem tem carteira somos nós,
atendentes"), e o pedido original vinculava cliente a carteira.

Junto: ligar o cliente do Comercial ao cliente do SAC pelo CNPJ, para os
chamados dele aparecerem na ficha.

---

## LEVA H — Ligar o que existe e nunca foi usado de verdade

**Tamanho:** uma leva por integração. **Decide:** o dono — cada uma precisa
de uma conta real e de uma decisão de negócio.

Estas estão **construídas e provadas no banco, mas nunca exercitadas com o
serviço real**:

| Integração | O que falta |
|---|---|
| WhatsApp (conversa, modelo, reengajamento) | conta e número na Meta |
| Nota fiscal (dois caminhos: Bling e Focus NFe) | conta e certificado |
| Cobrança / Asaas | conta; e estorno não desfaz a venda |
| Lead Ads do Facebook | conta na Meta |
| Etiqueta de envio (três conectores) | conta em cada transportadora |
| E-mail | chave SMTP/Resend — hoje fica desligado, e o portal de Qualidade promete e-mail que não sai |

**A de maior efeito imediato é o e-mail:** sem ela, o sistema avisa pelo
sino e o cliente do SAC nunca recebe nada.

---

## LEVA I — Compras

**Tamanho:** média. **Decide:** o dono em dois pontos.

Cinco lacunas registradas: o gatilho é por nome ("compra") e não por marca
na categoria; fornecedor é texto livre, não cadastro; a regra dos três
orçamentos não existe no banco; três permissões que ninguém lê; e compra
concluída **não vira conta a pagar**.

---

## LEVA J — Modo escuro de verdade e o visual

**Tamanho:** grande. **Decide:** o dono (é visual).

Hoje o modo escuro está **declarado e não aplicado**: são 425 cores fixas
espalhadas. Vai junto com o redesenho.

---

## LEVA K — Diagrama visual das automações

**Tamanho:** grande. **Decide:** o dono.

O motor já funciona no banco. Falta o editor de caixinhas e setas, estilo
n8n, por cima dele.

---

## LEVA L — Porte para Next.js (ADR-002)

**Tamanho:** grande. **Decide:** o dono. **Por último, por decisão.**

Junto com ele: o pacote de 3,4 MB sem divisão de código.

---

## Dívidas de base (sem tela, sem pressa, sem esquecer)

- histórico de migrations do `test-helpoint` divergente, parado em
  `20260918024921` — **só o dono tem acesso para o `migration repair`**;
- `npx tsc --noEmit` na raiz **não checa arquivo nenhum** — só vale com
  `-p tsconfig.app.json`;
- 504 erros de lint presos por catraca;
- as edge functions ainda estão fora das cinco regras de escrita (79
  ocorrências da regra 1);
- `is_supervisor_or_higher` e `is_manager_or_higher` têm corpo idêntico e
  citam um cargo que não existe;
- módulo `producao` existe na lista e **não tem nenhuma tela**;
- backend de Marketing sem tela.

---

## As decisões que estão com o dono

1. **Existe no Forteplus um relatório com a natureza da operação?** É o que
   separaria publicidade de bonificação de verdade (Leva A).
2. **A bonificação da INBRAS** foi de 8,7% (2024) para 81,2% (2026). O dado
   está certo; a explicação é comercial.
3. O que é **"Descontinuado"** para um produto.
4. A **meta de 50% para ativar o cashback** — ativa o quê.
5. **Exportar a ficha** com código ou com CNPJ.
6. **2023 e 2024 não têm meta** — é assim mesmo?
7. O **importador deve perguntar o período** que o arquivo cobre?
8. A **grade de cashback não é versionada**: mudar um degrau recalcula meses
   já fechados.
9. **CLIENTESXTABELA está desatualizado** — 31 clientes compraram e não
   estão nele.
10. **`supabase migration repair`** no banco de teste.

---

## Registro honesto

Duas vezes hoje eu quebrei o CI, as duas por **varredura incompleta**: uma
busca disse "dois arquivos" e eu tratei um; e recriei uma função
reescrevendo de cabeça em vez de copiar, apagando uma regra que não era
minha para tocar. E o erro da Leva A tem a mesma raiz: **generalizei de uma
amostra de um cliente só**.

A prática que fica: ao recriar função para acrescentar coluna, comparo o
corpo novo com o antigo ignorando comentários — a diferença tem de ser
exatamente o que eu pretendia, e nada mais. E medida de população se faz na
população, não numa linha.
