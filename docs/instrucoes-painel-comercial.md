# Instruções — Curva ABC mensal da Minasflor

**VERSÃO 7 — setembro de 2026. Canal único de comunicação: Google Calendar.**

Este arquivo é a fonte de verdade da rotina. Leia-o inteiro antes de processar qualquer coisa.
Se algo aqui conflitar com o que você acha que deveria ser feito, siga este arquivo.

**Comece toda execução declarando:** "Li o INSTRUCOES.md versão 7." Se a versão que você leu não disser 7, você está com um arquivo antigo — pare e avise, porque pode haver duas cópias na pasta.

Nesta versão **não existe Trello**. Se o texto que você está lendo menciona Trello, board ou card, é versão antiga.

**O que mudou da v6 para a v7:** a rotina agora processa **duas empresas** — **01 INBRAS** e **02 MF** (Minasflor) — a cada competência, em **dois arquivos de entrada**, um por empresa. A aba `BASE` ganhou a coluna **Empresa** e os dois painéis têm **filtro por empresa** (Todas / INBRAS / MF), que já existia no código e agora está documentado. O `CLIENTESXTABELA` passou a ser atualizado **semanalmente**. A operação passou a ser **semanal, às sextas** (ver seção 5).

---

## 1. O que esta rotina faz

Todo mês, transforma os exports do ERP Forteplus (relatório **Mercadorias Vendidas — Produto**, agrupado por cliente) das **duas empresas** em três entregas:

1. **A planilha** de curva ABC, com o histórico acumulado do ano e a coluna de empresa;
2. **O Painel Comercial** em HTML, com filtro por empresa;
3. **O Painel Diretor** em HTML, em pasta com acesso separado, também com filtro por empresa.

E se comunica por um único canal: o **Google Calendar**. Três tipos de evento, com finalidades diferentes:

| Evento | Quando | Para quê |
|---|---|---|
| **Lembrete** | Enquanto os arquivos não chegarem | Cobrar a exportação dos relatórios |
| **Resumo** | O mês foi processado com sucesso | Registrar o que mudou, na descrição do evento |
| **Pendência** | Algo falhou, ou faltou uma das empresas | Deixar registro do problema em aberto |

Nenhuma outra ferramenta é usada. Não crie card, ticket ou mensagem em Trello, Slack ou e-mail — tudo vai para o Calendar, na agenda de quem opera a rotina.

O comercial precisa responder duas perguntas: **quem eu abordo** e **o que eu ofereço**.
A diretoria precisa responder outras duas: **este produto continua valendo a pena** e **vamos bater a meta**.
E as duas áreas precisam poder ver **cada empresa separadamente ou as duas juntas** — por isso o filtro por empresa.

---

## 1a. As duas empresas

A operação tem duas empresas, e cada linha de dado pertence a uma delas:

| Código | Empresa | Como aparece no painel |
|---|---|---|
| 1 | INBRAS | `01 INBRAS` |
| 2 | MF (Minasflor) | `02 MF` |

**O código da empresa é definido pelo arquivo de origem, pela identificação no nome do arquivo (seção 4).** Toda linha importada carrega o código da empresa na aba `BASE`. Os painéis abrem em **Todas** (consolidado) e permitem filtrar para INBRAS ou MF; ao filtrar, **o painel inteiro recalcula** para aquela empresa — indicadores, curva, fichas, cashback, tudo.

Nunca misture as empresas numa mesma linha, e nunca deixe uma linha sem empresa. Linha sem empresa identificável não entra na BASE: registre pendência e pare (seção 4).

---

## 1b. Como os arquivos são gravados

**O conector do Google Drive só lê e cria. Não sobrescreve, não move, não renomeia e não exclui.**

Criar um arquivo com nome já existente não substitui o antigo: gera um segundo arquivo homônimo na mesma pasta, e ninguém mais sabe qual vale. Isso já aconteceu e não pode se repetir.

Por isso **todo arquivo gerado leva a competência no nome**:

| Arquivo | Nome |
|---|---|
| Planilha | `CURVA_ABC_<AAAA-MM>.xlsx` |
| Painel Comercial | `PAINEL_COMERCIAL_<AAAA-MM>.html` |
| Painel Diretor | `PAINEL_DIRETOR_<AAAA-MM>.html` |
| Registro de importações | `PROCESSADOS_<AAAA-MM>.md` |
| Registro de eventos | `EVENTOS_<AAAA-MM>.md` |

`<AAAA-MM>` é sempre a competência recém-importada. Ao processar agosto de 2026, os arquivos criados terminam em `2026-08`. **Uma única planilha e um único par de painéis por competência cobrem as duas empresas** — a separação é pela coluna Empresa e pelo filtro, não por arquivos diferentes.

**O arquivo vigente é sempre o de competência mais recente na pasta.** Para ler qualquer um deles, liste a pasta, ordene pelo sufixo e pegue o maior. Nunca leia um arquivo sem esse sufixo, e nunca crie um sem ele.

Os arquivos dos meses anteriores ficam onde estão. Eles são o histórico de versões e a rede de segurança: se um processamento sair errado, o mês anterior continua intacto ao lado.

---

## 2. A regra de ouro

**O histórico nunca é substituído. Ele só cresce.**

