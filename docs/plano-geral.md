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

## ~~LEVA B — As portas que ficaram abertas~~ — FEITA, 2026-09-25 e 2026-09-26

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

**Fechado em 2026-09-26, e o registro acima estava errado sobre o tamanho:**

1. ~~**vazamento de sim/não sobre um uuid**~~ — **FECHADO entre empresas**
   (migration `20261104010000`), por decisão do dono. Eu havia escrito que fechar
   "exige reescrever as policies: não é leva de segurança, é leva de
   arquitetura". **Medi antes de mexer, e as duas metades disso estavam erradas:**

   - **dentro da empresa não é vazamento.** Um `member` lê `user_roles` da
     própria empresa direto da tabela — o cargo do chefe está lá. A função não
     conta nada que a tabela já não conte, e o dono confirmou que é assim que ele
     quer (quem pede aprovação precisa saber a quem pedir). Fechar só a função
     seria teatro;
   - **não exige reescrever policy nenhuma.** Contados os usos: **344 dos 344**
     em policy chamam com `auth.uid()`. As únicas perguntas sobre terceiro no
     sistema são sete edge functions que usam a chave de serviço para decidir
     quem mexe em credencial, e oito `has_*_access` que repassam o mesmo uuid
     para dentro. Foi um guarda numa família de 17 funções, não arquitetura.

   O guarda (`pode_responder_sobre`) responde sim em quatro casos: sem pedido
   HTTP (gatilho, cron), com chave de serviço, sobre quem pergunta, ou sobre
   alguém da mesma empresa. Fora disso, **false** — e não erro, para a policy
   continuar devolvendo lista vazia em vez de explodir na tela.

   De brinde, fechou também para **quem não está logado**, sem eu precisar tirar
   as funções do `anon` — que era o caminho arriscado (sem `execute`, o pedido
   anônimo trocaria "lista vazia" por erro 42501 e as quatro portas públicas
   precisariam ser percorridas uma a uma). Nenhum grant mudou: continuam 21
   funções alcançáveis pelo `anon`, as mesmas de antes.

   Prova: `pergunta_sobre_gente_de_outra_empresa.test.sql`, 14 asserções —
   **cinco** de que fechou e **nove** de que não quebrou, incluindo ler a tabela
   e não só chamar a função. A metade "não quebrou" é a que teria pegado o erro
   do CI #111: a família é chamada por 344 policies, então um guarda errado não
   vaza menos, derruba o sistema para todo mundo.

2. ~~**a terceira issue** (`mkt_artist_contracts`)~~ — **sumiu sozinha:** as
   tabelas de artista e influenciador foram apagadas na leva do Marketing
   (2026-09-26), porque nunca tiveram tela. Conferido no banco: zero tabelas
   `mkt_artist*`, zero `mkt_artists`/`mkt_influencers`. A pergunta de domínio
   ("são a mesma coisa renomeada?") deixou de existir junto com elas;

3. **as 128 tabelas com privilégio para o `anon`** — achado ao juntar os
   cadastros de fornecedor na leva I, e **medido até o fim**: não é porta aberta.
   Virei `anon` de verdade e li onze tabelas sensíveis: zero linhas em todas, e
   `tickets` nem responde (erro 42501, porque a policy chama função que o anon não
   executa). Das 226 policies que o anon alcança, 209 pedem empresa e 14 pedem
   uid — e as três que pedem nenhum dos dois passam por
   `get_customer_tenant_id()`, que também lê `auth.uid()`. Uma tabela
   (`automation_fired`) tem RLS ligada com **zero policies**, o que nega tudo.
   Fica como segunda fechadura faltando, não como buraco — e dizer mais do que
   isso sem contar seria o erro do CI #111 outra vez.
3. ~~**RLS de `tickets` por módulo**~~ (decisão D12) — **FEITA em 2026-09-26**, com
   o seu aval. Era uma policy no pedido e **dez** no problema:
   `has_role(…, 'member')` estava em cinco tabelas, `ticket_comments` entre elas —
   e é no comentário que o assunto do chamado mora. Uma função só
   (`modulos_de_chamado_visiveis()`) nas onze policies; 14 asserções de pgTAP.

   Três coisas que apareceram no caminho: o chamado da TI tem `module =
   'tickets'` enquanto a concessão se chama `'ti'` (o único par que não bate pelo
   nome, e o do módulo com mais chamados); o **diretor puro** precisou de linha
   própria, senão o painel "chamados por setor" mostraria dois chamados e chamaria
   de a empresa; e **nada muda para quem usa o sistema hoje**, porque as cinco
   contas são owner/admin.

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

## ~~LEVA D — Farol de cashback~~ — FEITA em 2026-09-26

Desenhada com o dono sobre os dados reais de 2026, e confirmada por ele. Três
blocos, três ações:

- **perto de bater a faixa** — faltou até **um quarto** da primeira faixa no
  melhor mês dele. Hoje: 3 clientes;
- **sem tabela no cadastro** — comprou e nem entrou na conta. Hoje: 1 cliente,
  R$ 1.532,60;
- **tabela sem faixa** — REVENDA, DIRETORIA e SALÃO REF. Bloco **cinza, não
  alerta**, por decisão do dono: DIRETORIA é interno e as outras podem ser decisão
  comercial. Cobrar em vermelho todo dia uma decisão já tomada é como se ensina
  alguém a ignorar o farol inteiro.

**O corte de 25% não é número inventado.** Medido nos 20 que compraram e não
atingiram nada em 2026: três faltaram 18,2%, 20,1% e 24,2% — e o quarto pula para
**44,2%**. Há um vão de vinte pontos ali, e qualquer corte entre 25% e 40% devolve
os mesmos três nomes. O número descreve uma quebra que já existe nos dados, e a
frase se fala ao telefone: "faltou um quarto".

**E o defeito que a leva achou de passagem, que era o mais sério:** a faixa de
cashback é **mensal**, e a tela analítica punha a compra do **ANO** ao lado do que
faltou num **MÊS**. Para 12 dos 20 clientes os dois não somam a faixa — o pior é o
RONDINELLY: R$ 2.461,76 no ano (em cinco meses) ao lado de "faltou R$ 4.160,26",
que somam R$ 6.622 e não os R$ 5.000 da faixa. Dois números verdadeiros lado a
lado contando uma história falsa.

As semânticas estavam documentadas na migration desde outubro (`compra` e
`meta_para_ativar` são do ano; `falta_proxima_faixa` é do último mês;
`menor_distancia` é do melhor mês) — a **tela** nunca disse qual era qual. Agora
cada coluna diz o recorte, e o farol devolve `competencia`, `comprado_no_mes` e
`minimo`, os três que **fecham**: `comprado_no_mes + faltou = minimo`, sempre. A
asserção 4 da suíte prende isso.

Junto veio o item de **Cashback da leva E** (simplificado × analítico): o farol é
a visão simplificada desta tela. `BlocoFarol` saiu de dentro de
`ComercialBonificacao.tsx` para `components/comercial/`, porque agora dois faróis
usam o mesmo cartão.

Prova: `cashback_farol.test.sql`, 9 asserções. A fixture tem um cliente comprando
em **três meses** de propósito — com um mês só, ano e mês coincidem e a asserção do
mês passaria sem provar nada.

---

## ~~LEVA E — Simplificado × analítico nas telas que faltam~~ — FEITA em 2026-09-26

O dono pediu para **todos** os relatórios do Comercial e da Diretoria. Eram 5 de
9; agora são **9 de 9**: entraram Vendas, Clientes (Comercial), Diretoria →
Clientes e Diretoria → Produtos, cada uma com `useVisaoRelatorio` e o
`SeletorVisao`, seguindo a regra que já estava em `src/lib/visao-relatorio.ts` —
tela de **ler** abre simplificada, tela de **trabalhar** abre analítica.

A leva D tinha mostrado o formato: a visão simplificada **não é a analítica com
menos colunas — é o corte**. O que cada tela passou a abrir:

| Tela | O que a simplificada mostra |
|---|---|
| **Vendas** | quantos produtos na faixa A, os 5 maiores compradores, as caixas do faturamento e o CFOP fora da curva. As três tabelas grandes e o Pareto ficam no analítico |
| **Clientes** (Comercial) | quanto vale a lista de quem parou de comprar, e os 10 que mais valem |
| **Diretoria → Clientes** | a barra de concentração (quanto os 10 maiores representam) e os 10, com barra proporcional ao primeiro — não a 100% |
| **Diretoria → Produtos** | três faróis — *Caindo*, *Parou de vender*, *Mais da metade num único mês* — ordenados **por dinheiro, não por variação**. A matriz vai para o analítico |

### O defeito grande que a leva achou: a tendência comparava meses que não existem

Achado ao desenhar o farol de Produtos, **antes** de construí-lo — farol em cima
de sinal errado é pior que farol nenhum.

`com_tendencia_produtos` corta a janela pedida em duas metades e compara a
segunda com a primeira; daí saem `variacao` e `situacao`. O corte era pelo
**calendário** da janela, não pelos meses com dado — e o padrão da tela é "ano
todo", janeiro a **dezembro**, enquanto o dado vai até **setembro**. Então a
segunda metade era "3 meses de venda + 3 meses que não aconteceram", somando
zero contra seis meses inteiros. Medido no banco, mesmo pedido, antes e depois:

| | antes | depois |
|---|---|---|
| produtos "Caindo" | 175 | **46** |
| "Descontinuado" | 28 | 17 |
| "Esporádico" | 8 | 5 |
| variação média | −66,98% | **+69,96%** |

Quase quatro vezes mais produtos acusados de cair, e a variação média **trocando
de sinal**. Nenhum erro, nenhum aviso na tela: só outubro ainda não ter chegado.
Havia um segundo efeito, mais discreto: `meses_com_venda / total` decide
"Esporádico", e com denominador 12 num ano de 9 meses, 3 de 9 (0,33 — não é
esporádico) virava 3/12 = 0,25 — é.

Migration `20261102020000`: a janela encolhe até `min`/`max` da competência que
existe, e devolve zero linha quando não existe nenhuma. Prova:
`tendencia_janela_dos_meses_que_existem.test.sql`, 6 asserções. A fixture tem **8
meses de dado dentro de uma janela de 12 de propósito** — com os meses batendo
com a janela, todas as asserções passariam mesmo com a função errada.

### E o pequeno: a lista de quem parou estava em ordem alfabética

`com_clientes_a_trabalhar` ordenava por `nome`. São **32 clientes, R$
1.174.813,40** do que eles compravam — e os 10 maiores são **R$ 821.207,03,
70% do total**. O maior é o EAN, com **R$ 126.325,19**, que em ordem alfabética
ficava enterrado no meio da lista, enquanto o topo da tela mostrava um cliente de
R$ 5.319,58. Migration `20261102010000`: `order by valor_ultimos_3m desc, nome`.

