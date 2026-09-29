# Manual Técnico — Sistema de Checklist de Pedidos

**Sistema:** Checklist de conferência de pedidos Comercial → Financeiro
**Responsável técnico:** TI — Matheus Baeta
**Última revisão:** 29/09/2026

---

## Sumário

1. [Identificação e finalidade](#1-identificação-e-finalidade)
2. [Origem — por que o sistema foi desenvolvido](#2-origem--por-que-o-sistema-foi-desenvolvido)
3. [Decisões de arquitetura](#3-decisões-de-arquitetura)
4. [Ambientes e credenciais](#4-ambientes-e-credenciais)
5. [Estrutura de arquivos](#5-estrutura-de-arquivos)
6. [Modelo de dados](#6-modelo-de-dados)
7. [Regras implementadas no banco](#7-regras-implementadas-no-banco)
8. [Controle de acesso](#8-controle-de-acesso)
9. [Leitor de espelho PDF](#9-leitor-de-espelho-pdf)
10. [Procedimentos de manutenção](#10-procedimentos-de-manutenção)
11. [Publicação](#11-publicação)
12. [Diagnóstico de problemas](#12-diagnóstico-de-problemas)
13. [Histórico de evolução](#13-histórico-de-evolução)
14. [Dívidas técnicas](#14-dívidas-técnicas)

---

## 1. Identificação e finalidade

Sistema web interno que formaliza a conferência de pedidos entre o Comercial e o Financeiro da Minasflor. O Comercial declara, item a item, que o lançamento no ERP Forteplus está correto; o Financeiro aprova ou recusa com motivo registrado; e o acúmulo dessas decisões vira indicador de qualidade do processo.

**O sistema não substitui nem se integra ao Forteplus.** O pedido continua sendo lançado no ERP normalmente. O checklist é uma camada paralela de conferência e registro. A única leitura automática do ERP é o PDF do espelho do pedido, exportado e importado manualmente pelo usuário.

**Usuários ativos:** 9 (3 administração, 3 comercial, 3 financeiro).

---

## 2. Origem — por que o sistema foi desenvolvido

A conferência acontecia por WhatsApp. O vendedor mandava os números do pedido no grupo, o Financeiro abria o ERP e conferia campo a campo, encontrava um erro, devolvia por mensagem, o vendedor corrigia e reenviava.

Três problemas vinham desse arranjo, e o sistema foi desenhado para atacar cada um:

**O mesmo erro se repetia sem virar número.** Não havia registro estruturado. Se a tabela de preço vinha errada toda semana, isso era sentido como irritação, nunca medido. Sem número, não há argumento para mudar processo ou treinar alguém. → O sistema registra cada recusa com motivo em lista fechada, e o painel de indicadores soma por motivo.

**A conferência era do lado errado.** Quem descobria o erro era quem recebia o pedido, não quem o cometeu — o ponto mais caro possível para descobrir. → O checklist de 14 itens é preenchido pelo vendedor antes de enviar, e responder "Não" em qualquer item bloqueia o envio.

**Não havia rastro da decisão.** Quem liberou, quando, com base em quê. → Decisões, pagamentos e finalizações são registros imutáveis, com autor, data e motivo.

---

## 3. Decisões de arquitetura

As escolhas abaixo foram deliberadas e resolvem problemas específicos. Quem for dar manutenção precisa entendê-las antes de alterar qualquer coisa.

### 3.1 Sem framework, sem build

O frontend é HTML, CSS e JavaScript puro, com ES modules carregados direto pelo navegador. Não há npm, bundler, nem etapa de compilação.

**Por quê:** o sistema tem duas telas e nove usuários. Um framework adicionaria uma cadeia de dependências que precisaria de atualização e manutenção, para resolver um problema de complexidade que o sistema não tem. Qualquer pessoa consegue abrir um arquivo e entender o que está escrito, sem instalar nada.

**Consequência:** publicar é copiar arquivos. E o código precisa ser legível, porque não há tipagem nem linter para proteger.

### 3.2 Regra de negócio no banco, não no frontend

Toda autorização e toda irreversibilidade estão implementadas em Row Level Security e triggers do PostgreSQL. O frontend apenas esconde botões e valida para dar retorno imediato ao usuário.

**Por quê:** o frontend é código que roda na máquina do usuário. Qualquer pessoa com o console do navegador aberto pode chamar a API diretamente. Se a regra estiver só na tela, ela não existe.

**Consequência:** para entender o que o sistema realmente permite, leia as policies e os triggers, não o JavaScript.

### 3.3 Situação derivada, nunca armazenada

Não existe coluna "status" no checklist. A situação é calculada em tempo de leitura pela view `checklists_situacao`:

```
se existe finalização           → Finalizado
senão se existe decisão vigente → status dessa decisão
senão                           → Em análise
```

**Por quê:** estado armazenado é estado que pode divergir. Com situação derivada, é impossível existir um checklist "aprovado" sem decisão de aprovação registrada.

### 3.4 Versão + decisão carimbada

O checklist tem um contador `versao`, que sobe a cada edição. Toda decisão do Financeiro carimba a versão em que foi tomada. **Decisão vigente** é a mais recente cuja versão é igual à versão atual do checklist.

**Por quê:** isso resolve o ciclo de correção sem nenhum comando explícito. Quando o Comercial edita um checklist recusado, a versão sobe e a decisão anterior deixa de ser vigente — o checklist volta para "Em análise" sozinho. Não há botão de "reabrir", não há estado intermediário, não há como esquecer de reverter algo.

O contador de recusas, por outro lado, ignora a versão, porque mede retrabalho acumulado e não pode zerar.

### 3.5 Append-only nos históricos

As tabelas `checklist_retornos`, `pagamentos` e `finalizacoes` só recebem INSERT. Não há UPDATE nem DELETE, e nenhuma policy os permite.

**Por quê:** auditoria completa sem esforço adicional. Correção de rota se faz por novo registro, não por edição do anterior. O histórico de pagamento, por exemplo, consegue mostrar "Thais alterou de Em negociação para Pago" justamente porque os dois registros existem.

### 3.6 Uma view como fonte única de leitura

As duas telas leem a mesma view `checklists_situacao`. Nenhum cálculo de valor total, situação ou contagem é refeito no frontend.

**Por quê:** quando o mesmo número é calculado em dois lugares, eles divergem. Sempre.

### 3.7 Leitura do PDF no navegador

O espelho do pedido é lido com pdf.js na máquina do usuário. O arquivo não é enviado ao servidor e não fica armazenado.

**Por quê:** não há motivo para guardar o PDF — o que interessa dele é extraído e gravado em colunas. Não transferir também elimina questões de armazenamento e privacidade.

---

## 4. Ambientes e credenciais

| Item | Valor |
|---|---|
| **Banco e autenticação** | Supabase, projeto `MF_INTERNO` |
| ID do projeto | `gibkxnvoqnvsvxtjhxyx` |
| Região | us-east-1 |
| URL da API | `https://gibkxnvoqnvsvxtjhxyx.supabase.co` |
| **Hospedagem** | Vercel, projeto `mf-checklist-pedidos` |
| Team | `mf-helpoint` |
| URL de produção | `https://mf-checklist-pedidos-mf-helpoint.vercel.app` |
| **Cadastro público** | Desativado — usuários são criados pelo TI |

### Sobre as chaves

O arquivo `config.js` contém a **chave publicável** do Supabase. Ela é pública por desenho: vai no JavaScript que roda no navegador de todo usuário. A segurança não vem de escondê-la, e sim do Row Level Security — sem sessão autenticada, essa chave não lê nada.

**A chave `service_role` nunca deve aparecer no frontend, em documentação ou em qualquer lugar versionado.** Ela ignora todas as políticas de segurança. Use apenas pelo painel do Supabase quando necessário.

### Bibliotecas externas

Carregadas por CDN, sem instalação:

| Biblioteca | Versão | Origem | Uso |
|---|---|---|---|
| `@supabase/supabase-js` | 2.45.4 | esm.sh | Cliente do banco e autenticação |
| `pdfjs-dist` | 4.7.76 | jsdelivr | Leitura do espelho PDF |

As versões estão fixadas de propósito. Atualizar exige testar a importação de espelho contra PDFs reais.

---

## 5. Estrutura de arquivos

Sete arquivos, todos na raiz do projeto:

| Arquivo | Responsabilidade |
|---|---|
| `entrar.html` | Login por e-mail e senha |
| `index.html` | Formulário do Comercial — criar e editar checklist |
| `historico.html` | Painel do Financeiro e histórico geral |
| `espelho.js` | Leitor do PDF do espelho do Forteplus |
| `supabase.js` | Cliente, sessão, perfil e logout |
| `config.js` | URL e chave publicável |
| `estilo.css` | Estilos, incluindo as regras de impressão que geram o PDF do checklist |

Cada HTML tem o seu JavaScript embutido em `<script type="module">`, ao final do arquivo. As telas não compartilham código entre si além de `supabase.js`, `espelho.js` e `config.js`.

---

## 6. Modelo de dados

### 6.1 `checklists` — um por atendimento

Agrupa de 1 a 10 pedidos do mesmo cliente.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid | PK |
| `protocolo` | text | Único. Formato `CK-AAAA-NNNNN`, gerado por trigger |
| `criado_em` | timestamptz | Imutável |
| `enviado_em` | timestamptz | Atualizado a cada reenvio |
| `editado_em` | timestamptz | Nulo enquanto nunca editado |
| `versao` | integer | Incrementa a cada edição |
| `criado_por` | uuid | FK `auth.users` |
| `criado_por_email` | text | Denormalizado — sobrevive à exclusão do usuário |
| `criado_por_nome` | text | Idem |
| `cliente` | text | Razão social |
| `cliente_codigo` | integer | Código do Forteplus |
| `cliente_novo` | boolean | `true` quando o código não existe na cópia local de clientes |
| `tabela_preco` | text | |
| `vendedor` | text | |
| `contato` | text | |
| `rota` | text | |
| `observacao` | text | Texto livre ao Financeiro |

### 6.2 `pedidos` — de 1 a 10 por checklist

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid | PK |
| `checklist_id` | uuid | FK, cascata na exclusão |
| `ordem` | integer | 1 a 10, único junto com `checklist_id` |
| `tipo` | text | Venda, Bonificação, Publicidade ou Cashback |
| `filial` | text | INBRAS ou MF |
| `numero` | text | Número do pedido no ERP |
| `valor` | numeric | Total líquido, já com desconto aplicado |
| `desconto` | numeric | Desconto concedido, informativo |
| `item_*` (14 colunas) | text | Sim, Não ou Não se aplica |
| `justificativa_bonificacao` | text | |
| `justificativa_cashback` | text | |
| `justificativa_publicidade` | text | |
| `qtd_coloracao` | integer | Só quando houve importação de espelho |
| `qtd_tonalizante` | integer | Idem |
| `espelho_total` | numeric | Idem |
| `espelho_st` | numeric | Idem |
| `importado_em` | timestamptz | Marca que o pedido veio de espelho |

**Os 14 itens, na ordem de exibição:**

| # | Coluna | Rótulo na tela |
|---|---|---|
| 1 | `item_codigo_cliente` | Código do cliente |
| 2 | `item_tipo_venda` | Tipo de venda |
| 3 | `item_orcamento_venda` | Orçamento convertido em Venda |
| 4 | `item_tabela_preco` | Tabela de preço |
| 5 | `item_natureza_operacao` | Natureza da operação |
| 6 | `item_serie` | Série |
| 7 | `item_forma_pagamento` | Forma e condição de pagamento |
| 8 | `item_transportadora` | Transportadora |
| 9 | `item_cobranca_duplicada` | Cliente Condição |
| 10 | `item_reserva` | Reserva ativada |
| 11 | `item_st` | Atualizar ST |
| 12 | `item_bonificacao` | Justificar bonificação |
| 13 | `item_cashback` | Justificar cashback |
| 14 | `item_publicidade` | Justificar publicidade |

Os itens 12, 13 e 14 abrem campo de justificativa obrigatório quando respondidos com "Sim".

### 6.3 `checklist_retornos` — decisões do Financeiro

Append-only. `id`, `seq` (identity, garante ordem cronológica), `checklist_id`, `versao`, `status` (Aprovado ou Recusado), `motivos` (array de texto), `observacao`, `atendente`, `registrado_por`, `registrado_em`.

### 6.4 `pagamentos` — acompanhamento da cobrança

Append-only. `seq`, `id`, `checklist_id`, `status` (Em negociação, Pago ou Recusado), `data_pagamento`, `observacao`, `atendente`, `registrado_por`, `registrado_em`.

### 6.5 `finalizacoes` — encerramento

Uma por checklist — `checklist_id` é a chave primária. Mais `atendente`, `observacao`, `registrado_por`, `registrado_em`.

### 6.6 Tabelas de apoio

**`clientes`** — cópia do cadastro do Forteplus, carga manual, ~444 registros. Colunas: `codigo` (PK), `razao_social`, `fantasia`, `tabela`, `ativo`, `atualizado_em`. Serve para autocompletar; **não bloqueia o envio** quando o cliente não está lá.

**`produtos`** — catálogo de colorimetria, ~82 registros. Colunas: `codigo` (PK), `descricao`, `grupo`, `categoria` (Coloração ou Tonalizante), `atualizado_em`. Usado para contar coloração e tonalizante na importação do espelho.

**`perfis`** — vínculo usuário → setor. `id` (PK, FK `auth.users`), `nome`, `setor`, `criado_em`.

**`acessos_por_email`** — mapa pré-cadastrado usado na criação de usuário. `email` (PK), `nome`, `setor`. **RLS ativo sem nenhuma policy**, ou seja, invisível pela API pública.

### 6.7 View `checklists_situacao`

Fonte única de leitura das telas. Devolve todos os campos do checklist mais:

| Campo | Cálculo |
|---|---|
| `qtd_pedidos` | Contagem de pedidos |
| `valor_total` | Soma de `valor` **apenas dos pedidos tipo Venda** |
| `itens_pendentes` | Quantos dos 14 itens estão como "Não", somados em todos os pedidos |
| `st_resumo` | ST pendente / ST atualizado / S/ST |
| `recusas` | Total histórico, de todas as versões |
| `historico_recusas` | JSON ordenado com tentativa, data, atendente, motivos e observação |
| `historico_pagamentos` | JSON ordenado, com o status anterior de cada transição |
| `retorno_*` | Última decisão cuja versão é igual à versão atual |
| `situacao` | Em análise, Aprovado, Recusado ou Finalizado |
| `pagamento_*` | Último registro de pagamento; padrão "Aguardando" |
| `finalizado_*` | Dados da finalização |

Criada com `security_invoker = on`, ou seja, respeita as permissões de quem consulta.

---

## 7. Regras implementadas no banco

### 7.1 Gatilhos ativos

| Tabela | Gatilho | Quando | O que faz |
|---|---|---|---|
| `checklists` | `checklists_antes_inserir` | BEFORE INSERT | Gera o protocolo com o ano em America/Sao_Paulo mais sequencial de 5 dígitos; preenche autor e data |
| `checklists` | `checklists_antes_atualizar` | BEFORE UPDATE | **Bloqueia se já aprovado**; preserva protocolo, data e autor originais; incrementa a versão |
| `checklist_retornos` | `impedir_decisao_repetida` | BEFORE INSERT | **Bloqueia se já recusado ou já aprovado** na versão atual; carimba versão e autor |
| `pagamentos` | `impedir_pagamento_apos_pago` | BEFORE INSERT | **Bloqueia se o último status for Pago** |
| `pagamentos` | `pagamentos_antes_inserir` | BEFORE INSERT | Carimba autor e data |
| `finalizacoes` | `finalizacoes_antes_inserir` | BEFORE INSERT | **Exige aprovado E pago**; carimba autor e data |
| `auth.users` | `criar_perfil_do_usuario` | AFTER INSERT | Cria o perfil a partir do mapa de acessos |

### 7.2 Função auxiliar

```sql
public.ultima_decisao(p_checklist uuid) returns text
```

Devolve o status da decisão mais recente cuja versão é igual à versão atual do checklist. É o coração da regra de versão — usada pelos gatilhos, pelas policies e pela view.

### 7.3 Restrições de domínio

| Tabela | Restrição |
|---|---|
| `pedidos` | `ordem` entre 1 e 10 |
| `pedidos` | `tipo` em Venda, Bonificação, Publicidade, Cashback |
| `pedidos` | `filial` em INBRAS, MF |
| `pedidos` | As 14 colunas `item_*` em Sim, Não, Não se aplica |
| `checklist_retornos` | `status` em Aprovado, Recusado |
| `checklist_retornos` | Pelo menos um motivo quando recusado |
| `checklist_retornos` / `pagamentos` / `finalizacoes` | `atendente` em Thais, Raquel, Francielli, Yuri |
| `pagamentos` | `status` em Em negociação, Pago, Recusado |
| `pagamentos` | Data obrigatória quando Pago |
| `checklists` | Cliente, vendedor e contato não vazios |
| `perfis` / `acessos_por_email` | `setor` em comercial, financeiro, admin |

### 7.4 Validações que existem só no frontend

Estas três não têm respaldo no banco e precisam ser observadas em qualquer alteração:

- Todos os 14 itens respondidos
- Nenhum item respondido "Não"
- Coerência do ST com o espelho importado

---

## 8. Controle de acesso

Três setores: `comercial`, `financeiro`, `admin`.

| Ação | comercial | financeiro | admin |
|---|:--:|:--:|:--:|
| Ler tudo | ✅ | ✅ | ✅ |
| Criar checklist e pedidos | ✅ | ❌ | ✅ |
| Editar checklist não aprovado | ✅ | ❌ | ✅ |
| Registrar decisão | ❌ | ✅ | ✅ |
| Registrar pagamento | ❌ | ✅ | ✅ |
| Finalizar | ❌ | ✅ | ✅ |
| Excluir checklist | ❌ | ❌ | ✅ |
| Ver indicadores de recusa | ❌ | ✅ | ✅ |

A condição padrão usada nas policies:

```sql
exists (
  select 1 from perfis p
  where p.id = auth.uid()
    and p.setor = any (array['comercial','admin'])
)
```

**Leitura é aberta a qualquer usuário autenticado** — todos veem todos os checklists. Foi uma decisão consciente para um time de nove pessoas. Usuário não autenticado não lê nada: não existe policy para o papel `anon`.

### Usuários cadastrados

| E-mail | Nome | Setor |
|---|---|---|
| ti@minasflor.com.br | Matheus Baeta | admin |
| mairon@minasflor.com.br | Mairon | admin |
| suporte2@minasflor.com.br | Yuri | admin |
| comercial@minasflor.com.br | Fenício | comercial |
| vendas3@minasflor.com.br | Jacqueline | comercial |
| vendas4@minasflor.com.br | Julia | comercial |
| contasareceber@minasflor.com.br | Thais | financeiro |
| contasapagar@minasflor.com.br | Raquel | financeiro |
| financeiro@minasflor.com.br | Francielli | financeiro |

Atendentes que aparecem para escolher ao aprovar, registrar pagamento ou finalizar: **Thais, Raquel, Francielli e Yuri**.

---

## 9. Leitor de espelho PDF

Arquivo `espelho.js`. É a parte mais delicada do sistema e a que mais depende de teste com arquivos reais.

### 9.1 Layouts suportados

Dois modelos do Forteplus: **Pedido I** e **Pedido IV**. Qualquer outro modelo o sistema não lê.

### 9.2 Reconstrução de linhas

O PDF não delimita colunas — entrega fragmentos de texto com coordenadas. A função `lerLinhas` reconstrói:

1. Agrupa os fragmentos por linha usando `arredondar(y / 3)` como chave
2. Ordena os grupos por `y` decrescente, e cada grupo por `x` crescente
3. Concatena inserindo **espaço duplo** quando o vão horizontal passa de 4 unidades

Esse espaço duplo é o que permite as expressões regulares distinguirem as colunas.

### 9.3 Extração dos itens

```js
// Pedido I — Cod Produto NCM %Icms Quant UN Vlr.unit Total
/^(\d{1,6})\s+(.+?)\s+(\d{8})\s+[\d.,]+\s+([\d.,]+)\s+UN\s+([\d.,]+)\s+([\d.,]+)/

// Pedido IV — Cod Produto MINASFL… Qnt R$unit R$desc R$total
/^(\d{1,6})\s+(.+?)\s+(?:MINASFL\w*\s+)?([\d.,]+)\s+R\$\s?([\d.,]+)\s+R\$\s?([\d.,]+)\s+R\$\s?([\d.,]+)/
```

**Defeito conhecido do Pedido IV:** a quantidade às vezes quebra em duas linhas — `10,00` numa, `0` na seguinte. Ao encontrar quantidade no formato `\d+,\d{2}`, o código olha até duas linhas adiante procurando `^(?:OR\s*)?(\d{1,3})$` e reconstitui o número.

### 9.4 Extração do rodapé

Os dois layouts usam os mesmos rótulos:

```
TOTAL: R$3.628,14            ← bruto, soma dos itens
(-) DESCONTO: R$0,00         ← desconto global
TOTAL LÍQUIDO: R$3.628,14    ← bruto menos desconto; é o valor do pedido
(+) VALOR ST: R$0,00
TOTAL DO PEDIDO: R$4.348,44  ← líquido + ST + frete + IPI
```

Expressões usadas:

```js
bruto     /\bTOTAL:\s*R\$\s?([\d.,]+)/i
desconto  /\(-\)\s*DESCONTO:\s*R\$\s?([\d.,]+)/i
líquido   /TOTAL L[IÍ]QUIDO:\s*R\$\s?([\d.,]+)/i
ST        /VALOR ST:\s*R\$\s?([\d.,]+)/i
pedido    /\bVenda\s+(\d{3,8})\b/i  ou  /PEDIDO N[ºO°]?:?\s*(\d{3,8})/i
cliente   /Cliente:\s*(\d{2,6})\b/i
```

A expressão do bruto também casaria com "PESO TOTAL:", mas a exigência de `R$` logo depois resolve, porque o peso não traz cifrão.

### 9.5 Validação — a parte crítica

**Duas conferências independentes, ambas obrigatórias, tolerância de R$ 0,02:**

```
somaBate     = |soma dos itens − bruto| < 0,02
descontoBate = |(bruto − desconto) − líquido| < 0,02
aceita = somaBate E descontoBate
```

Se qualquer uma falhar, **nada é importado** e a mensagem diz qual falhou. Importar valor errado é pior do que digitar à mão.

> **Erro histórico:** a primeira versão comparava a soma dos itens com o **líquido**, o que quebrava em todo pedido com desconto. A soma dos itens corresponde ao **bruto**.

### 9.6 O que a importação preenche

Número do pedido, filial, valor, desconto, `espelho_total`, `espelho_st`, `importado_em`, e a contagem de coloração e tonalizante. Se o cliente ainda não estiver escolhido, também o código e o nome.

### 9.7 Travas da importação

| Situação | Comportamento |
|---|---|
| PDF fora dos dois layouts | Avisa que só funciona com Pedido I ou Pedido IV |
| Soma dos itens não bate com o bruto | Não importa nada, aponta a soma |
| Bruto menos desconto não dá o líquido | Não importa nada, aponta o desconto |
| Espelho de cliente diferente do checklist | Não importa, nomeia os dois códigos |
| Código do cliente não existe na cópia local | **Importa**, preenche o código e pede o nome |

---

## 10. Procedimentos de manutenção

### 10.1 Cadastrar novo usuário

Dois passos, nesta ordem:

```sql
-- 1. registrar no mapa, ANTES de criar o usuário
insert into public.acessos_por_email (email, nome, setor)
values ('novo@minasflor.com.br', 'Nome da Pessoa', 'comercial');
```

**2.** Criar o usuário no painel do Supabase, em Authentication → Users → Add user, com o mesmo e-mail. O gatilho cria o perfil automaticamente.

Se o gatilho não disparar — já aconteceu com usuário recriado ou criado por convite — insira o perfil à mão:

```sql
insert into public.perfis (id, nome, setor)
select u.id, 'Nome da Pessoa', 'comercial'
from auth.users u where lower(u.email) = 'novo@minasflor.com.br'
on conflict (id) do update set nome = excluded.nome, setor = excluded.setor;
```

### 10.2 Mudar o setor de um usuário

```sql
update public.acessos_por_email set setor = 'financeiro'
where email = 'pessoa@minasflor.com.br';

update public.perfis p set setor = 'financeiro'
from auth.users u
where u.id = p.id and lower(u.email) = 'pessoa@minasflor.com.br';
```

A pessoa precisa sair e entrar de novo para a tela reconhecer o novo perfil.

### 10.3 Incluir ou remover atendente do Financeiro

A lista está travada em três restrições. Todas precisam ser alteradas juntas:

```sql
alter table public.checklist_retornos drop constraint atendente_valido;
alter table public.checklist_retornos add constraint atendente_valido
  check (atendente in ('Thais','Raquel','Francielli','Yuri','NovoNome'));

alter table public.pagamentos drop constraint pagamentos_atendente_check;
alter table public.pagamentos add constraint pagamentos_atendente_check
  check (atendente in ('Thais','Raquel','Francielli','Yuri','NovoNome'));

alter table public.finalizacoes drop constraint finalizacoes_atendente_check;
alter table public.finalizacoes add constraint finalizacoes_atendente_check
  check (atendente in ('Thais','Raquel','Francielli','Yuri','NovoNome'));
```

Depois, acrescentar `<option>NovoNome</option>` nos **três** seletores de `historico.html` — nos modais de análise, pagamento e finalização — e republicar.

**Ao remover alguém:** não retire o nome das restrições se já existirem registros com ele, ou a alteração falha. Basta tirar dos seletores da tela.

### 10.4 Incluir ou alterar item do checklist

Quatro etapas:

```sql
-- 1. nova coluna
alter table public.pedidos
  add column item_nova_chave text not null default 'Não se aplica';
alter table public.pedidos alter column item_nova_chave drop default;

-- 2. incluir na restrição de respostas (recriar inteira, com todas as colunas)
alter table public.pedidos drop constraint respostas_validas;
alter table public.pedidos add constraint respostas_validas check (
  item_codigo_cliente in ('Sim','Não','Não se aplica') and
  -- … todas as demais …
  item_nova_chave in ('Sim','Não','Não se aplica')
);

-- 3. incluir na contagem de itens_pendentes, recriando a view
--    (adicionar + (case when item_nova_chave='Não' then 1 else 0 end))
```

**4.** Acrescentar a entrada na constante `ITENS` de `index.html` **e** de `historico.html`, na posição desejada. Se o item pedir justificativa, incluir também em `COM_JUSTIFICATIVA` e criar a coluna correspondente.

> O `default` na criação evita quebrar os registros existentes; removê-lo em seguida garante que novos registros informem a resposta explicitamente.

### 10.5 Incluir motivo de recusa

Editar a lista `MOTIVOS` em `historico.html` e republicar. Não há restrição no banco — o campo é array de texto livre.

### 10.6 Atualizar a cópia de clientes

Exportar o cadastro do Forteplus e recarregar a tabela `clientes`. Enquanto isso não é feito, os vendedores digitam os clientes novos à mão e o sistema marca `cliente_novo = true`.

Para saber quantos estão pendentes:

```sql
select cliente_codigo, cliente, count(*) as vezes
from public.checklists
where cliente_novo
group by 1, 2
order by vezes desc;
```

### 10.7 Atualizar o catálogo de colorimetria

Produto novo de colorimetria só é contado na importação depois que o catálogo for atualizado. Exportar o `EXP_COLORIMETRIA.xls` do ERP e recarregar a tabela `produtos`.

**Regra de classificação:** grupos `COLORACAO` e `COLORFIX` → categoria `Coloração`; `TONALIZANTES` → `Tonalizante`. OX, pó descolorante e produtos inativos ficam de fora.

---

## 11. Publicação

O site é estático: publicar é enviar os sete arquivos para a raiz do projeto na Vercel.

**Pelo painel:** acessar o projeto `mf-checklist-pedidos` no Vercel e arrastar os sete arquivos na área de novo deploy. Sem subpasta.

**Antes de publicar,** conferir a sintaxe do JavaScript de cada HTML. Como não há etapa de build, um erro de sintaxe só aparece quando o usuário abre a tela:

```bash
# extrai o bloco <script type="module"> e valida
node --check arquivo.mjs
```

### Recomendação pendente

Conectar o projeto da Vercel a um repositório Git. Hoje cada publicação envia o site inteiro; com repositório, cada alteração vira um envio pequeno e a Vercel publica sozinha. Isso também dá histórico de versões, que hoje não existe.

---

## 12. Diagnóstico de problemas

| Sintoma | Causa provável | Verificação |
|---|---|---|
| Usuário loga mas não vê nada | Perfil não foi criado | `select * from perfis p join auth.users u on u.id=p.id where u.email='...'` |
| "Este checklist já foi recusado" ao tentar decidir | Gatilho `impedir_decisao_repetida` — correto | O Comercial precisa editar e reenviar |
| "Checklist já aprovado não pode ser alterado" | Gatilho `checklists_antes_atualizar` — correto | Aprovação é definitiva |
| "Só dá para finalizar depois que o pagamento for confirmado" | Gatilho `finalizacoes_antes_inserir` — correto | Registrar o pagamento como Pago antes |
| Importação recusa um espelho que parece certo | Soma dos itens ou desconto não fecha | Conferir TOTAL, (-) DESCONTO e TOTAL LÍQUIDO no PDF |
| Importação não conta coloração de um produto | Produto ausente do catálogo | `select * from produtos where codigo = ...` |
| Valor total menor que a soma dos pedidos | Comportamento correto | Só pedidos tipo Venda somam |
| Tela em branco após publicar | Erro de sintaxe no JavaScript | Console do navegador; validar antes de publicar |

### Consultas úteis

```sql
-- situação geral
select situacao, count(*) from checklists_situacao group by 1;

-- checklists parados em análise há mais de 24 horas
select protocolo, cliente, vendedor, enviado_em
from checklists_situacao
where situacao = 'Em análise' and enviado_em < now() - interval '24 hours'
order by enviado_em;

-- ranking de motivos de recusa
select motivo, count(*) as vezes
from checklist_retornos, unnest(motivos) as motivo
where status = 'Recusado'
group by 1 order by vezes desc;

-- checklists com mais idas e voltas
select protocolo, cliente, vendedor, recusas
from checklists_situacao where recusas > 0 order by recusas desc;
```

---

## 13. Histórico de evolução

| Etapa | O que entrou |
|---|---|
| Base | Checklist com cliente, pedidos e itens; painel do Financeiro; aprovação e recusa com motivo |
| Múltiplos pedidos | De 1 para até 10 pedidos por atendimento |
| Ciclo de correção | Versão do checklist, decisão carimbada por versão, edição e reenvio |
| Pagamento | Acompanhamento pós-aprovação com histórico de transições; Pago irreversível |
| Finalização | Aba Finalizados; exige aprovado e pago |
| Bloqueio por "Não" | Item respondido "Não" passou a impedir o envio |
| Leitor de espelho | Importação do PDF com contagem de coloração e tonalizante e validação de soma |
| Validação de ST | Coerência entre a resposta de ST e o valor lido do espelho |
| Itens novos | "Orçamento convertido em Venda" e "Reserva ativada" — de 12 para 14 itens |
| Valor total | Passou a considerar apenas pedidos tipo Venda |
| Cliente livre | Código, nome e tabela sempre digitáveis; deixou de depender da cópia de clientes |
| Desconto | Leitura do desconto do espelho e campo próprio; validação em duas contas |

---

## 14. Dívidas técnicas

Registradas para quem for dar manutenção ou reconstruir o sistema em outra plataforma.

**1. Listas travadas em código e restrições.** Atendentes, vendedores, motivos de recusa, tipos de pedido e filiais estão em constantes no HTML ou em CHECK constraints. Cada mudança de pessoa exige migração de banco. Deveriam ser tabelas de configuração.

**2. Os 14 itens são colunas.** O modelo funciona para uma empresa, mas não sobrevive a um segundo cliente com checklist diferente. O correto seria uma tabela de respostas com os itens vindos de configuração.

**3. Leitura aberta a qualquer autenticado.** Aceitável para nove pessoas; inadequado em ambiente multi-empresa.

**4. `clientes` e `produtos` sem sincronização.** Carga manual do Forteplus. Não há rotina nem aviso de desatualização.

**5. Três validações só no frontend.** Itens respondidos, bloqueio por "Não" e coerência de ST não têm respaldo no banco.

**6. Gatilho de criação de perfil não cobre todos os casos.** Usuário recriado ou criado por convite pode não receber o perfil automaticamente.

**7. Edição regrava os pedidos.** O update apaga e reinsere todos os pedidos do checklist, então os identificadores mudam a cada versão. Não há histórico do que mudou entre versões — só se sabe que a versão subiu.

**8. Protocolo com sequencial global.** Em ambiente multi-empresa, deveria ser por empresa.

**9. Coluna `motivo` legada.** Resquício de quando havia um motivo só por recusa; mantida preenchida com o primeiro da lista.

**10. Publicação sem versionamento.** Sem repositório Git, não há histórico nem como reverter uma publicação.

**11. Desconto por item não separado.** O leitor extrai apenas o desconto global do rodapé. O layout Pedido IV tem também desconto por item, já embutido no total de cada linha.

---

## Anexo — o que o dono pediu para o Helpoint (2026-09-29)

Texto do dono, enviado junto com este manual ao pedir que o checklist viva dentro do Helpoint (LEVA S
em `docs/plano-geral.md`).

**18.4. Indicadores e relatórios.** Criar um dashboard com:

* Total de vendas registradas pelo Comercial.
* Total de vendas conciliadas.
* Quantidade e valor de pendências.
* Quantidade e valor de divergências.
* Total de recebimentos confirmados.
* Percentual de conciliação no período.

**18.5. Integração com os KPIs comerciais.** O Checklist deverá funcionar como uma das fontes de
validação dos indicadores comerciais e financeiros.

* O Comercial continuará sendo a fonte dos lançamentos de vendas e pedidos.
* O Financeiro será responsável por confirmar os recebimentos.
* O Checklist realizará o cruzamento e identificará divergências.
* Os dashboards deverão distinguir vendas registradas, faturamento fiscal e valores efetivamente recebidos.

Resultado esperado: estabelecer uma rotina confiável de conferência entre Comercial e Financeiro,
reduzindo divergências e garantindo que os indicadores apresentados à Diretoria sejam calculados com
base em informações conciliadas.