A aba `BASE` acumula todos os meses do ano, das duas empresas. Quando agosto chegar, a BASE passa a ter **janeiro a agosto**, com as linhas de janeiro a julho intactas exatamente como estavam.

Está errado, e deve ser desfeito imediatamente, qualquer resultado em que:

- a BASE fique só com o mês novo;
- meses anteriores sumam, encolham ou mudem de valor;
- uma empresa suma ou encolha;
- a planilha seja recriada do zero em vez de receber linhas no fim.

Antes de salvar, confira a contagem: se a BASE tinha 13.213 linhas e os arquivos novos (as duas empresas somadas) têm 1.800 linhas de item, a BASE precisa terminar com 15.013. Qualquer número menor significa que algo foi apagado — **não salve**, registre no Calendar e pare.

O mesmo vale para os painéis: o seletor de período precisa ganhar um botão a mais a cada mês, nunca perder os anteriores, e o filtro de empresa precisa continuar com as duas empresas. Sem histórico não existe tendência, e tendência é o motivo de os dois painéis existirem.

---

## 3. Estrutura de pastas (Google Drive, unidade compartilhada)

São **dois ramos independentes** da unidade compartilhada: `Comercial` e `DIRETORIA`, no mesmo nível. A pasta `Curva ABC` fica dentro de `Comercial`; `DIRETORIA` fica **fora** dela.

```
<unidade compartilhada>/
├── Comercial/
│   └── Curva ABC/
│       ├── INSTRUCOES.md                este arquivo
│       ├── 00_REFERENCIA/
│       │   └── CLIENTESXTABELA*.csv, PROCESSADOS_*.md, EVENTOS_*.md
│       ├── 01_ENTRADA/                  onde os exports brutos são depositados (um por empresa)
│       │   └── processados/             para onde o bruto vai depois de processado
│       ├── 02_HISTORICO/                CURVA_ABC_<AAAA-MM>.xlsx (a planilha, com a aba BASE)
│       └── 03_RELATORIOS/               PAINEL_COMERCIAL_<AAAA-MM>.html
│
└── DIRETORIA/
    ├── 03_RELATORIOS/                   PAINEL_DIRETOR_<AAAA-MM>.html
    ├── METAS_<ano>.json                 metas definidas pelo diretor
    └── HISTORICO_METAS.json             faturamento por carteira desde 2022
```

Neste arquivo, `Curva ABC/...` sempre significa `Comercial/Curva ABC/...`.

A separação existe para controlar acesso: o painel da diretoria traz leitura de portfólio, metas e projeção, e não é distribuído ao time comercial. Os dois ramos têm uma subpasta chamada `03_RELATORIOS` — **confira sempre a pasta-mãe antes de gravar.** Nunca grave o painel do diretor em `Comercial/Curva ABC/03_RELATORIOS` nem o painel comercial em `DIRETORIA/03_RELATORIOS`.

---

## 4. As entradas

Duas são obrigatórias todo mês — **um export por empresa**. As demais são referências que mudam com frequências diferentes.

| Arquivo | Onde | Quando muda | Se faltar |
|---|---|---|---|
| Export do Forteplus — **INBRAS** | `01_ENTRADA` | todo mês | a empresa INBRAS não é processada nessa competência; registre pendência |
| Export do Forteplus — **MF** | `01_ENTRADA` | todo mês | a empresa MF não é processada nessa competência; registre pendência |
| `CLIENTESXTABELA*.csv` | `00_REFERENCIA` | **semanalmente** (às sextas), ou quando entra cliente novo / muda de tabela | use a versão anterior mais recente e registre no evento |
| `PROCESSADOS_<AAAA-MM>.md` | `00_REFERENCIA` | a cada competência importada | trate como se nenhum mês tivesse sido registrado e confie na aba BASE |
| `EVENTOS_<AAAA-MM>.md` | `00_REFERENCIA` | a cada evento criado no Calendar | comece um arquivo novo; não tente localizar eventos antigos |
| `METAS_<ano>.json` | `DIRETORIA` | quando o diretor redefine metas | use as metas do `HISTORICO_METAS.json` |
| `HISTORICO_METAS.json` | `DIRETORIA` | uma vez por ano, no fechamento | seção de metas fica sem histórico; registre no evento |

### 4a. Identificação da empresa pelo nome do arquivo

O export não diz sozinho de qual empresa é — **a empresa vem do nome do arquivo**:

- Nome contém `INBRAS` → empresa **01 INBRAS** (código 1).
- Nome contém `MF` ou `MINASFLOR` → empresa **02 MF** (código 2).
- Nome que não permita identificar a empresa, ou que case com as duas → **não importe esse arquivo.** Registre uma pendência no Calendar dizendo qual arquivo não pôde ser classificado e pare quanto a ele. Os outros arquivos identificáveis seguem normalmente.

O período (competência) continua vindo da coluna `Emissão` de dentro do arquivo, nunca do nome (seção 8). O nome serve só para a empresa.

### 4b. O CLIENTESXTABELA atualizado semanalmente

O `CLIENTESXTABELA` é regerado e reenviado **toda sexta**, junto com os exports. Como o conector não sobrescreve, reenviar com o mesmo nome criaria duplicatas. Duas regras:

1. **Leitura:** a rotina usa **sempre o CLIENTESXTABELA mais recente** da `00_REFERENCIA` — o de maior sufixo de data, ou, na falta de sufixo, o de `modifiedTime` mais recente.
2. **Nomeação (recomendada):** salve como `CLIENTESXTABELA_<AAAA-MM-DD>.csv`, com a data da geração. Isso mantém o histórico limpo e torna a leitura determinística. As versões antigas ficam como histórico; podem ser removidas manualmente de tempos em tempos, mas a rotina não depende disso.

Colunas do arquivo: `CODIGO; ATIVO; RAZAOSOCIAL; FANTASIA; TABELA`.

**O caminho dos arquivos novos, do começo ao fim:**

1. A pessoa exporta do Forteplus, **para cada empresa**, o relatório **Mercadorias Vendidas — Produto**, agrupado por cliente, com o período do mês fechado.
2. Salva os dois arquivos em `Comercial/Curva ABC/01_ENTRADA`, cada um com `INBRAS` ou `MF`/`MINASFLOR` no nome. Regera e salva o `CLIENTESXTABELA_<AAAA-MM-DD>.csv` em `00_REFERENCIA`.
3. A rotina encontra os arquivos, identifica a empresa de cada um (4a), lê, limpa (seção 6) e classifica (seção 7).
4. **Acrescenta** as linhas no fim da aba `BASE`, cada uma com sua empresa (seção 9).
5. Regenera a planilha e os dois painéis com todo o histórico, agora um mês maior, com as duas empresas e o filtro.
6. Cria `00_REFERENCIA/PROCESSADOS_<AAAA-MM>.md` com o conteúdo do anterior mais a linha da competência importada (uma linha por empresa, seção 4c).
7. Registra o resumo no Google Calendar, incluindo o lembrete de limpar a `01_ENTRADA`.

### 4c. O que fazer com os arquivos já processados

**O conector do Google Drive só lê e cria arquivos. Ele não move, não renomeia e não exclui.** Não tente contornar isso: copiar o arquivo para outra pasta deixaria o original na entrada e ele seria redetectado todo dia.

Por isso o controle é por registro, não por movimentação:

1. Depois de importar uma competência, leia o `PROCESSADOS_*` mais recente e crie o `PROCESSADOS_<AAAA-MM>.md` da competência nova, com todo o conteúdo anterior mais **uma linha por empresa importada**: `AAAA-MM | <empresa> | <nome do arquivo> | importado em <data> | <n> linhas`.
2. No evento de resumo do mês, inclua a frase: *mover os arquivos de `01_ENTRADA` para `01_ENTRADA/processados` — a rotina não consegue fazer isso sozinha.*
3. Se um arquivo continuar em `01_ENTRADA` nos dias seguintes e a competência dele **para aquela empresa** já estiver na BASE, **não faça nada e não crie evento nenhum.** Já foi avisado uma vez; repetir todo dia vira ruído.

A detecção de duplicidade nunca depende de onde o arquivo está: ela é feita comparando a **competência + empresa** do arquivo com o que já existe na aba `BASE`.

---

## 5. Fluxo de execução

A operação é **semanal: a tarefa roda toda sexta, às 17h**, e os arquivos das duas empresas mais o `CLIENTESXTABELA` são enviados nesse dia. A tarefa é um vigia: o gatilho é o arquivo aparecer, não a data do mês.

> Observação operacional: a v6 rodava diariamente às 9h para sustentar a janela de cobrança dos dias 1 a 5. Na operação semanal (sexta), essa cobrança diária **não se aplica**; quem envia os arquivos é o próprio operador, na sexta. Se voltar a ser necessário cobrar envio automaticamente entre os dias 1 e 5, a tarefa precisa voltar a rodar diariamente. Enquanto for semanal, siga esta seção.

Em cada execução:

**Há arquivo(s) novo(s) em `01_ENTRADA`** → para cada arquivo, identifique a empresa (4a) e a competência (coluna Emissão). Para cada par (competência × empresa) que **ainda não está na BASE**, execute as seções 6 a 15 na ordem. Processe as empresas presentes; se só uma das duas chegou, processe a que chegou e registre a ausência da outra como pendência.

**Não há arquivo novo, ou todas as competências/empresas presentes já estão na BASE** → não processe nada, não sobrescreva nada. Encerre em silêncio (ou registre "nada novo", conforme o operador preferir).

**Há arquivo, mas a competência daquela empresa já está na BASE** → não processe, e principalmente **não apague nem reescreva** o que já existe. Confira se esse par competência+empresa já consta no `PROCESSADOS_*`: se constar, encerre em silêncio (4c, item 3); se não constar, crie **um único** evento de pendência no Calendar avisando que aquele mês/empresa já estava na BASE e pedindo a limpeza da `01_ENTRADA`.

---

## 6. Leitura e limpeza do export

O arquivo do Forteplus não é uma tabela limpa. Aplique estas três regras antes de qualquer cálculo, **em cada arquivo de empresa**:

1. **Cabeçalhos repetidos** — o relatório repete o cabeçalho a cada página (`Cod | Emissão | Docto | Tp | Sr | CFOP | Cod. Produto | Quantidade | Total Venda | Desconto | Codigo Vendedor`). Descarte toda linha em que a coluna `Cod` contenha o texto `Cod`.
2. **Linhas em branco** — há uma linha vazia entre cada item. Descarte.
3. **Linha de agrupamento de cliente** — o cliente aparece sozinho na primeira coluna, no formato `NOME DO CLIENTE-1352`. Não é um item: é o cabeçalho do grupo. Guarde o valor e aplique a todas as linhas de item seguintes, até aparecer o próximo grupo.

Colunas relevantes de cada linha de item: emissão, documento, **série (`Sr`)**, CFOP, código do produto, descrição do produto, quantidade, total da venda, desconto, código do vendedor e nome do vendedor. A **empresa** de cada linha vem do arquivo de origem (4a), não do conteúdo.

---

## 7. Classificação por CFOP

Esta é a regra mais importante do processamento. Sem ela o relatório mede a coisa errada.

| Tipo | CFOPs | Entra na curva? |
|---|---|---|
| Venda | 5101, 5102, 5401, 5403, 6101, 6102, 6107, 6401, 6403, 7101, 7949 | **Sim** |
| Devolução | 1201, 1202, 1410, 1411, 2201 | **Sim** (valores negativos, abatem) |
| Bonificação | 5910, 5911, 6910, 6911 | Não — vai para a aba BONIFICACAO |
| Industrialização | 5901, 5902, 6901, 6902, 6903, 1901, 1902 | Não |

**Se aparecer um CFOP fora desta lista:** não adivinhe. Classifique como `Outros`, mantenha fora da curva e registre no evento do Calendar quantas linhas e qual valor ficaram nessa situação, para revisão humana.

Por que isso importa: em julho de 2026, 83% da quantidade movimentada no arquivo não era venda. Uma única linha de CFOP 6901 tinha 47.650 unidades — quatro vezes mais que todas as vendas do mês somadas.

**Bonificação nunca é faturamento.** Ela aparece em seção própria, no cashback como custo, e jamais soma ao valor vendido em qualquer parte dos painéis.

---

## 8. Regras de negócio

**Empresa.** Código 1 = INBRAS, 2 = MF, derivado do nome do arquivo (4a). É dimensão de toda linha na BASE e o eixo do filtro dos painéis.

**Chave de cliente.** O código vem no fim do nome do grupo (`ADAVILDA SOISA LIMA-1352` → código `1352`). **O código é a chave, nunca o nome.** Grafias variam entre meses (`ITALO AUGUSTO MEDICE` e `ITALO MEDICE`) e usar o nome cria clientes fantasmas. O mesmo código também aparece com razões sociais diferentes entre o Forteplus e as planilhas do comercial — o código resolve. O código de cliente é único no cadastro; a empresa é uma dimensão à parte, não faz parte da chave de cliente.

**Nome exibido.** Para cada código, use a grafia mais frequente em toda a BASE.

**Competência.** Derive de `Emissão`, no formato `AAAA-MM`. Não use o nome do arquivo nem a data de geração do relatório.

**Chave de produto.** Mesma lógica: código é a chave, descrição é só exibição.

**Faixas da curva ABC.** Por faturamento acumulado: **A** até 80%, **B** até 95%, **C** acima de 95%. O painel comercial permite alternar o critério para quantidade; quando isso acontece, as faixas são recalculadas sobre unidades e **todo o painel** muda junto, nunca metade em cada medida. As faixas também respeitam o filtro de empresa: ao filtrar por INBRAS ou MF, a curva é recalculada só com as linhas daquela empresa.

**Tabela de preço.** Vem do `CLIENTESXTABELA*.csv` mais recente (colunas `CODIGO; ATIVO; RAZAOSOCIAL; FANTASIA; TABELA`), cruzando pelo código do cliente. Tabelas em uso: ATACADISTA, VIP, VIP MAIS, REVENDA, SALÃO REF, DIRETORIA, e as variantes com sufixo CONDICAO. Cliente sem correspondência entra como `SEM TABELA` e é registrado no evento.

---

## 9. Atualização da BASE

A aba `BASE` da planilha mais recente em `Comercial/Curva ABC/02_HISTORICO/` é a única fonte de dados. Leia a de competência mais alta e **crie** a da competência nova; nunca tente gravar por cima. Todas as outras abas são fórmulas sobre ela.

- **Só acrescente linhas no fim.** Nunca reescreva, reordene, filtre ou apague o histórico. Ver seção 2.
- Antes de acrescentar, confira se o par **competência + empresa** já existe. Se existir, pare (seção 5).
- Colunas, nesta ordem: `Competencia | Empresa | Cod. Cliente | Cliente | Cod. Produto | Produto | CFOP | Serie | Tipo | Entra na curva | Quantidade | Valor | Desconto | Cod. Vendedor | Vendedor | Documento | Emissao`.
- A coluna `Empresa` guarda o código (1 ou 2); o rótulo `01 INBRAS` / `02 MF` é montado na exibição.

**Exemplo do que se espera em agosto:**

| | Antes | Depois |
|---|---|---|
| Competências na BASE | 2026-01 a 2026-07 | 2026-01 a 2026-08 |
| Empresas na BASE | INBRAS e MF | INBRAS e MF |
| Linhas | 13.213 | 13.213 + as dos dois arquivos novos |
| Botões de período nos painéis | 7 meses + 3 acumulados | 8 meses + 3 acumulados |
| Filtro de empresa | Todas / INBRAS / MF | Todas / INBRAS / MF |