Isso também é o que torna o corte da tela honesto: o resumo simplificado mostra
os 10 e **diz** que a lista foi cortada pelo teto quando foi, porque a soma dos
10 não é a soma da lista.

---

## ~~LEVA F — Os defeitos pequenos do Comercial~~ — FEITA em 2026-09-26

Nove itens: **sete corrigidos**, e **dois que a medição mostrou não serem
defeito**. Dois dos sete eram maiores do que o registro dizia.

**Corrigidos:**

- **nome de produto cortado em 18 letras** no Pareto — o corte era no DADO, então
  o nome chegava cortado no gráfico *e* no balãozinho, e "OJON MÁSCARA 1KG NU…"
  ficava igual a "OJON MÁSCARA 1KG PR…" justamente nos dois produtos que a pessoa
  compara. Agora o nome inteiro vai no balãozinho e só o eixo corta;
- **o título da ficha mostrava o código** — "Ficha do cliente 1859". Quem abre a
  ficha clicando num nome perdia o nome ao abrir. Agora a ficha compõe o próprio
  título com o nome (a prop `titulo` saiu: duas telas montando a mesma frase é a
  próxima divergência esperando), e o código fica ao lado, em texto pequeno,
  porque é por ele que se confere no Forteplus;
- **a lista de clientes do Comercial não marcava CONDIÇÃO** — `7 de 32` clientes
  estavam sem a marca que a lista da Diretoria já mostrava. Migration
  `20261031010000`: `com_clientes_a_trabalhar` passou a devolver `em_condicao`, da
  MESMA coluna de onde as outras três funções leem. Dava para derivar a regex no
  navegador e seria a segunda cópia da regra;
- **objetivo cancelado aparecia como válido** — e era **pior do que o registro
  dizia**: o percentual do objetivo era a média de `filhos.filter(progress !==
  null)`, sem olhar status, então **um resultado-chave cancelado continuava
  entrando na média**. Um objetivo com um filho em 100% e outro cancelado em 0%
  mostrava 50%. Agora `mediaDoObjetivo` ignora cancelado, e o cartão leva a marca
  "Cancelado";
- **`useUserModules` engolia erro do banco** — e isto ficou **grave nesta mesma
  rodada**: `useVisibleModules` lê esse hook, e desde a leva B os guardas de rota
  decidem **redirecionar** com base nele. Com o erro engolido, uma falha de
  leitura tirava a pessoa do módulo dela e a jogava em `/inicio`, parecendo perda
  de acesso. O guarda que eu tinha acabado de escrever dependia de um hook que
  mentia quando falhava. Corrigidas as três regras juntas (erro, `queryKey` sem
  empresa, escrita sem prova), e os guardas ganharam ramo de erro;
- **o aviso de meta pelo sino era rota morta** para quem mais o recebe:
  `notify_on_meta_definida` avisa **quem está na carteira** — o vendedor — e o
  clique ia para `/diretoria`, de onde `RequireDiretoria` o expulsava para a home.
  Agora só navega quem consegue entrar, e o cursor não promete o que não cumpre.
  Nada se perde: a mensagem que o gatilho grava já traz carteira, mês e valor;
- **o filtro de série era fixo em 1 e 75**, escrito à mão em duas telas. `serie` é
  **texto livre** no banco (vem do Forteplus, sem CHECK), então uma série nova
  apareceria na tabela e não no filtro. Agora sai do dado, com apelido só para as
  conhecidas — série nova aparece como "Série X", sem inventar significado.

**Não eram defeito, e a medição é o registro:**

- **o seletor de período em Clientes, Cashback e Atendimento** — já estava
  resolvido: `FiltrosComerciais` só desenha o seletor quando quem chama o passa, e
  essas três telas não passam. Melhor não ter do que ter e não responder. **Fica a
  limitação real:** essas telas filtram por ano e não por período. Para o Cashback
  isso é da natureza da coisa (a apuração é anual, a faixa é mensal); para
  Clientes, dar `p_de`/`p_ate` é migration própria e o dono não pediu;
- **CFOP 7949 contando como venda** — é **venda mesmo**. Medido: R$ 24.302,61 em
  203 linhas, de 2023 a 2026, produtos do catálogo normal (shampoo, máscara,
  tonalizante) e **6 dos 10 clientes com tabela de preço "INATIVO EXT"**, um deles
  a `CHIC BEAUTY CLUB LLC`. CFOP 7xxx é operação com o exterior: **a Minasflor
  exporta**, e isso é faturamento. Tirar da venda tiraria receita de verdade do
  número.

  De passagem, uma coisa que vale a sua atenção: a tabela de preço desses
  clientes chama-se "INATIVO EXT" e eles compraram até junho de 2026 — cliente
  ativo marcado como inativo no cadastro.

---

## ~~LEVA G — Cadastro de cliente no Comercial~~ — FEITA em 2026-09-26

**A contradição que travava esta leva não existia.** O registro dizia que o
pedido "cliente vinculado a carteira" contradizia o que o dono falou depois
("quem tem carteira somos nós, atendentes"). Medido: o banco concorda com ele —
`com_carteira_membros` liga **carteira a pessoa** (`user_id`), não a cliente, e
tem **zero linhas**. O pedido antigo é que estava mal escrito.

Quatro decisões do dono, todas na recomendação.

### O que o cadastro tinha, e o que passou a ter

Tinha exatamente as cinco colunas que o CSV do Forteplus manda
(`CODIGO;ATIVO;RAZAOSOCIAL;FANTASIA;TABELA`) mais duas nossas. **450 clientes,
nenhum com documento, telefone ou endereço** — não havia onde guardar.

Agora tem `documento`, `telefone`, `email` e `endereco`, e a importação **não os
toca**: `com_importar_clientes` só sobrescreve os cinco campos dela, que é como
`em_condicao` e `tabela_base` já sobreviviam. Cada lado manda no que é dele, e o
formulário diz isso na cara de quem edita — corrigir razão social aqui dura até a
próxima carga.

A coluna se chama `documento` e não `cnpj` de propósito: salão que compra como
pessoa física existe no processo comercial dele, e coluna chamada `cnpj`
guardando CPF é mentira que a próxima pessoa acredita. **Só dígitos**, 11 ou 14,
com CHECK — porque é por ele que o chamado do SAC encontra o cliente, e
`08.319.138/0001-60` nunca casa com `08319138000160`. O sintoma de errar isso não
é erro: é "nenhum chamado".

### ~~O achado que muda o que a tela pode afirmar: o maior vendedor não é gente~~ — RESOLVIDO no mesmo dia

A decisão 2 foi "mostrar quem vende para ele", derivado das notas. Ao construir,
medi quem são os vendedores do histórico:

| Código | Nome no Forteplus | Faturamento | Clientes |
|---|---|---|---|
| 1638 | **FINANCEIRO APROVADO** | R$ 5.017.738,47 | 168 |
| 1637 | **FINANCEIRO CONFERENCIA** | R$ 770.936,66 | 96 |
| 1610 | CONECTA | R$ 148.040,37 | 30 |
| 1340 | VENDEDOR 02 | R$ 247,88 | 1 |

**R$ 5,79 milhões — 56% do faturamento do histórico — em dois "vendedores" que
são etapas do processo financeiro, não pessoas.** Contamina qualquer conta por
vendedor: comissão, ranking, meta de carteira.

O dono decidiu no mesmo dia, e está feito (migration `20261107010000`,
`o_vendedor_do_cliente.test.sql`, 12 asserções):

| A decisão dele | Como ficou |
|---|---|
| o cliente é atrelado a uma **carteira que já existe** (região: ESPECIAL, MG, DEMAIS ESTADOS, BERCARIO) | campo `carteira` no cadastro, com a lista vinda de `com_carteiras_conhecidas()` |
| quem responde pela carteira é o vendedor | `com_carteira_membros.responsavel`, **um por carteira** — índice único parcial, e um trigger marca o primeiro membro sozinho |
| a troca acontece **na leitura** | `com_vendas_itens` nunca é reescrito; `com_atendimento_do_cliente` resolve na hora de mostrar |
| o sistema sabe quem é gente **ligando quem É vendedor** | tabela `com_vendedores`, e a aba **Comercial › Configurações › Vendedores** lista os 23 códigos com quanto cada um assina |

E a frase é a dele: **"Cliente não atrelado a carteira de vendedor — atrelar"**,
com botão que abre o cadastro; quando está na carteira e ninguém responde por ela,
aponta para Diretoria › Metas e carteiras.

**O custo da escolha da região foi avisado e é real:** ela não diz *qual* vendedor
se três atendem MG. Resolvido no banco — sem o índice único, "o vendedor da
carteira" seria `limit 1` sem `order by`, e o Postgres mudaria de resposta entre
duas execuções.

**Por que eu não atrelei os 450 em lote:** a medição não deixa. Dos 186 clientes
com nota em código que não é pessoa, só **29** têm uma única pessoa vendendo nas
outras notas (R$ 785.818,33); **109 têm várias** (R$ 4.884.387,13) e 48 nunca
tiveram pessoa nenhuma. Adivinhar acertaria 13% do valor e inventaria o resto.

### O que o teste descobriu ao ser escrito

**Quem tem o Comercial edita o cadastro mas NÃO importa.** A importação escreve
também em `com_vendas_importacoes`, cuja policy pede `is_admin_or_higher` ou a
permissão `vendas:importar`. Está certo assim — o vendedor corrige o telefone do
cliente dele, e não substitui a base inteira —, e a suíte tem três pessoas por
causa disso.

**E a ficha é o mesmo componente da Diretoria**, que lê o cadastro (a policy de
SELECT a inclui) e não grava. Sem o guarda de tela, o diretor puro veria
"Editar", salvaria, e levaria erro vermelho de uma tela que prometeu o que não
podia cumprir.

**Provas:** `cadastro_de_cliente.test.sql`, 11 asserções — a principal é a
corrente inteira: cadastrar com telefone, rodar a importação com a razão social
diferente, e conferir que a razão social voltou **e** que o telefone continua.

---

## LEVA H — Ligar o que existe e nunca foi usado de verdade — **encolhida para o e-mail em 2026-09-27**

**DECIDIDO PELO DONO em 2026-09-27:** o CRM **não vai ser usado** ("é um
processo muito robusto", e ele o desativou), e **WhatsApp, nota fiscal e Asaas
não têm necessidade por enquanto**. Então esta leva deixa de ser "uma por
integração" e passa a ser **uma só: o e-mail**, que ele quer por último.

O que sai do caminho, e o que isso apaga da lista de trabalho:

| Integração | Situação |
|---|---|
| WhatsApp (conversa, modelo, reengajamento) | **dispensada** pelo dono |
| Nota fiscal (Bling e Focus NFe) | **dispensada** pelo dono |
| Cobrança / Asaas | **dispensada** pelo dono |
| Lead Ads do Facebook | **dispensada** — é porta de entrada de CRM |
| Etiqueta de envio (três conectores) | **dispensada** por ora (vive no fluxo do CRM) |
| **E-mail** | **a única que fica.** Chave SMTP/Resend; hoje desligado |

Isso também tira da fila as **ressalvas conhecidas** dessas integrações
registradas em `docs/nao-funciona.md` (seção Comercial, achados de 2026-09-10 a
09-13): são **17 itens** que existiam só para quem fosse ligar essas contas.
**O código fica onde está** — desativado não é apagado, e ninguém deve removê-lo
sem o dono pedir: ligar de novo é cadastrar a chave, e apagar seria refazer.

**O e-mail, que é o que fica:** sem ele o sistema avisa pelo sino e o cliente do
SAC nunca recebe nada. Duas coisas hoje prometem e-mail que não sai — o portal
de Qualidade ("aviso por e-mail a cada resposta", com os triggers gravando em
`notification_events` que ninguém lê) e o botão de redefinir senha do cliente de
SAC, que além disso é incompatível com o login por código. As duas se resolvem
na mesma leva.

---

## ~~LEVA I — Compras~~ — FEITA em 2026-09-26

**Este registro estava vencido.** Ele listava cinco lacunas que a leva **L8 já
havia fechado** (marcação `is_purchase`, três orçamentos no banco, compra
concluída virando conta a pagar, permissões lidas). O que sobrava era outra
coisa — e a primeira é a maior desta leva inteira.

Quatro decisões do dono, todas na recomendação: **o solicitante escolhe o setor**
(com o dele sugerido), **uma lista só de fornecedor**, **o executor informa o
prazo de pagamento**, e o teto de gasto **barra e libera com motivo escrito**.

### 1. O setor da compra nunca era gravado — e o teto nunca podia disparar

O formulário lia o setor de `user_metadata.department`. **Nada neste sistema
escreve ali:** o convite grava `profiles.department`, a tela de perfil grava
`profiles.department`, e o metadado recebe só o nome. Medido antes de mexer:

| | |
|---|---|
| pessoas | 5 |
| com setor em `profiles.department` | **5** |
| com setor em `user_metadata.department` | **0** ← o que a compra lia |

Toda compra nasceria com setor nulo. E a cadeia inteira depois disso é
consequência, sem um degrau que acuse: setor nulo → conta a pagar sem centro de
custo → o teto lido é zero → "passou do teto" é **sempre falso**. O aviso
amarelo que a L8 construiu existia e era **inalcançável**.

Havia um segundo andar: "setor" tinha **três listas**. O convite oferecia nove
setores; a tela de teto de gasto percorria os **sete** módulos com perfil de
acesso (então Produção e Expedição nunca podiam ter teto, apesar de o convite pôr
gente lá); e a tela de perfil deixava **digitar**, com `ti` (3 pessoas) e `TI`
(2) no banco — dois setores para o mesmo setor, e a comparação do teto é de
texto. Agora é uma lista (`src/lib/setores.ts`), com CHECK no banco nas quatro
tabelas que gravam setor.

### 2. Duas listas de fornecedor, e a do Financeiro sem tela nenhuma

`mkt_suppliers` tinha tela, categoria e nota; `fin_suppliers` tinha a chave do
orçamento e **nenhuma tela** — ninguém conseguia cadastrar, e o fornecedor
continuava sendo texto digitado. As duas estavam **vazias**, então juntar custou
uma migration. Viraram `suppliers`, da empresa: o Marketing usa nas cotações, as
Compras no orçamento, e o formulário de compra ganhou seletor com cadastro na
hora. Junto: a chave composta `(supplier_id, tenant_id)` que faltava em
`mkt_quotations` — o mesmo buraco da L8, na tabela vizinha.

**Dois achados de passagem:** `fin_suppliers` tinha `revoke all … from anon` e a
tabela do Marketing não — juntar sem reparar isso *perderia* a proteção. E
medindo para conferir: **128 das 153 tabelas** do `public` dão privilégio ao
`anon`. É o irmão do buraco das 185 funções, e fica para a leva B.

### 3. A conta a pagar nascia vencendo hoje, sempre

Não havia onde informar o prazo, então o trigger usava a data do dia: compra de
30 dias nascia **em atraso no dia seguinte**, e o relatório de vencidas mentia
até alguém corrigir de cor. Agora o laudo tem o vencimento (`<input
type="date">`, em branco = à vista) e a competência acompanha.

### 4. O teto barra, e o escopo deixou de ser enfeite

A regra vive no trigger `fin_compra_respeita_teto`: passar do teto sem motivo
escrito é recusado pelo **banco**, não pela tela — vale para quem contornar a
interface. O motivo morre com a decisão que ele explica, como em
`few_quotes_reason` (a lição da auditoria da L8, aplicada de novo). E
`purchases:manage_budget`, que ninguém lia, virou caminho alternativo na policy:
quem não é gestor mas tem a permissão define teto.

### 5. A porta do catálogo de produtos (minha, não decisão do dono)

`purchases:manage_products` deixava a tela cinza e a RLS aceitava INSERT/UPDATE
de qualquer pessoa do tenant. Não fechava antes porque o **cadastro rápido** do
formulário de compra dependia da porta aberta. O formulário ganhou a terceira
saída — "usar este nome", sem cadastrar — e a porta fechou.

**Provas:** `compra_tem_setor` (10), `compra_teto_barra_com_motivo` (9),
`compra_vence_no_prazo_informado` (6), `catalogo_de_produto_tem_porta` (7), mais
`compras_lacunas` (34) e `dividas_das_auditorias` reapontadas para `suppliers`.

**O que ficou registrado e não feito** (em `nao-funciona.md`): o setor vem do
perfil e não do chamado (mexer nisso é mexer na abertura de chamado); corrigir o
vencimento **depois** de concluir não corrige a conta já lançada; e CNPJ/contato
de fornecedor passaram a ser visíveis a todo o staff, não só a quem tem o
Financeiro.

---

## ~~LEVA J — Modo escuro de verdade~~ — FEITA em 2026-09-26

**Estava declarado e não aplicado em TRÊS camadas**, e o registro só conhecia uma.
Medido antes de mexer:

| Camada | Estado |
|---|---|
| `darkMode: ["class"]` no Tailwind | certo desde sempre |
| um bloco `.dark` com valor escuro dos tokens | **não existia** |
| alguém pondo a classe `dark` no `<html>` | **não existia** — `next-themes` era dependência (o `sonner` chamava `useTheme()`) e nenhum provider estava montado |
| cores de paleta fixa | 425 avisos em 84 arquivos |

A ordem importava: **converter as 425 cores primeiro não mudaria nada na tela**,
porque o token não tinha para onde mudar. Um arquivo 100% semântico continuaria
claro.

**O que entrou:** o bloco `.dark` com os ~70 tokens (superfície invertida, azul da
marca clareado para manter contraste, os pares de badge trocando de papel, os
sólidos de status clareados, gráfico e funil com o mesmo matiz e mais luz);
`ThemeProvider` com **três** estados — claro, escuro e **sistema**, que é o padrão;
e o seletor no cabeçalho, ao lado do sino, com o ícone mostrando **o que está
valendo** e não o que foi escolhido.

**As cores: 425 → 85.** 617 trocas em 80 arquivos, por
`scripts/cor-fixa-converter.mjs`, que conta e imprime cada troca — varredura sem
conferência foi o que quebrou o CI #111. A regra ficou escrita no script: fundo
pálido (50–100) vira o par `badge-*`; sólido vira `bg-status-*`; borda até 300 é
decoração (`border-border`) e 400+ é aviso (`border-status-*`).

**Os 85 que sobraram são de outra natureza e não dividem a mesma correção:** 71
são `white`/`black` (véu de diálogo, texto sobre botão colorido — **corretos** nos
dois temas), 16 são hex em mapas de dado dentro de `src/types`, e 2 são um
gradiente de marca. Catraca de avisos abaixada de 464 para 124.

**O que este trabalho NÃO é:** o redesenho. O dono pediu "modo escuro de verdade",
e é isso que está aqui — o visual novo continua sendo outra conversa.

---

## ~~LEVA K — Diagrama visual das automações~~ — FEITA em 2026-09-26

**Este registro estava vencido**, como o da leva I. Ele dizia "falta o editor de
caixinhas e setas, estilo n8n"; o diagrama **já existia** desde a E5-A3
(`FlowCanvas.tsx`, com React Flow e dagre, colorido por status da execução e
clicável para abrir o passo). `@xyflow/react` e `@dagrejs/dagre` já eram
dependências.

O que faltava era exatamente o teto que o próprio comentário do arquivo nomeava:
*"nada de arrastar nem de '+' na aresta nesta versão… o teto é alguém pedir para
desenhar à mão"*. O dono pediu.

**O que entrou:** **"+" na aresta**, que insere um passo onde a pessoa aponta, e
**"×" no nó**, que o tira. As duas chamadas são opcionais no componente, e é isso
que mantém o mesmo canvas servindo a tela de **execução**, onde não há o que
editar. O "+" abre um seletor em duas etapas — o clique só guarda *onde*, e o passo
nasce quando se escolhe *qual*; criar um passo no clique encheria o fluxo de passos
que ninguém pediu.

A regra mora em `insertStepBetween`, função pura com 4 asserções de Vitest, e ela
religa **aresta por aresta**: com ramificação, inserir entre A e B não pode mexer
no caminho de C — trocar `next` inteiro faria isso e deixaria o ramo de C órfão.

**Arrastar para reordenar ficou de fora, e é decisão:** a posição no canvas é
calculada pelo dagre a partir do `next`, e com ramificação a ordem visual não é a
de execução — cada passo diz para onde vai. Arrastar teria de significar "religar
as setas", que é o que o "+" e o "vai para" da lista já fazem, com a diferença de
que ali está escrito o que aconteceu. Oferecer arrastar sem ramificação e travar
com ela seria a mesma tela com duas regras.

---

## LEVA S — Checklist de pedidos Comercial × Financeiro dentro do Helpoint — **S1, S2, S3, S5 e S6 entregues em 2026-09-29; S4 espera os PDFs**

**Estado (2026-09-29):** banco (`ped_*`, 22 pgTAP), checklist no Lançamento, Financeiro ›
Conferência de pedidos com filas, decisão, pagamento, finalização e PDF, configuração de itens e
motivos, indicadores 18.4 (Financeiro completo; Comercial e Diretoria só totais) e a carga do
histórico (`ped_carregar_historico`, provada com um checklist real numa transação desfeita).
**Falta:** S4 — o leitor do espelho em PDF, que depende de 2 ou 3 PDFs reais de cada layout
(Pedido I e Pedido IV, um com desconto). Na virada, a carga dos 42 precisa das contas das
vendedoras e do Financeiro criadas antes (roteiro em `docs/deploy.md`, passo 9).

**Pedido do dono:** trazer para o Helpoint o sistema de checklist de pedidos que ele montou fora
(Supabase `MF_INTERNO`, 9 usuários, 42 checklists de 16/09 a 29/09), mais o painel 18.4/18.5.
Especificação: `docs/manual-checklist-pedidos.md` (manual técnico do dono + anexo com o 18.4/18.5).

### Decisões do dono (2026-09-29)

| | |
|---|---|
| Onde nasce o checklist | **Dentro do Lançamento**: primeiro o checklist, depois os dados que medem os indicadores. O valor da venda passa a ser a soma dos pedidos tipo Venda |
| Recebimento | **O fluxo do manual**: Financeiro confere → aprova (fica Em negociação) → Pago quando o cliente paga → finaliza. Recusa volta ao Comercial com o motivo |
| Histórico dos 42 | **Trazer tudo**, com datas e autores — no teste agora, e **na produção no go-live** (a produção começa vazia) |

### Partes

- **S1** — banco + pgTAP: tabelas `ped_*` (checklists, pedidos, itens e respostas configuráveis, motivos
  de recusa configuráveis, decisões/pagamentos/finalizações só-inserção), situação derivada numa view,
  as regras do manual em trigger, e as dívidas técnicas 2, 3, 5, 7 e 8 do manual pagas.
- **S2** — checklist no Lançamento (Comercial).
- **S3** — Financeiro › Conferência de pedidos + configuração de itens e motivos + PDF do checklist.
- **S4** — leitor do espelho em PDF (`pdfjs-dist`) — **depende de PDFs reais de espelho** (Pedido I e
  Pedido IV, um com desconto) e da categoria de colorimetria em `com_produtos`.
- **S5** — indicadores 18.4 (Financeiro, Comercial; Diretoria só os totais): registrado × faturado
  (notas do Forteplus, por cliente e mês — mostrado, não ajustado) × recebido.
- **S6** — migração dos 42 checklists do `MF_INTERNO` no teste + roteiro do go-live em `docs/deploy.md`.

---

## LEVA R — Planilha modelo de carteiras — **2026-09-29**

**Pedido do dono:** "uma template padrão que baixamos e colocamos os dados e depois importamos, assim
evita que qualquer planilha seja importada; e baixar a relação de todos os clientes cadastrados no
mesmo formato — baixo os 450, coloco a qual carteira pertence e importo novamente".

- **O modelo**: aba `CARTEIRAS`, cabeçalho `CÓDIGO | CLIENTE | FANTASIA | TABELA | CIDADE-UF | CARTEIRA
  | GRUPO`, uma linha por código. Só CARTEIRA e GRUPO são lidos. Outro arquivo é recusado.
- **Baixar**: "todos os clientes no modelo" (com a carteira e o grupo atuais) ou "modelo vazio".
- **Decisão do dono**: **a planilha muda** — carteira diferente da do sistema troca, e a prévia lista
  quem muda e de onde sai. Célula vazia não muda nada. (Na LEVA Q "o sistema mandava": era a planilha
  antiga da equipe; agora o arquivo sai do próprio sistema.)
- A vendedora responsável é escolhida por carteira que o arquivo traz; o leitor livre da LEVA Q saiu.
- Migration `20261117020000_modelo_de_carteiras.sql` (novo corpo de `com_importar_carteiras`);
  `importar_carteiras.test.sql` (10) e Vitest do modelo, com ida e volta do arquivo gerado.

---

## LEVA Q — Importação inicial das carteiras comerciais — **2026-09-29** (o leitor livre foi trocado pelo modelo na LEVA R)

**Pedido do dono:** importar a planilha "CARTEIRAS ATUAL — DE-MG-SP — MAR26" (abas OUTROS ESTADOS, VIP,
MG), escolhendo a vendedora de cada carteira na hora, **uma vez só**, sem conflito depois com as
importações do Forteplus (vendas, curva ABC, pedidos, cadastro).

### Fonte oficial de cada informação

O elo é o **código do Forteplus** do cliente (único por empresa). Medido nas funções: **nenhuma
importação do Forteplus escreve carteira nem grupo**.

| Informação | Fonte oficial | Quem escreve |
|---|---|---|
| Razão social, fantasia, tabela de preço, situação, CNPJ | Forteplus | `com_importar_clientes` / ficha (CNPJ e contato só onde está vazio) |
| Vendas, mercadorias, curva ABC, pedidos, vendedor da nota | Forteplus | Importação de vendas |
| **Carteira do cliente, grupo de cliente** | **Helpoint** | Esta importação (uma vez), depois Cadastro de clientes e Carteiras |
| **Vendedora responsável pela carteira** | **Helpoint** | Esta importação, depois Configurações › Equipe e carteiras |
| Meta da carteira | Diretoria | Diretoria › Metas e carteiras |

### Decisões do dono

| | |
|---|---|
| Aba VIP | É a carteira **ESPECIAL** (renomeação que a Diretoria já registrou). OUTROS ESTADOS → **DEMAIS ESTADOS**; MG → **MG** |
| Mesmo código em dois clientes (1075, aba MG) | **Fica de fora e é listado**, para resolver no Cadastro |
| Seções INATIVOS | **Entram na carteira** — inativo o sistema calcula (120 dias) |
| Cliente que já tem outra carteira | **O sistema manda**: a planilha só preenche quem está sem carteira |

### O que entrou

- `src/lib/planilha-de-carteiras.ts` — lê a planilha por cabeçalho (cobre a seção INATIVOS com colunas
  trocadas), separa vários códigos da mesma célula (`1615 | 1064`, `1075|1066`, `1195/2015`) e tira os
  conflitos. No arquivo real: 98 clientes, 107 códigos, 7 grupos, 1 conflito, 2 sem código.
- `com_importar_carteiras(p_carteiras, p_confirmar)` — prévia e gravação pela mesma conta; grava
  carteira só em quem está sem, grupo só onde está vazio, e a vendedora como responsável (sem mover
  quem já está em outra carteira — cada pessoa fica em uma só). Migration `20261117010000`.
- Comercial › Configurações › Equipe e carteiras › **Importar carteiras de planilha**.
- Prova: `importar_carteiras.test.sql` (10), incluindo "a importação de clientes do Forteplus roda
  depois e carteira e grupo continuam iguais"; Vitest do leitor (13, e contra o arquivo real com
  `PLANILHA_CARTEIRAS=…`).