As abas de análise (`ABC_GERAL`, `ABC_CLIENTE`, `MATRIZ`, `BONIFICACAO`) apontam para a competência mais recente: **elas mudam de mês, a BASE não.** `EVOLUCAO`, `MOVIMENTOS` e `ABC_SEMESTRE` usam o histórico inteiro.

---

## 10. Abas da planilha

| Aba | Conteúdo |
|---|---|
| `RESUMO` | Métricas do mês e a série mensal do ano |
| `ABC_GERAL` | Produtos do mês por faturamento, com % acumulado, classe e nº de clientes |
| `ABC_CLIENTE` | Cliente × produto, com a curva calculada dentro de cada cliente |
| `MATRIZ` | Produto × cliente em quantidade, do mês |
| `MOVIMENTOS` | Cliente × produto que comprava e parou |
| `EVOLUCAO` | Faturamento por cliente em cada mês, com média móvel e variação |
| `ABC_SEMESTRE` | Curva acumulada dos últimos 6 meses |
| `BONIFICACAO` | Venda, valor bonificado e percentual por cliente |
| `BASE` | Os dados, com a coluna Empresa. Não editar. |
| `LEIA-ME` | Resumo das regras, para quem abrir a planilha sem ler este arquivo |

**Critério de `MOVIMENTOS`:** cliente que comprou o item em pelo menos 2 dos 3 meses anteriores e não comprou no mês atual.

Requisitos de formatação: fonte Arial, valores como `R$ #,##0.00`, quantidades como `#,##0`, percentuais como `0,0%`, filtro ativado e painéis congelados no cabeçalho. **Use fórmulas, nunca resultados digitados** — a planilha precisa recalcular quando a BASE mudar. Verifique que não sobrou nenhum erro de fórmula antes de salvar.

---

## 11. Painel Comercial

Crie em `Comercial/Curva ABC/03_RELATORIOS/PAINEL_COMERCIAL_<AAAA-MM>.html`.

**Filtro por empresa** no topo — Todas (padrão), INBRAS, MF. Vale para o painel inteiro: ao trocar, todas as seções, indicadores, curvas e fichas recalculam só com as linhas daquela empresa. O mapa de empresas no dado é `{"1":"01 INBRAS","2":"02 MF"}`.

**Seletor de período** no topo — cada mês, últimos 3, últimos 6, ano todo. Tudo recalcula em JavaScript, inclusive a faixa de cada produto: **a classe A/B/C é sempre relativa ao período e à empresa selecionados.**

**Seletor de critério da curva** ao lado: faturamento (padrão) ou quantidade. Vale para o painel inteiro. No modo quantidade, exiba a ressalva de que unidades misturam sachê de 12 ml com máscara de 1 kg.

**Seções, nesta ordem:**

1. Indicadores do período: faturamento, clientes ativos, SKUs na faixa A, bonificação.
2. Gráfico do ano mês a mês, com o período selecionado destacado.
3. **Pedidos em condição** (seção 13).
4. **A curva completa** — Pareto com **todos** os SKUs do período. Duas linhas de corte, em 80% e 95%, e a contagem de SKUs de cada faixa no eixo.
5. **Todos os produtos por faixa** — a lista inteira com classe, faturamento, quantidade, % acumulado, nº de clientes e quantos faltam. Filtro por faixa.
6. **Ficha do cliente** (abaixo).
7. Bonificação por cliente, ordenada pelo percentual sobre a venda.
8. **Cashback** (seção 12).

**Ficha do cliente**, com busca por nome e todos estes blocos:

- indicadores, incluindo a variação do último mês contra a média dos 3 anteriores;
- faturamento dele mês a mês **no ano**, com o período selecionado em destaque;
- mix por faixa e o seletor de critério da curva, com a nota explicando o que muda;
- **evolução por faixa** — quanto comprou de A, B e C nos meses do período, com os meses do período anterior em cinza e o total;
- **evolução produto a produto** — o período selecionado contra o **período anterior de mesmo tamanho** (jul contra jun; mai–jul contra fev–abr). Quando o período anterior não existir ou for incompleto, diga isso no cabeçalho. Ordenar por quem mais cresceu em reais. Marcar `novo` e `zerou`;
- **o que ele compra**, com duas colunas de faixa: a do cliente e a geral;
- **produtos bonificados** — o que saiu como bonificação para ele no período, com quantidade, valor e total;
- **parou de comprar** — comprava no período anterior e sumiu no atual;
- **nunca comprou** — produtos fora do pedido dele, **das três faixas**, com filtro por faixa.

Clientes de tabela CONDIÇÃO aparecem marcados no seletor e com um indicador próprio na ficha.

---

## 12. Cashback

Mesma base, apurado **mês a mês**: a faixa de cada mês depende do quanto o cliente comprou naquele mês, e o percentual incide sobre a compra inteira. Num período de vários meses, o cashback é a **soma das apurações mensais** — nunca o percentual aplicado sobre o acumulado. Respeita o filtro de empresa.

**Grades por tabela** (mínimo → percentual):