---

## LEVA P — Pedir compra pelo lugar certo, e configurações num formato só — **entregue, 2026-09-28**

**Pedido do dono:** *"quando eu vou fazer uma solicitação de compras … não consigo. Em abrir nova
solicitação aparece todos os setores … lá não tem compras, mas em Compras tem um botão nova
solicitação. Está errado: o módulo Compras é onde quem tem acesso recebe a demanda."* E: *"as
permissões, as configurações, está muito redundante … muito bagunçado, muito confuso."*

### Medido antes de propor

- "Nova solicitação" (`DepartmentGrid`) lista 7 setores, **sem Compras**; o cartão do Financeiro
  ainda diz "Compras, reembolsos e pagamentos".
- **A trava real:** `compras_solicitacoes` aceita INSERT de qualquer pessoa, mas
  `compras_orcamentos` só de `has_compras_access`. Quem pede de fora de Compras cria o chamado e o
  pedido e leva 42501 nos 3 orçamentos obrigatórios — chamado e pedido ficam pela metade.
- Configurações: 13 itens soltos num grupo; acesso em 3 camadas (papel, módulo, perfil) e 2 lugares
  (a chave "Admin da empresa" aparece duas vezes); abas "Acesso" que dizem "próxima fase" com os
  perfis já existindo; "Prazos (SLA)" em quatro setores sendo **uma tabela só**; Comercial com 9
  abas; Compras **sem** tela de configuração — as categorias `module='compras'` não têm onde ser
  editadas, e o teto de gasto mora no Financeiro.

### Parte 6 (2026-09-29) — quem configura cada setor, e o menu dos setores

O dono, olhando as telas: o item "Prazos de atendimento" da Empresa era redundante com o prazo de
cada setor; em vez de um item por setor no menu, **um item "Setores" que abre uma grade**, como a de
Nova solicitação, com **ativo só o setor que a pessoa configura**; e **uma opção no perfil de acesso**
para marcar quem configura cada setor.

- **Medido:** os perfis Gestor já traziam `settings: {view, edit}` desde a semente — e nada lia a
  chave, nem a tela de perfis a mostrava. Quem alterava a configuração era decidido pelo **cargo**, de
  uma vez para todos os setores (supervisor mudava categoria de qualquer setor; Gestor do RH sem cargo
  não mudava as do próprio RH).
- **Agora:** "Configurações do setor" (abrir / alterar) aparece em cada setor do perfil de acesso. O
  banco confere `pode_configurar_setor` (dono/admin, ou `settings.edit` do setor) em categorias,
  formulários, automações e prazo do setor. A tela usa a mesma conta (`useConfiguracaoDosSetores`,
  `setorDoModulo` espelhando `setor_do_modulo`). Compras ganhou a chave no Gestor.
- **Custo:** gerente/supervisor **sem** o perfil do setor deixa de configurá-lo. O CRM responde ao
  Comercial. As abas próprias de cada setor (folha, carteiras, SAC…) seguem as regras delas.
- **Prazo padrão da empresa:** saiu a tela; o padrão fica como ponto de partida, e cada setor muda o
  seu na aba Chamados.
- Migration `20261116010000`. Prova: `quem_configura_cada_setor.test.sql` (13, com renomear, apagar e
  "voltar ao padrão"); `automacoes_fluxos` e `automacoes_modelos` passaram a dar ao gerente o perfil
  Gestor (`tests.grant_profile`).
- **Revisão de código (2026-09-29), o que ela mudou:** quem tem permissão de uma ABA do setor também
  entra na tela (`tambemAbrePor`: o teto de gasto para quem o define no Financeiro; carteiras e
  cashback no Comercial) — sem isso, o teto ficava inalcançável para quem o edita; o botão
  "Formulário" some para quem só vê; prazo de setor desligado não aparece como "Do setor";
  `mensagemDeErro` foi para `@/lib/supabase-result` e os prazos passaram a usá-la.
- **Ficou de fora, e é decisão do dono:** a chave "Configurações do setor" vale no banco só para a aba
  Chamados — as abas próprias (folha do RH, SAC, cashback, carteiras, teto, Expedição) seguem as regras
  delas; e ela se marca no perfil, não pessoa a pessoa. → **Decidido na parte 7.**

### Parte 7 (2026-09-29) — a configuração se libera aba por aba

O dono, perguntado se a chave valia para todas as abas: "Personalizado, marcar o que pode ser
liberado". Não entendeu a tabela em texto; viu uma simulação clicável (artifact "Permissões por aba")
e escolheu o **Jeito 1: ABRIR e ALTERAR por aba**. E "pelo perfil", não pessoa a pessoa.

- **No perfil de acesso**, cada aba da configuração de cada setor é uma linha `Configurações › <aba>`
  com "Abrir" e "Alterar" (`config_<aba>`; lista única em `src/config/abas-de-configuracao.ts`,
  espelhada por `public.abas_de_configuracao` e conferida por um Vitest que lê a migration).
- **Na tela**, aba sem nenhuma marcação não aparece; aba só com "Abrir" aparece travada (um
  `<fieldset disabled>` com aviso; abas com navegação interna se travam sozinhas).
- **No banco**, `pode_alterar_aba(setor, aba)` em todas as tabelas que cada aba grava: checklists,
  empresas/departamentos/folha do RH, produtos, categorias e campos do SAC, remover planilha importada,
  teto de gasto, cashback, catálogo de indicadores, equipe e carteiras. Alertas da TI e "quem vê o
  quê" do Comercial moram em `tenants.settings` e gravam por `salvar_configuracao_da_aba`, que grava só
  a parte da aba.
- **Conversão:** `settings.view/edit` virou `config_<aba>.view/edit` em todas as abas do setor (nos
  perfis que existem, e por trigger nos que nascerem); `cashback.configurar` virou `config_cashback`.
- **O que mudou para quem usa:**
  - Produtos e lotes do SAC eram alteráveis por qualquer pessoa da empresa. Agora é preciso a aba.
  - A lista de vendedores do Forteplus era alterável por qualquer pessoa do Comercial. Agora exige
    gerir carteiras ou a aba Equipe.
  - Supervisor sem o perfil do RH deixa de alterar empresas, departamentos e folha, e sem o perfil
    da TI deixa de alterar checklists.
  - O teto de gasto passa da permissão do Financeiro para a aba de Compras. Nenhum perfil tinha a
    permissão antiga.
  - O catálogo de indicadores passa de "definir metas" para a aba Indicadores.
- Migration `20261116020000`. Prova: `permissao_por_aba.test.sql` (10); quatro testes antigos passaram
  a dar o perfil a quem configura (`comercial_cashback`, `o_vendedor_do_cliente`,
  `quem_tem_o_rh_ve_as_empresas`, e o texto de `compras_e_modulo_proprio`).

De brinde, o **"[object Object]" em Comercial › Lançamentos**: `mensagemDeErro` não lia o erro do banco
(que não é `Error`), e por trás havia uma recusa real — cliente do **Histórico** ia como "da minha
carteira", e o banco recusava. Agora vai como "fora da minha carteira", com o aviso. E o "Próximo
prazo" ganhou a explicação: o que é, quando preencher e por quê.

### Decisões do dono (2026-09-28)

| | |
|---|---|
| Acesso de uma pessoa | **Uma escolha por setor**: "Sem acesso" ou o perfil. Some o par módulo + perfil |
| Teto de gasto | **Em Compras**, com o resto do que é de compra. Quem edita é o perfil |
| Prazos (SLA) | **Prazo próprio por setor.** Setor sem prazo próprio usa o padrão da empresa |

### As partes

| Parte | O quê |
|---|---|
| **1** ✅ | Compras entra em "Nova solicitação"; o botão sai do módulo Compras; quem pediu grava os orçamentos **do próprio pedido enquanto aguarda aprovação**; chamado, pedido e orçamentos numa transação só (`compras_abrir_pedido`, migration `20261115010000`). Prova: `quem_pede_compra.test.sql` (7) |
| **2** ✅ | Configurações num formato só: **Empresa** (Pessoas e acessos, Identidade, IA, Importações) e **Setores** — desde a parte 6, um item só que abre a grade dos setores. Todo setor usa o molde `ConfiguracaoDoSetor`: a primeira aba é **Chamados** (categorias → prazos do setor → automações), depois o que é só dele. Saíram: a cópia do gerenciador de categorias da TI, as três cópias da tabela de prazos, as abas "Acesso" de RH/Comercial/Educacional e "Equipe" da Qualidade. `?aba=` antigo cai na aba nova |
| **3** ✅ | Acesso da pessoa: por setor, "Sem acesso" ou o perfil — escolher o perfil é dar o módulo. Diretoria, CRM, Produção e Expedição ficam como caixa de marcar. A chave "Admin da empresa" só na janela, que passou a abrir para admin (antes não abria, e por isso a chave estava duplicada na tabela). **Compras não tinha perfis** e ganhou Gestor, Operador e Somente leitura; quem tinha módulo sem perfil recebeu o Operador (`20261115040000`). Prova: `acesso_uma_escolha_por_setor.test.sql` (4) |
| **4** ✅ | Prazo por setor: `sla_policies.module` (nulo = padrão da empresa); `calculate_sla_due_at` procura o do setor e cai no padrão (migration `20261115020000`). Um componente só, `PrazosDeAtendimento`, na aba Chamados de cada setor (a tela do padrão da empresa saiu na parte 6). Prova: `prazo_por_setor.test.sql` (5) |
| **5** ✅ | Comercial de 9 abas para 4 (Chamados; Equipe e carteiras; Indicadores; Cashback). **Compras › Configurações** com categorias e teto; o teto continua editado pelo Financeiro, e Compras passou a **ler** a chave do teto (`20261115030000`). A marcação "é compra" das categorias passou a ser oferecida em Compras — era oferecida no Financeiro, onde não ligava nada |

---

## LEVA O — A planilha de Gestão Comercial dentro do sistema — **entregue, 2026-09-28**

**Pedido do dono:** a planilha *Gestão Comercial Minasflor — Indicadores e Tarefas 2026*
(11 abas) e o manual dela viram os indicadores do setor Comercial. **A especificação é
`docs/manual-gestao-comercial.md`** (a transcrição do manual); a planilha não entra no
repositório porque tem dado de cliente.

### A decisão que virou o plano do avesso

O primeiro plano media tudo pela **nota fiscal importada** — "ninguém precisa digitar nada".
O dono recusou, com um motivo melhor: *"a ideia é que eles mesmos preencham, em vez de puxar
pela importação da nota fiscal … aproveitar esse gancho que força os vendedores a atualizar
suas carteiras, colocar os seus clientes nas suas carteiras, atualizar os dados."* O
lançamento é o gancho: para lançar, o cliente precisa estar na carteira da vendedora.

Medido no dia, e é por isso que o gancho importa: `com_carteira_membros` e `com_vendedores`
com **zero linhas**, os 450 clientes **sem carteira**. A máquina de carteira existia havia um
mês e ninguém tinha usado. E as duas fontes de "venda" discordam feio — setembro/2026:
planilha R$ 114.897 × nota fiscal R$ 219.423, quase invertido entre as três vendedoras.

### As decisões dele

| | |
|---|---|
| Fonte dos números | **O lançamento da vendedora**, como na planilha |
| Lista de indicadores e ações | Nasce igual à planilha (14 + 12) e **o gestor edita pela tela** |
| Cliente que ela pode lançar | **Só os da carteira dela, com escape** "fora da minha carteira", visível ao gestor |
| Carteiras | **Não semear nomes** — criar os parâmetros; sem carteira = Histórico |
| Atividade | Conta para **quem lançou** (manual §6) |
| Vendedora nova | Ganha os indicadores sozinha — basta estar numa carteira |

### O que entrou (migration `20261113010000`)

- **`com_indicadores`** (catálogo editável, semeado por empresa, também para empresa nova),
  **`com_interacoes`** (a linha da aba da vendedora), **`com_interacao_marcas`** (os "Sim"),
  **`com_metas_indicador`** (meta por vendedora × indicador, que vale até alguém mudar).
- **`com_salvar_interacao`** — interação e marcas numa transação só. Em duas chamadas, a falha
  da segunda deixaria lançamento sem marca.
- **A trava de carteira em `com_clientes`.** Medido antes: qualquer pessoa com o Comercial
  mudava a carteira de qualquer cliente. Com o lançamento exigindo carteira, isso seria o
  atalho — puxar para si o cliente da colega. Agora a vendedora **traz do Histórico** para a
  dela; o resto é do gestor.
- **O nome da carteira é normalizado ao gravar**, nas duas pontas. Nada normalizava: "Norte"
  num membro contra "NORTE" num cliente faria a vendedora não conseguir lançar para o próprio
  cliente, sem mensagem.
- **Renomear carteira leva os clientes junto.** Não levava — não fazia falta enquanto a coluna
  estava vazia; agora prenderia os clientes ao nome antigo.
- **`com_atribuir_carteira_em_lote`** — montar carteira sem abrir 450 fichas.
- Leituras: `com_painel_do_gestor` (em **linhas**, para a Diretoria um dia somar setores),
  `com_farol_de_acoes`, `com_resumo_da_carteira` (as três leituras de ticket do §7.1),
  `com_situacao_120_dias` e `com_cor_do_farol` (a régua §6.2, uma verdade só).

**Prova:** `lancamento_comercial.test.sql`, **19 asserções**, rodadas no `test-helpoint`. Entre
elas: a vendedora **não** lança nem puxa cliente da colega; agendada e valor zero **não somam**;
120 dias é ativo e 121 não; venda lançada **reativa**; os tickets com o exemplo do próprio
manual (R$ 10.000 e R$ 2.000); e "vendedora nova aparece no painel sem outro passo".

### O que entrou no front

- **Comercial › Lançamentos** — a aba de cada vendedora.
- **Comercial › Indicadores** — o Painel do Gestor. A rota existia como redirect sem uso.
- **Configurações › Carteiras e vendedoras** — inclusive **criar carteira**, que não existia:
  carteira nasce quando alguém a usa, e com tudo vazio não havia como montar a primeira.
- **Configurações › Indicadores** — a lista editável. Indicador usado não se apaga, se desliga.
- **Cadastro de clientes** ganhou seleção múltipla e "Atribuir à carteira".
- As abas de Configurações passaram a viver na URL (`?aba=`), em todos os módulos.

### A âncora dos 120 dias, resolvida sem precisar dele

O sistema evita "hoje" de propósito (regra 10 do pgTAP) e o manual ancora em hoje. A
classificação usa o dia do Brasil e a **última compra consolidada** (histórico importado +
venda lançada, §10), e a tela diz até quando o histórico foi importado — importação atrasada
aparece em vez de inflar os inativos. Só **venda** conta como compra: com isso a base dá 87
ativos, 183 inativos e 180 que nunca compraram (28 clientes só receberam bonificação).

### A continuação (2026-09-28): as quatro partes

O dono pediu que **cada vendedora veja os próprios indicadores** e que o resto da planilha
fosse planejado. Decisões dele: a **meta é da Diretoria, por carteira** (`com_metas`) — o §9
do manual (meta automática por cliente) saiu do plano; **grupo de cliente** entra; **cliente
novo vira chamado**, atualização é direta; a Diretoria vê **todos os setores, só em totais**.