| ATACADISTA | VIP | VIP MAIS |
|---|---|---|
| 5.000 → 2% | 5.000 → 4% | 3.000 → 4% |
| 7.500 → 2,5% | 8.000 → 5% | 5.000 → 5% |
| 10.000 → 3% | 15.000 → 6% | 10.000 → 6% |
| 15.000 → 3,5% | 25.000 → 7% | 20.000 → 7% |
| 20.000 → 4% | 40.000 → 8% | 35.000 → 8% |
| 30.000 → 4,5% | 60.000 → 9% | 50.000 → 9% |
| 40.000 → 5% | 120.000 → 10% | 80.000 → 10% |
| 60.000 → 5,5% | | |
| 80.000 → 6% | | |
| 100.000 → 6,5% | | |
| 120.000 → 7% | | |

Tabelas com sufixo CONDIÇÃO usam a grade da tabela base. **REVENDA, SALÃO REF e DIRETORIA ainda não têm grade definida** — clientes nessas tabelas entram como "sem programa" e são contados à parte, nunca estimados.

**O que a seção mostra:**

- indicadores: cashback do período, percentual sobre a compra, quantos não atingiram, quantos estão sem programa;
- **legenda das faixas**, com as três grades visíveis;
- **com direito** — cliente, tabela, compra no período, meses com direito, última faixa, cashback, meta para ativar (50% da compra) e **quanto falta para a próxima faixa**;
- **não atingiram** — quem comprou mas nunca chegou ao mínimo, ordenado pela menor distância;
- **evolução mês a mês** — cashback de cada cliente em cada mês do ano, com o período em destaque.

---

## 13. Pedidos em condição

Identificação: **cliente em tabela CONDIÇÃO + série 75** (campo `Sr` do export). As duas regras juntas.

Na série 75 a maior parte do movimento é bonificação, não venda. Por isso a seção separa os dois com um filtro — **venda**, **bonificação** ou **os dois** — abrindo em venda.

Onde fica: no Painel Comercial, logo abaixo do gráfico do ano mês a mês. Três visões alternáveis: por cliente, por mês e por produto.

**Duas regras que não podem ser quebradas:**

1. **Os valores são os que constam na nota fiscal.** A rotina não aplica multiplicador, não calcula valor fora de nota e não gera coluna, total ou arquivo que consolide faturado com não faturado. Se essa consolidação for pedida, ela é controle à parte, definido pela diretoria com a contabilidade, fora deste painel.
2. **A seção é recorte, não parcela.** Esses pedidos já estão dentro do faturamento total do painel. Somar a seção ao faturamento geral conta o mesmo pedido duas vezes. Quando for preciso dividir a carteira, o corte é por cliente — clientes de tabela condição contra os demais —, e essa divisão fecha com o total.

Mantenha na tela a nota explicando as duas coisas, para quem abrir o painel meses depois não interpretar errado.

---

## 14. Painel Diretor

Crie em `DIRETORIA/03_RELATORIOS/PAINEL_DIRETOR_<AAAA-MM>.html` — ramo separado, fora de `Comercial`.

**Filtro por empresa** (Todas / INBRAS / MF), mesmo mapa `{"1":"01 INBRAS","2":"02 MF"}`, respondendo em todas as seções. **Mesmo seletor de período**, abrindo em **ano todo**, com tudo respondendo ao filtro.

**Seções:**

1. **Metas e histórico** (seção 15).
2. **Tendência produto a produto** — todos os produtos com histórico em miniatura, faturamento, faixa, meses com venda, nº de clientes, variação e situação. Filtro por situação; clicar abre o detalhe.
3. **Detalhe do produto** — gráfico mensal com o nº de clientes sobreposto, lista de quem compra e uma leitura em texto.
4. **Faturamento por cliente** — todos, sem filtro de faixa, com histórico mensal, SKUs, meses ativos e bonificação. Clicar abre os produtos.
5. **Evolução por faixa, todos os clientes** — barra empilhada A/B/C por mês, para cada cliente. Alterna entre barras e números.
6. **Produto × cliente** — matriz completa, com intensidade de cor, cabeçalhos legíveis por inteiro e alternância entre quantidade e faturamento. Remova da exibição os CPF/CNPJ colados no fim dos nomes, mantendo o nome completo no `title`.

**Classificação da situação.** Divida o período em duas metades e compare:

| Situação | Critério |
|---|---|
| Novo | Sem venda na primeira metade e com venda na segunda |
| Descontinuado | Vendia na primeira metade e está zerado no fim do período |
| Esporádico | Venda em poucos meses do período (até 30% deles) |
| Crescendo | Segunda metade ≥ 25% acima da primeira |
| Caindo | Segunda metade ≥ 25% abaixo da primeira |
| Estável | Variação dentro de ±25% |

Com **um único mês selecionado não existe tendência**: marque tudo como `—` e diga isso na tela. Sinalize **concentração** quando mais da metade do faturamento do produto saiu num único mês — é sazonalidade ou pedido pontual, não tendência. É o que evita tirar de linha um produto que só vende em época certa.

---

## 15. Metas e histórico