| Parte | O que entrou | Prova | CI |
|---|---|---|---|
| **1** | Comercial › Indicadores vira "Meus indicadores" para a vendedora (o banco já só lhe entregava a linha dela), com **imprimir/PDF**. A meta de valor passa a ser a da Diretoria; `com_metas_indicador` recusa `valor_vendas` (migration `20261114010000`) | `a_vendedora_ve_os_seus` (4) | #152 |
| **2** | `com_clientes.grupo` e **Comercial › Carteiras**: acompanhamento por grupo (`com_acompanhamento_da_carteira`) e meta × venda mês a mês (`com_carteira_mes_a_mes`) (`20261114020000`) | `o_acompanhamento_da_carteira` (6) | #153 |
| **3** | Pedido de cliente novo → gestor aprova → **chamado na mesma transação** → quem cadastra no Forteplus aplica com o código → o cliente nasce na carteira de quem pediu (`20261114030000`). A categoria do chamado é configuração do Comercial | `a_fila_de_cadastro` (9) | #154 |
| **4** | **Diretoria › Indicadores dos setores**: `dir_indicadores_dos_setores` (Financeiro, RH, Compras, SAC, Marketing, só agregado) e `dir_chamados_por_setor`, que conta no banco — acabou o corte de 1.000 linhas e Compras entrou (`20261114040000`). O Comercial vem de `com_resumo_da_carteira` | `a_diretoria_ve_os_totais` (7) | o do commit da parte 4 |

Tetos conhecidos, registrados para não virarem surpresa:

- carteira com **duas vendedoras** compara cada uma à meta inteira da carteira; o total certo
  da carteira aparece em Comercial › Carteiras;
- escolher a categoria do chamado de cadastro exige permissão de editar as configurações da
  empresa;
- aplicar o pedido exige ser gestor do Comercial ou o responsável pelo chamado;
- as telas de Financeiro e SAC continuam calculando no navegador, em janelas próprias (90 dias
  corridos, etc.); a função da Diretoria usa **as mesmas definições**, por mês. Trocar as telas
  dos setores para a função mudaria o recorte que elas mostram hoje — é decisão, não conserto.

De brinde, medido na Parte 4: o **RH › Tabela detalhada** mostrava atestados e atrasos sempre
em zero — lia `a.type` com valores em inglês, e a coluna é `kind` (`atestado`, `atraso`).

---

## LEVA N — Compras sai de dentro do Financeiro e vira módulo

**Pedido do dono em 2026-09-27:** *"vamos retirar o Compras de Financeiro? afinal o
módulo Financeiro está poluído demais por conta do setor de compras, vamos fazer o
Compras ser um módulo em vez de estar dentro de Financeiro."*

**Ele estava certo, e dá para medir:** das **10 telas do Financeiro, 4 eram de
Compras** (Compras, Catálogo de Produtos, Fornecedores, Indicadores de Compras) — e o
próprio menu dizia "Chamados **e compras** do Financeiro".

### O momento mais barato possível

Medido antes de mexer: **0 solicitações de compra, 0 orçamentos, 0 tetos de gasto, 0
pessoas com perfil de acesso atribuído, 0 pessoas com o módulo Financeiro concedido**
e 1 produto de teste no catálogo. Nenhum dado para migrar, ninguém perde acesso.

### As quatro decisões do dono

| Pergunta | Resposta dele |
|---|---|
| Compras tem fila de chamados própria? | **Não** — a solicitação de compra já é o pedido |
| Quem define o teto de gasto por setor? | **O Financeiro define, Compras respeita** |
| Existe um setor "Compras"? | **Sim** — virou o décimo |
| Renomear as tabelas `fin_purchase_*`? | **Sim**, agora que estão vazias |

### O que entrou no banco ✅

- **`20261110010000`** — `compras` é o décimo setor. A lista é uma só: os quatro
  CHECKs (`profiles`, `tenant_invites`, `compras_solicitacoes`,
  `fin_department_budgets`) mudam juntos, porque a leva I os criou justamente por
  haver **três listas de setor concorrendo**;
- **`20261110020000`** — `fin_purchase_requests` → **`compras_solicitacoes`**,
  `fin_purchase_quotes` → **`compras_orcamentos`**, `fin_purchase_products` →
  **`compras_produtos`**, mais 14 constraints, os índices, 6 gatilhos e 3 funções de
  regra. `alter table rename` **não** atualiza corpo de função plpgsql — sem
  recriá-las, aprovar uma compra falharia com "relation does not exist" **na hora de
  aprovar**, não agora;
- **`20261110030000`** — `has_compras_access`, as policies das três tabelas, o teto
  com escrita só do Financeiro, e um CHECK novo em `user_module_access.module`.

**O que NÃO mudou de nome, e é a decisão dele:** `fin_department_budgets` e
`fin_budget_settings` (o teto é controle do Financeiro), `fin_entries` (a conta a
pagar que a compra gera — comprar cria obrigação de pagar, e quem paga é ele) e o
bucket `fin-purchases` (renomear bucket no Supabase é mover cada objeto e reescrever
caminhos, por zero ganho, e storage é o que a suíte não alcança).

### Dois defeitos que a separação fechou, e não estavam no pedido

1. **As compras eram abertas para qualquer pessoa logada.** As policies eram
   `tenant_id = get_user_tenant_id()` e nada mais — sem checar módulo. Quem tinha só
   o RH lia toda solicitação de compra da empresa, com valor, fornecedor e laudo. O
   isolamento entre empresas funcionava; o que faltava era o módulo existir para
   filtrar.
2. **`user_module_access.module` era texto livre.** Conceder `compas` (com um "r" a
   menos) gravaria a linha e não daria acesso a nada: a pessoa apareceria com o módulo
   na tela de administração e continuaria sem ver a tela, **sem erro e sem aviso**.
   Agora há CHECK com os doze módulos.

**E `plan_config` não existe mais** — `docs/nao-funciona.md` a citava como a lista de
módulos disponíveis; ela saiu com a camada SaaS (ADR-010). A lista vive em
`ALL_MODULES`, travada por `src/types/modulos.test.ts`, e agora tem o lado do banco.

### O bloco de prova pegou a minha varredura incompleta — duas vezes

Cada migration termina com um `do` que a **reprova** se sobrar referência ao nome
antigo. Ele funcionou nas duas:

- na primeira, acusou `is_allowed_upload_ext` — que fala do bucket `fin-purchases`,
  com **hífen**. Em `LIKE` o `_` é curinga, então `fin_purchase` casava com
  `fin-purchase`. **Guarda com padrão frouxo acusa inocente**, e corrigir foi escapar
  o `\_`;
- na segunda, acusou `fin_budget_settings`, que eu **não tinha visto** usar
  `financeiro:purchases:manage_budget`. Tratar um de dois lugares é o meu erro
  recorrente (está no "Registro honesto"), e aqui a guarda o pegou antes do CI.

### O front ✅

- **Rotas `/compras`, `/compras/catalogo`, `/compras/fornecedores`,
  `/compras/indicadores`.** Os quatro endereços antigos ficaram como
  **redirecionamento** — ninguém usa o sistema ainda, mas link velho que devolve
  "página não existe" faz a pessoa achar que a função foi apagada;
- **menu próprio**, e o do Financeiro caiu de 10 para 6 itens. O título do primeiro
  deixou de dizer "Chamados **e compras**";
- as quatro telas saíram de `telas/financeiro/` para **`telas/compras/`**, com nome
  em português (`Solicitacoes`, `Catalogo`, `Indicadores`, `Fornecedores`) — e
  `Fornecedores` continua **uma só tela em dois endereços** (`/compras/fornecedores` e
  `/mkt/fornecedores`), como a leva I decidiu;
- **`compras` é departamento de perfil de acesso**, com `solicitacoes`, `catalogo`,
  `fornecedores`, `reports` e `profiles`. `financeiro:purchases:*` deixou de existir;
  o que ficou no Financeiro é **`budgets:manage`**, o teto.

**Sem departamento de chamados em Compras**, por decisão dele. E `payables:settle` do
Financeiro **continua** executando compra: executar é registrar que a compra saiu e
gerar a conta a pagar — quem já mexe no dinheiro faz isso por tabela.

### O chamado da compra também é de Compras ✅ (migration `20261111010000`)

**Pedido do dono em 2026-09-28:** *"ataca agora, quero o chamado da compra em
Compras."*

Era a outra metade da poluição. `compras_solicitacoes.ticket_id` é **NOT NULL** —
toda compra tem um chamado por baixo, que é onde moram a conversa, os anexos e o
prazo. Com ele no módulo `financeiro`, a caixa de entrada do Financeiro continuava
mostrando compra, mesmo com as telas já fora.

**Três peças, e a do meio é a que decide quem responde:**

1. `tickets.module` aceitar `'compras'` — sem isso o insert é recusado;
2. **`modulos_de_chamado_visiveis()` mapear a concessão `compras` para o módulo de
   chamado `compras`.** As policies de SELECT **e de UPDATE** de `tickets` perguntam a
   ela. Sem o par no mapa, o chamado nasceria num módulo que ninguém alcança e só o
   requisitante veria a própria compra — comprador nenhum aprovaria nada;
3. as categorias `is_purchase` mudarem de módulo, porque é por elas que o formulário
   sabe que aquele chamado é uma compra.

**A caixa do Financeiro parou de mostrar compra sozinha**, sem eu tocar na tela:
`FinTickets` filtra `module = 'financeiro'`. Só a frase da tela mudou — ela prometia
"solicitações de compra, reembolsos e demais pedidos", e prometer o que não se entrega
é defeito.

**E pedir uma compra saiu de três telas para uma.** Era: Financeiro → Chamados → novo
chamado → escolher categoria de compra. Agora é o botão **"Nova solicitação"** na
própria tela de Compras, com **o mesmo formulário** dos outros módulos
(`module="compras"`) — uma tela de pedido própria seria uma segunda verdade sobre o
que uma compra precisa. O chamado dela é lido em `/compras/chamados/:id`, que é a
mesma tela de detalhe no endereço do módulo a que o chamado pertence — não uma fila
nova (o dono decidiu que não há fila de chamados em Compras).

**Os chamados que já existiam foram com as categorias**, no mesmo `update`: chamado
ficando em `financeiro` apontando para categoria de `compras` seria órfão — apareceria
na caixa errada e sumiria da certa. E a migration termina com um bloco que a **reprova**
se sobrar chamado de compra fora do módulo.

Prova em `compras_e_modulo_proprio.test.sql`, agora com **11 asserções**: as duas novas
são "quem tem Compras vê o chamado" e "quem tem só o Financeiro não vê" — a segunda é
a que mede o pedido do dono.

**Fora, e continua fora:** `automation_workflows.module` não recebeu `compras` —
automação de compra não foi pedida, e é uma linha ali quando for.

---

## LEVA M — Cadastro de cliente único: o SAC reconhece quem já é cliente

**Pedido do dono em 2026-09-27**, nas palavras dele: *"a ideia é que o SAC é onde
nosso cliente da nossa base faça um SAC, porém ele cadastrando uma conta teríamos 2
bancos de dados de cadastros desnecessário; a ideia é unificar isso — se o cliente
cadastrou no SAC e ele já tem seus dados registrados no nosso sistema, já puxar
automaticamente; o que o cliente pode fazer é somente atualizar os dados se
necessário."* Mais duas coisas na mesma conversa: **o vendedor da carteira só ver os
clientes dele** (com chave para ligar, nas Configurações do Comercial) e o **botão
"Novo cliente" sair de dentro da ficha**.