Fonte: `DIRETORIA/HISTORICO_METAS.json`, com o faturamento por carteira (VIP, MG, Demais Estados, Berçário) desde 2022, mais as metas de cada ano. Origem original: a planilha *Apresentação Comercial acumulado*, mantida pelo diretor com o gestor comercial.

**O que a seção mostra:**

- indicadores do ano: realizado, meta do período, meta do ano, mesmo período do ano anterior e fechamento do ano anterior;
- **meta × realizado mês a mês**, barra tracejada para meta e cheia para realizado, verde quando bate e vermelho quando não;
- **simulador de metas** (abaixo);
- **carteiras mês a mês**, com seletor de ano, peso de cada carteira, linha de meta e linha de cobertura;
- **comparativo entre anos**, mesmo mês lado a lado, com variação calculada só sobre os meses fechados;
- **carteiras ano a ano**;
- **conciliação com o Forteplus** (abaixo).

**Simulador de metas.** Doze campos editáveis, um por mês, preenchidos com as metas vigentes. Ao alterar qualquer um, recalculam na hora: cobertura, total anual, o gráfico e cinco projeções — meta do ano, quanto falta, necessário por mês nos meses abertos, esforço sobre a média realizada, projeção no ritmo atual e projeção repetindo o ano anterior. Três ações: restaurar as metas do arquivo, distribuir uma meta anual pelos meses abertos, e copiar as metas em JSON.

**Persistência das metas.** O que o diretor edita fica no navegador dele. Para virar oficial, ele copia e cola em `DIRETORIA/METAS_<ano>.json`. **A rotina lê esse arquivo ao gerar o painel:** se existir, ele manda; se não existir, valem as metas do `HISTORICO_METAS.json`. Nunca sobrescreva o `METAS_<ano>.json` — quem escreve nele é o diretor.

**Conciliação obrigatória.** A planilha de metas conta bonificação como faturamento; o restante do painel não. Toda geração deve exibir o quadro: valor da apresentação, venda líquida no Forteplus, bonificação, soma das duas e a diferença que permanece. Em jan–jul de 2026 essa diferença residual foi de R$ 216.090 e não se explica pelos dados do ERP. **Não tente fechar a diferença ajustando número.** Mostre-a e registre no evento.

---

## 16. Conferências obrigatórias antes de salvar

Não salve nada sem passar por estas verificações:

0. **Você declarou a versão do INSTRUCOES.md** no início da execução, e ela é a 7.
1. **A BASE cresceu.** Total antes + linhas dos arquivos novos = total depois. Todas as competências e as duas empresas anteriores presentes, com os mesmos valores.
2. A soma do faturamento na planilha bate com a soma nos painéis, para o mesmo mês **e a mesma empresa** (e para Todas).
3. Nenhum erro de fórmula na planilha.
4. Nenhuma linha com CFOP `Outros` sem registro no evento.
5. **Empresa:** toda linha nova tem empresa (1 ou 2); nenhuma linha sem empresa; nenhum arquivo importado sem identificação de empresa. O filtro dos dois painéis mostra Todas / INBRAS / MF e recalcula ao trocar.
6. **Painel comercial:** o seletor de período tem um botão a mais que no mês passado; a curva mostra todos os SKUs; os filtros de faixa, de critério e de empresa respondem; a ficha do cliente abre com evolução, bonificados e gaps preenchidos.
7. **Cashback:** os totais batem com a apuração mês a mês; nenhum cliente de tabela sem grade aparece com valor estimado.
8. **Condição:** nenhum multiplicador aplicado; a seção soma menos que o faturamento total, nunca além dele.
9. **Painel do diretor:** o seletor recalcula a situação dos produtos; a matriz mostra os nomes sem corte; o filtro de empresa responde; o simulador de metas abre com os valores do `METAS_<ano>.json` quando ele existir; o quadro de conciliação aparece.
10. `PROCESSADOS_<AAAA-MM>.md` e `EVENTOS_<AAAA-MM>.md` foram **criados** com o sufixo da competência nova, trazendo todo o conteúdo dos anteriores, com uma linha por empresa importada. Nenhum arquivo foi gravado com nome já existente na pasta.
11. Cada arquivo na pasta certa — diretor em `DIRETORIA/03_RELATORIOS`, comercial em `Comercial/Curva ABC/03_RELATORIOS`.

Se alguma falhar: **não sobrescreva os arquivos existentes.** Salve a tentativa com o sufixo `_REVISAR`, descreva o problema num evento de pendência no Calendar e encerre.

---

## 17. Lembrete e resumo

### Lembrete de envio — Google Calendar

Na operação semanal, o envio dos arquivos é responsabilidade do operador na sexta; a cobrança automática dos dias 1 a 5 (evento recorrente da v6) **só se aplica se a tarefa voltar a rodar diariamente**. Se estiver rodando diariamente, valem as regras da v6: o lembrete é criado uma única vez, no dia 1, como evento recorrente de 5 dias (11h00–11h30, com quatro notificações antes: 90, 60, 30 e 0 min), com o ID salvo no `EVENTOS_<AAAA-MM>.md`, e apagado quando os arquivos chegarem ou a partir do dia 6.