### O que a medição mudou no pedido

O dono acreditava que os 450 clientes já tinham CNPJ e endereço. **Não têm.** Medido
em 2026-09-27, e conferido em todas as tabelas do banco:

| Os 450 clientes têm | Não têm |
|---|---|
| código, razão social (450), fantasia (445), tabela de preço (380), ativo/inativo | **CNPJ (0), endereço (0), telefone (0), e-mail (0), carteira (0)** |

Dois motivos, os dois rastreáveis: o CSV de clientes do Forteplus tem **5 colunas**
(`CODIGO; ATIVO; RAZAOSOCIAL; FANTASIA; TABELA`) e CNPJ não é uma delas; e na leva G
o próprio dono decidiu "documento digitado quando alguém precisar". O único CNPJ em
qualquer tabela de cliente do banco era **um**, de um cliente de teste do SAC.

Sem documento na base, "procurar pelo CNPJ" não acha ninguém. Então a leva começa
por **fazer o documento existir**, não pelo reconhecimento.

### A descoberta que destravou

O Forteplus **escreve o documento dentro da razão social** nos clientes pessoa física
e MEI, do jeito que a Receita registra:

```
EDMAR GONCALVES DA SILVA 04907925611      → CPF completo
49.932.013 LILIAN VIEIRA DA SILVA         → raiz do CNPJ, sem /0001-XX
DUNOGUE DISTRIBUIDORA DE COSMETICOS LTDA  → nada
```

Contados: **119 com CPF, 25 com raiz de CNPJ, 305 sem nada**. E a conferência que
importa: **os 119 CPFs passam no dígito verificador, 119 de 119, zero falso
positivo.** O DV não é enfeite aqui — telefone com DDD também tem 11 dígitos, e sem
ele a extração gravaria telefone no campo de CPF, que é o defeito que faz o chamado
do SAC não encontrar o cliente (a razão de a leva G existir).

### Passo 1 — o cadastro sai de dentro da ficha ✅

O cadastro (CNPJ, telefone, e-mail, endereço, carteira) **só existia dentro da ficha
de um cliente**: completar 450 exigia abrir 450 fichas, trabalho que ninguém termina
— e era isso que travava o pedido do dono. Agora existe **Comercial › Cadastro de
clientes** (`/comercial/clientes`), com as lacunas em número no topo (*sem CNPJ*, *sem
contato*, *sem carteira*), busca, edição, o "Novo cliente" — que saiu de onde não tinha
nexo, junto da ficha aberta — e o botão da ficha do Forteplus.

**Corrigido em 2026-09-28, a pedido dele:** *"Cadastro de Cliente não deve ficar no
Insights."* Nasceu como aba dentro da tela Clientes do Insights, e ele está certo —
Insights é o que o Comercial **mede** (quem parou de comprar, curva, tendência);
completar o CNPJ de 450 clientes é trabalho de **cadastro**. Duas perguntas diferentes,
feitas por pessoas diferentes; na mesma tela as duas viram "a tela do Comercial" e
nenhuma fica boa. Virou tela própria com item de menu; a tela do Insights voltou a ter
um assunto só.

### Passo 2 — o documento passa a existir ✅

- `extrairDocumentoDoNome` (`src/lib/documento.ts`), com CPF e CNPJ conferidos no
  dígito verificador e a raiz completada com `/0001` + DV calculado. 17 asserções;
- o **importador** passa a extrair (migration `20261109010000`), então a carga de
  produção nasce com documento em vez de depender de alguém digitar 450;
- e um **botão** na aba Cadastro preenche os que já estão no banco, usando a mesma
  função — uma verdade só. Nunca toca em quem já tem documento, pula o que colidiria
  com outro cliente, e é reversível.

### Passo 3 — o SAC reconhece o cliente ✅ (migration `20261109020000`)

**A mesma pessoa em duas empresas**, decisão do dono. `customer_profiles` tinha
`unique (user_id)`: quem se cadastrava numa segunda empresa levava erro de chave
duplicada e **ficava logado na empresa antiga** — a sessão abre antes do insert
falhar, e a tela só dizia "Erro ao salvar cadastro". Virou `unique (user_id,
tenant_id)`; nenhuma FK dependia da chave antiga.

**O vínculo, e o que o pedido ainda não resolvia.** Quem garante que quem digita o
CNPJ é aquele cliente? **CNPJ é público** — se o sistema devolvesse os dados por
acertá-lo, qualquer pessoa colheria razão social, telefone e endereço da base
digitando CNPJs na tela pública, sem se cadastrar. Não é hipótese: é o que a função
faria escrita do jeito óbvio.

O cadastro do SAC **já confirma o e-mail** por código de uso único. Então:

| Situação | O que acontece |
|---|---|
| e-mail confirmado **já constava** no cadastro do cliente | liga e preenche na hora |
| e-mail novo, ou cliente sem e-mail | registra o pedido, **não revela nada**, e quem atende confirma uma vez |

Duas colunas guardam isso — `com_cliente_codigo` (o que o cadastro **diz** ser) e
`vinculo_confirmado` (se foi **provado**) —, com a FK **composta com `tenant_id`**
(lição da leva I) para o cadastro de uma empresa não apontar para o cliente de outra,
e um CHECK que torna "confirmado sem cliente" estado impossível.

**O que o vínculo preenche:** perfil ← cliente a razão social; cliente ← perfil o
telefone e o e-mail. Sempre só onde está vazio, **nunca sobrescrevendo** (leva G).
**O endereço fica de fora de propósito:** `com_clientes.endereco` é um texto e
`customer_profiles` tem sete campos — juntar perde estrutura, quebrar **inventa**, e
endereço mal quebrado é entrega no lugar errado. Quando precisar, é leva própria.

Prova em `o_sac_reconhece_o_cliente.test.sql`, 11 asserções — e **quatro delas
existem só para o CNPJ acertado não revelar nada**, porque testar só o caminho felizescondereria exatamente o defeito que a função existe para não ter.

**Acesso sem senha, confirmado pelo dono em 2026-09-27:** *"mantém sem senha, onde
ele recebe um código de acesso por e-mail a cada vez que ele entrar"*. Era como já
funcionava — e a varredura achou uma tela de login **por senha** (`telas/sac/Login.tsx`)
ainda no repositório, sem rota, contradizendo isso. **Apagada**: código morto que
contradiz uma decisão é o que faz alguém religá-lo depois.

### Passo 4 — o vendedor só vê os clientes dele ✅ (migration `20261109030000`)

**No banco, não na tela.** Esconder no front não esconde nada: o sistema fala direto
com o banco e quem tem a sessão alcança a tabela pela API.

**A medição que tornou isso pequeno:** das **40 funções `com_*` que leem cliente ou
venda, 39 são `security invoker`** (`pg_proc.prosecdef`). Então restringir **duas
tabelas** restringe o painel inteiro — curva ABC, tendência, cashback, faturamento —
sem tocar em nenhuma das 39. A única `definer` é `com_conciliacao`, que é a tela do
diretor, e diretor vê tudo por decisão.

A chave é `tenants.settings → comercial → vendedorSoVeSuaCarteira`, **desligada por
padrão**, na aba "Quem vê o quê" das Configurações do Comercial. Gestor, dono,
administrador e quem tem a Diretoria ficam **fora** da restrição: a pergunta deles é
"como vai a empresa", e um total recortado por carteira seria número que mente.

**A tela mostra a consequência antes de alguém ligar.** Cliente sem carteira fica
invisível para o vendedor — é a regra pedida, não efeito colateral —, e hoje **0 de
450 têm carteira**. O aviso ao lado da chave diz quantos são e onde atrelar
(Clientes → Cadastro, filtro "Sem carteira"). O dono dispensou a preocupação porque a
produção começa do zero, e decidir olhando o número continua sendo diferente de
descobrir depois.

Prova em `o_vendedor_ve_a_carteira_dele.test.sql`, 7 asserções — e as duas primeiras
são **com a chave desligada**, porque é essa metade que quebraria a empresa inteira
se eu errasse, e suíte que só testa a restrição ligada não a cobre.

**Uma armadilha de Postgres que esta migration levou na primeira tentativa**, e que o
comentário dela nomeia para ninguém "simplificar" de volta: `carteira = any ((select
f()))` faz o Postgres ler o `(select …)` como **subconsulta** e aplicar `ANY
(subquery)`, que espera linhas do tipo do elemento — a função devolve uma linha de
`text[]`, e o erro é `42883: operator does not exist: text = text[]`. Envolver em
`coalesce(...)` faz a expressão ser escalar de tipo `text[]` e vale a forma `ANY
(array)`. O `coalesce` está ali **pelo parser**, não pelo nulo.

### Fora de ordem, por pedido dele: as importações do Forteplus ✅ (2026-09-28)

*"Importante você criar essa importação também, e ter em Financeiro contas a pagar e
receber importação do Forteplus para lá também. Posso te enviar os relatórios."* — e
depois: *"segue para vc criar as funções e saber o que vc consegue puxar atraves disso."*

Ele mandou os três relatórios de exemplo. **Os três leitores existem**, medidos contra
os arquivos reais, e a regra foi a mesma da leitura de vendas: posição de coluna
conferida no arquivo, nunca deduzida do cabeçalho impresso.

**1. Ficha cadastral de clientes** (`src/lib/forteplus-ficha.ts`, RPC
`com_importar_ficha_clientes`, migration `20261112010000`). Botão "Ficha do Forteplus"
em `/comercial/clientes`. É um bloco por cliente com rótulo e valor, não uma tabela —
e **não tem o código do cliente**, então casa pela razão social. 406 fichas no exemplo:
CNPJ, endereço, CEP, cidade e estado em 100%, e-mail 79%, telefone 51%. Só preenche
coluna vazia, ignora nome repetido, e deixa de fora documento que já é de outro
cliente. Nove asserções em `a_ficha_completa_o_cadastro.test.sql`.

**2 e 3. Contas a Pagar e Contas a Receber** (`src/lib/forteplus-fin.ts`). O formato
"Forteplus" do diálogo de importação **era decorativo**: nada no código olhava para
ele, e o caminho genérico lia o cabeçalho impresso, que aponta para colunas diferentes
das dos dados — "Vencimento" rotulado na 9, dado na 10. Resultado: importar contas a
pagar do Forteplus trazia **zero** lançamentos, em silêncio. Agora o formato escolhe o
leitor posicional.

**Três coisas que só o arquivo real ensinou**, e que valem para o dia da carga:
- **53 dos 93 títulos de contas a pagar não têm número de nota fiscal** — recibo, DAS,
  taxa, pagamento avulso. Exigir o documento derrubava 57% do relatório sem avisar.