**Guarde sempre o ID.** Logo após criar qualquer evento, leia o `EVENTOS_*` mais recente e crie `00_REFERENCIA/EVENTOS_<AAAA-MM>.md` com o conteúdo anterior mais uma linha: `<mês> | <tipo> | <ID do evento> | criado em <data>`. É esse ID que permite apagar o evento depois — **nunca dependa de buscar o evento pelo título.**

### Resumo do mês — evento de dia inteiro

Quando o mês for processado com sucesso, crie um **evento de dia inteiro, sem notificação**, no dia do processamento: `Curva ABC de <mês> pronta`. Na descrição:

- faturamento e variação contra a média dos 3 meses anteriores — **total e por empresa**;
- percentual de bonificação;
- nº de clientes ativos e de SKUs vendidos, e quantos na faixa A;
- **quantas competências a BASE passou a ter** e quais empresas entraram nesta competência;
- os 5 maiores casos de "parou de comprar", com cliente e produto;
- os 3 clientes com maior percentual de bonificação;
- **cashback do mês**, quantos clientes com direito e quantos ficaram a menos de R$ 500 do mínimo;
- **pedidos em condição** no mês: valor de venda e valor de bonificação, separados;
- **cobertura da meta** do mês e do acumulado do ano;
- o lembrete de mover os arquivos brutos de `01_ENTRADA` para `processados`;
- quantos produtos ficaram como `Descontinuado` no painel do diretor;
- qualquer CFOP não reconhecido, cliente sem tabela, arquivo de referência ausente **ou empresa que não enviou arquivo nesta competência**.

Se a rotina falhar em alguma conferência da seção 16, o evento muda de título para `Curva ABC de <mês> — REVISAR` e a descrição traz o problema em vez do resumo. Nesse caso, mantenha uma notificação para o mesmo dia, porque exige ação humana.

**Nunca procure eventos na agenda para decidir se cria ou não.** A busca do Calendar não é confiável: já retornou vazio para eventos que existiam. O controle de duplicata é feito pelo ID anotado no `00_REFERENCIA/EVENTOS_<AAAA-MM>.md`. Antes de criar qualquer evento, consulte esse arquivo; se já houver linha para o mês e o tipo, não crie de novo.

---

## 18. Coisas conhecidas

- **Duas empresas.** INBRAS (01) e MF (02) são processadas juntas na mesma BASE e nos mesmos painéis, separáveis pelo filtro de empresa. Se só uma enviar arquivo na competência, processe a que veio e registre a ausência da outra no evento.
- **Cadastro de vendedor.** O código 1638 está cadastrado no ERP como `FINANCEIRO APROVADO` e o 1610 como `CONECTA`. Não são vendedores reais. Enquanto não for corrigido no Forteplus, não produza análise por vendedor como se fosse confiável; apenas registre.
- **Nomes divergentes.** O mesmo código de cliente aparece com razões sociais diferentes entre o Forteplus e as planilhas do comercial. O código manda, sempre.
- **Bonificação alta.** Maio de 2026 teve 32,5% de bonificação sobre a venda, com o pior faturamento do semestre. Se algum mês passar de 30%, destaque no evento do mês.
- **Meta de 2026.** Fixada em R$ 6,2 milhões, 23% acima do fechamento de 2025. Com a média realizada até julho, bater exigiria vender 51,5% acima dessa média nos meses restantes. Registre esse esforço no evento do mês sempre que a cobertura acumulada ficar abaixo de 90%.
- **Unidade compartilhada.** Se uma das pastas não for encontrada, não crie estrutura nova nem salve no Drive pessoal. Registre a falha e encerre. Vale para `Comercial/Curva ABC` e para `DIRETORIA`.
- **Virada de ano.** Em janeiro do ano seguinte, não apague o ano anterior: crie `CURVA_ABC_<AAAA-01>.xlsx` com a BASE do zero (mantendo a coluna Empresa), acrescente o ano fechado ao `HISTORICO_METAS.json` e mantenha os arquivos antigos intactos.

---

A tarefa no Cowork roda **semanalmente, às sextas 17h** — decisão do operador. Os dois exports (INBRAS e MF) e o `CLIENTESXTABELA` são enviados nesse dia. Se a cobrança automática de envio dos dias 1 a 5 voltar a ser necessária, mude a tarefa para diária às 9h (seção 5).

**Limitações conhecidas das ferramentas.** O conector do Drive lê e cria, mas não sobrescreve, não move, não renomeia e não exclui — ver seções 1b e 4c. Se em algum momento você for gravar um arquivo cujo nome já existe na pasta, **pare**: o nome está errado, falta o sufixo da competência (ou da data, no caso do CLIENTESXTABELA). A busca de eventos do Calendar pode retornar vazio mesmo para eventos existentes: por isso todo controle é por ID salvo no `EVENTOS.md`, nunca por busca. Não invente contorno para isso: registre e siga. Se qualquer outra ação necessária esbarrar numa limitação parecida, faça o mesmo — registre no evento do Calendar em vez de improvisar.

*Última atualização: setembro de 2026 (v7 — duas empresas INBRAS/MF, dois arquivos de entrada por competência identificados pelo nome, coluna Empresa na BASE, filtro de empresa nos painéis, CLIENTESXTABELA semanal, operação semanal às sextas). Base inicial: janeiro a julho de 2026, 13.213 linhas. Saídas: planilha, Painel Comercial, Painel Diretor.*