- **Nota de crédito vem negativa, e o sinal fica.** No exemplo são R$ 8.081,59 de
  crédito; tratados como positivos, deixariam de abater E entrariam como receita —
  R$ 16 mil de recebível inventado.
- **A conferência é o "Totais:" que o relatório imprime.** O leitor soma, compara e
  **recusa o arquivo** se não fechar. Foi ela que achou os dois erros acima. Hoje os
  dois fecham ao centavo: R$ 125.983,90 e R$ 200.230,69.

**Reimportar não duplica** (migration `20261112020000`): o "Cod" da parcela vira
`external_id`, com único parcial por empresa, e o front faz `upsert`. Quem exporta "de
tal dia até hoje" sempre encavala com o relatório anterior — antes disso a conta
entrava duas vezes no realizado e nada acusava. Cinco asserções em
`reimportar_nao_duplica.test.sql`.

**O que os relatórios NÃO dão**, e é decisão de negócio para depois:
- **Não há data de pagamento nem coluna de situação** — são relatórios de título
  aberto. "Pago" sai do saldo zerado, e a data de um título pago é o **vencimento**
  (hoje jogaria anos de contas pagas no mês corrente do realizado).
- **Vendedor e região da ficha vêm vazios** (1 e 3 de 406). Carteira não vem do ERP.
- O vendedor do relatório de contas a receber vai para a **observação**, porque o campo
  vem contaminado: "FINANCEIRO APROVADO" e "FINANCEIRO CONFERENCIA" no meio de nomes
  de gente.

---

## LEVA L — Porte para Next.js (ADR-002) — **passos 1 e 4 FEITOS em 2026-09-26**

**Tamanho:** a maior do plano. O dono pediu os quatro passos. **Dois estão feitos e
provados pelo CI (run #131, no `main`, com o `next build` dentro do job `front`);
o passo 2 tem a primeira tela e a regra; o passo 3 não pode acontecer ainda, e o
motivo é aritmético.**

O que o porte toca, medido antes de começar:

| | Quantos |
|---|---|
| arquivos `.ts`/`.tsx` em `src/` | **554** |
| arquivos que importam `react-router-dom` | **84** |
| declarações `<Route path=…>` | **127** |
| arquivos que usam `window`/`document` direto | **43** |
| usos de `import.meta.env` (não existe no Next) | 10 |

### Passo 1 — Next ao lado, não no lugar ✅

`app/` na raiz, uma rota coringa `[[...slug]]` que serve o `App` que já existe, e
**nada muda de comportamento**. Os dois builds coexistem: `npm run build` (Vite) e
`npm run build:next`, **os dois no CI** — sem isso o porte regrediria em silêncio
no primeiro `import.meta.env` novo.

**A armadilha era real, e não teórica.** O Next lê `src/pages/` como Pages Router,
e essa pasta tinha **107 telas** que não são rotas. A primeira tentativa provou
isso do jeito mais claro: o build saiu com **`/AcceptInvite` como página do Next**.
Cada tela viraria um endereço público, servido sem layout, sem sessão e sem guarda.
A pasta virou `src/telas/` — o rename é obrigatório, não estético — e o build
passou a dizer `Route (app)` com duas rotas.

E a tentativa anterior a essa ensinou outra: `pageExtensions: ['page.tsx']`, que eu
tinha posto como cinto e suspensório, fez o App Router procurar `page.page.tsx` e
**deixar de reconhecer o `app/`** — o build saiu servindo nada. O suspensório
apertou o cinto.

**O seam do ambiente:** `import.meta.env` é sintaxe do Vite e vira `undefined` no
Next. Os oito arquivos passaram a ler `src/lib/env.ts`, que lê as duas grafias. E
`client.ts` passou a **falhar alto** se faltar chave — era exatamente esse erro que
denunciou o `/AcceptInvite`. Sem ele, a URL viraria `undefined/functions/v1` e o
sistema subiria sem backend, **sem erro de build**.

### Passo 4 — a divisão de código ✅ (veio junto, e não "de graça")

O pacote saía com **um pedaço de 4,1 MB** (o plano dizia 3,4; havia crescido). Quem
abria o Login baixava o RH, o Comercial, a Diretoria e o editor de automações para
ver um formulário de e-mail e senha.

**4,1 MB → 1,65 MB**, e 189 pedaços em vez de um: 72 telas viraram
`lazy(() => import(…))` com **uma** fronteira de `Suspense` em volta das 127 rotas.
Uma por rota daria um lugar melhor para a espera, e a que faltasse derrubaria a
tela — uma só não pode faltar.

**Ficaram diretos, de propósito:** os guardas (`StaffRoute`, `RequireDiretoria`,
`RequireComercial`, `RequireOwnerOrAdmin`), porque carregar em pedaço separado o que
decide SE a tela aparece poria um piscar entre "entrei" e "posso"; e `NotFound` /
`EmConstrucao`, porque um fallback que baixa um pedaço para dizer "não existe" é o
pior momento para uma espera.

### Passo 2 — uma tela por vez: a primeira está feita, e a regra está escrita

**`/termos` é rota de verdade do Next**, componente de **servidor**: HTML pronto,
**143 B** de JS próprio no build. Ganho concreto, não promessa.

**A regra que o passo segue, e ela se descobriu fazendo:** *uma tela vira rota do
Next quando deixa de precisar do roteador.* Nos Termos isso foi trocar um
`<Link to="/">` por `<a href="/">` — numa página só de texto, navegação no cliente
não ganha nada, e o `<a>` funciona nos dois mundos.

**E aí a medição mostrou que a fila tem uma tela — a que já foi feita.**
`scripts/porte-next-candidatas.mjs` segue o **fecho** de cada tela (todo import
local, recursivo) e pergunta onde ele encosta em roteador, sessão ou banco. Das 107:

| | Quantas | O que isso significa |
|---|---|---|
| **SERVIDOR** | **1** | `Terms.tsx`, já feita. Nada de cliente no fecho: HTML pronto |
| **CLIENTE** | 24 | precisam de sessão ou estado, mas não do roteador |
| **FICA** | 82 | encostam no roteador |

**Medir o fecho, e não o arquivo, é o ponto.** `grep react-router-dom src/telas/*`
devolve 28 telas "limpas", e a primeira que eu abri — `FinSettings` — chama
`useFinImports` e `useDepartmentPermissions`: banco e sessão. Ela não é candidata a
nada. O import direto não diz nada sobre o que a tela desenha.

**As 24 de CLIENTE não valem a viagem, e isso é conclusão, não preguiça.** Rota do
Next com `'use client'` desenha exatamente o que a rota coringa já desenha, menos o
roteador: **zero HTML pronto**, e o pedaço próprio elas **já ganharam no passo 4**.
Sobraria o custo — navegação real conferida por gente, tela por tela.

**Onde o ganho existiria de verdade é nas públicas** (Login, Portal,
`PropostaPublica`, `FormularioPublico`, o SAC), porque quem abre é gente de fora,
sem nada em cache. E **todas as 12 leem o banco na primeira pintura** — buscam a
empresa, o formulário ou a proposta pelo token. Um componente de servidor **não tem
sessão**: para ele fazer essa leitura, alguém tem de decidir se o servidor pode
falar com o banco e com qual credencial — e isso mexe na fronteira que é a RLS.
**É decisão de ADR, e é do dono** (`CLAUDE.md`: schema e RLS não se delegam).

Então o passo 2 **não está bloqueado — está sem alvo barato**. O próximo passo dele
é uma pergunta, não um commit.

**As outras 106 telas continuam na rota coringa**, funcionando como sempre. Cada uma
que sair de lá precisa de **navegação real conferida por gente** — é o que
`CLAUDE.md` chama de "caminho do usuário", e é a prova que nem o Vitest nem o pgTAP
dão: os dois ficariam verdes com o sistema inteiro fora do ar, porque nenhum abre
uma tela.

### Passo 3 — tirar o `react-router-dom`: não pode acontecer ainda

Não é escolha, é aritmética: ele sai quando **não sobrar tela usando `<Route>`**, e
sobram **126 rotas**. Tirá-lo agora apagaria o roteamento do sistema.

### O que NÃO muda em nenhum passo

Supabase continua o backend, a RLS continua a fronteira, e migrations e pgTAP não
são tocados (ADR-002). O porte é do front — e é por isso que o job `banco` do CI
passou verde sem nada a dizer sobre ele.

---

## Dívidas de base (sem tela, sem pressa, sem esquecer)

- histórico de migrations do `test-helpoint` divergente, parado em
  `20260918024921` — **só o dono tem acesso para o `migration repair`**;
- `npx tsc --noEmit` na raiz **não checa arquivo nenhum** — só vale com
  `-p tsconfig.app.json`;
- **503 erros** de lint presos por catraca (os avisos caíram de 464 para 124 na
  leva J — foi cor fixa trocada por token, não dívida perdoada);
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
11. ~~**O servidor do Next pode falar com o banco?**~~ — **DECIDIDO em 2026-09-27:
    não por agora.** O passo 2 do porte fica onde está, e nada piora: as telas
    continuam funcionando e o pacote já caiu de 4,1 MB para 1,65 MB. Ninguém de
    fora usa o sistema ainda, então velocidade de primeira abertura não é o
    gargalo. Retomamos quando houver gente de fora entrando — e aí a pergunta
    volta igual: para o servidor ler o banco ele precisa de credencial própria, o
    que mexe na fronteira de segurança, e é ADR.

---

## Decisões tomadas em 2026-09-27 (as três que a varredura levantou)

Perguntadas com a medição na mão, respondidas pelo dono, e **já implementadas**:

| Decisão dele | O que entrou |
|---|---|
| **Quem tem o módulo RH vê as empresas** | Migration `20261108010000`: leitura de `rh_companies` passou à mesma régua de `rh_employee_profiles` (`has_rh_access`). Criar, editar e apagar empresa continuam de supervisor. Prova: `quem_tem_o_rh_ve_as_empresas.test.sql`, 9 asserções — 4 delas só para provar que a escrita **não** abriu |
| **Conta paga tem data de pagamento** | Migration `20261108020000`: trigger preenche com o dia do Brasil quando não vem data, e a tira ao reabrir a conta; CHECK `fin_entries_paga_tem_data` afirma a invariante. A importação passou a usar o **vencimento** para conta paga sem data — com o dia de hoje, um ano de contas pagas importadas cairia todo no mês corrente do realizado. Prova: `conta_paga_tem_data.test.sql`, 8 asserções |
| **O servidor do Next não fala com o banco por agora** | Nada a construir. Pendência 11 fechada acima |

E uma que **deixou de precisar dele**: perguntei se conceder o módulo Diretoria a um
usuário só-leitura deveria ser barrado. Medindo para explicar, a pergunta se
desfez — as 5 pessoas do teste são todas dono ou administrador, ninguém é
só-leitura, e ninguém tem o módulo concedido. E o conserto certo não é barrar nada:
é a tela **dizer de quem são os números** quando quem lê não alcança a empresa
toda. Feito, sem decisão dele.

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
