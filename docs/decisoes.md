# Decisões de arquitetura

Uma seção por decisão, numerada na ordem em que foi tomada. Decisão nova entra
no fim; decisão revogada ganha a linha **Revogada por ADR-NNN** e fica.

## ADR-001 — Supabase é o backend

**Data:** 2026-09-03. **Status:** vigente.

O backend do Helpoint é a Supabase: PostgreSQL com login (GoTrue), API
(PostgREST), storage, realtime e edge functions. A SPA fala direto com o banco;
a regra de negócio vive em RLS, triggers, funções SQL e edge functions.

Hoje roda na Supabase Cloud (`docs/ambientes.md`). Quando o volume de clientes
justificar, migra para uma VPS (Hostinger, Coolify) rodando **Supabase
self-hosted** — o mesmo software, o mesmo Postgres, por `pg_dump`/restore.

**Não** se troca por Postgres puro com backend próprio: isso refaria login,
API, storage e as ~460 policies de RLS que dependem de `auth.uid()`. Se um dia
a Supabase self-hosted não atender, a saída é trocar serviço por serviço atrás
dos hooks existentes — nunca reescrever o front.

Gatilho de revisão: custo mensal da Cloud ou limite de recurso que o plano não
cubra.

## ADR-002 — Front em Next.js, mantendo a Supabase

**Data:** 2026-09-03. **Status:** vigente, execução prevista após a base
portável (`docs/deploy.md`, CI verde).

O front migra de Vite/react-router para Next.js (App Router) por **porte** do
código existente: componentes, hooks, TanStack Query e o cliente Supabase
ficam; muda roteador, build e a criação do cliente (`@supabase/ssr`).

Motivos: a home pública `/` precisa de SEO e preview de link (renderização no
servidor); um lugar para código de servidor quando uma tela precisar; um
container só no Coolify.

Regra do porte: regra de negócio **continua** no banco e nas edge functions.
Route handlers e server actions nascem só quando uma tela precisar deles —
não para duplicar o que a Supabase já faz.

## ADR-003 — E-mail: GoTrue por SMTP; funções por `_shared/email.ts`

**Data:** 2026-09-03. **Status:** implantado no `test-helpoint` (migration `20260903200000_remove_fila_de_email`; SMTP fica `enabled = false` até a chave do Resend existir — passos em `docs/ambientes.md`).

E-mails de autenticação (confirmação, recuperação, convite, magic link) são
enviados pelo próprio GoTrue via SMTP, com templates em português versionados
em `supabase/templates/` e configurados em `supabase/config.toml`. Não há
webhook, fila nem função no caminho.

E-mails transacionais das edge functions (`invite-signup`, `send-sac-otp`,
`staff-signup`, `daily-email-verify`) passam por `_shared/email.ts`, que
escolhe o fornecedor por `EMAIL_PROVIDER`: `resend` agora, `smtp` (Hostinger)
quando for a hora. Trocar fornecedor é trocar variável de ambiente.

## ADR-004 — Time de agentes

**Data:** 2026-09-03. **Status:** implantado em 2026-09-04 — os quatro agentes existem em `.claude/agents/`, fluxo em `docs/agents/fluxo.md`.

Quatro subagentes em `.claude/agents/`, cada um com modelo e skills próprios
(`docs/agents/fluxo.md`): **planejador** (Fable 5.1) lê e decide a abordagem;
**executor** (Sonnet 5) aplica plano escrito; **auditor** (Fable 5.1) revisa
e prova; **aprovador** (Sonnet 5) monta o dossiê. O merge, o deploy e as
decisões de schema, RLS e regra de negócio são do humano.

## ADR-005 — O Helpoint é um produto; a Minasflor é o primeiro cliente

**Data:** 2026-09-06. **Status:** **Superada por ADR-010** (2026-09-18).
O texto fica por inteiro: ele explica por que a separação de dados por empresa
existe, e essa separação continua no banco.

O sistema será **vendido a outras empresas**. A Minasflor é o cliente nº 1 —
o piloto que produz o dado de uso que hoje não existe — e não o único.

Isso muda o que "pronto" significa. Para uso interno, uma empresa alcançar
dado de outra seria detalhe, porque só haveria uma. Para produto, é o item
número um: risco de contrato, de reputação e de lei. Consequências:

- **Isolamento entre empresas é requisito de produto, não bug.** Qualquer
  caminho em que um usuário — funcionário ou cliente de SAC — alcance dado de
  outra empresa é **bloqueio** antes do primeiro cliente externo. Entra aí o
  cliente que troca o próprio `tenant_id` em `customer_profiles`
  (`docs/nao-funciona.md`, "Buracos de segurança").
- **Isolamento se prova, não se presume.** "Achamos que está separado" não
  vende. A suíte pgTAP sobre as policies de isolamento cresce antes do primeiro
  contrato de fora; em 2026-09-06 eram 17 asserções para ~309 policies.
- **A home pública ganha motivo.** O porte para Next.js (ADR-002) deixa de ser
  "quando der" e passa a ter razão de produto: cara pública, SEO, preview de
  link. Se vem antes ou depois das telas novas continua decisão aberta.
- **Marketing e módulos novos nascem já multi-tenant.** As 6 tabelas de MKT
  sem trigger de `tenant_id` e as 5 fora do MKT (`nao-funciona.md`, "Dívidas
  de base") passam de "dívida" a pré-requisito.

Gatilho de revisão: nenhum. Esta é a razão de o projeto existir.

## ADR-006 — CRM do Comercial: funil simples, dinheiro pelo Stripe, Bling e WhatsApp depois

**Data:** 2026-09-09. **Status:** vigente.

O módulo Comercial ganha um CRM para a equipe de vendas interna, no lugar do
Kommo — que a Minasflor usa e considera complexo demais. A pesquisa
(`docs/pesquisa-crm-comercial.md`) mostrou que a complexidade do Kommo está
nas automações e integrações, não no funil; o funil é o que vale copiar.

Decisões do dono, com o que cada uma implica:

- **Primeira versão (CRM-1):** funil com etapas, cartão do negócio (notas,
  tarefas, linha do tempo), catálogo e **pedido interno com link de
  pagamento**. Em seguida, nesta ordem: CRM-2 pedido pago vira pedido no
  Bling; CRM-3 lojinha pública; CRM-4 WhatsApp. Cada uma com plano próprio.
- **Dinheiro pelo Stripe primeiro.** Cartão e boleto já; Pix é por convite
  (pedir). Link temporário = Checkout com validade de 30 min a 24 h; link
  definitivo = Payment Link. O Bling Conta Digital fica como alternativa para
  Pix se o convite não vier. Hoje uma conta Stripe só, com a chave nos
  segredos das edge functions; Stripe Connect por empresa entra quando houver
  o segundo cliente que venda.
- **Stripe → Bling é obra nossa** (webhook → edge function → API v3 do
  Bling), com fila e idempotência por `event.id`. O Bling não fala com o
  Stripe sozinho.
- **WhatsApp em leva própria**, pela API oficial da Meta, com número dedicado
  **configurável por empresa no painel**; nada de conexão não oficial (risco
  de banimento num produto vendável). O número que hoje está no Kommo não
  migra sem perder o histórico — decisão na hora da CRM-4.
- **Cinco etapas padrão** (Novo → Em contato → Orçamento enviado → Negociação
  → Ganho / Perdido), nomes editáveis por empresa; "Ganho" e "Perdido" são
  tipos, não nomes — o sistema os reconhece por tipo.
- **Tarefas do negócio usam a tabela `tasks` existente** (`source_type =
  'crm_deal'`); o lead do site entra por edge function pública que cria
  contato + negócio na primeira etapa e avisa a equipe.

**WhatsApp, decidido em 2026-09-13 (CRM-4a):**

- **A conversa vive dentro do negócio**, na linha do tempo, e não numa caixa de
  entrada à parte. Quem abre o negócio daqui a um mês vê a venda inteira num
  lugar só. A caixa de entrada estilo Kommo foi considerada e recusada **por
  tamanho**, não por mérito: é leva própria, e o valor dela só aparece para quem
  atende o dia inteiro. Gatilho de revisão: alguém atendendo em tempo integral
  pelo Helpoint.
- **Mensagem de número desconhecido vira lead sozinha** — contato, negócio na
  primeira etapa do funil padrão e a mensagem, numa transação só. Lead que
  chega no WhatsApp e ninguém anota é lead perdido, que é a razão de a
  integração existir. O preço aceito: engano e spam também viram cartão.
- **O número da Minasflor que está no Kommo fica onde está por ora.** O dono
  decidiu escolher entre migrar e usar um número novo **depois de ver
  funcionando** — o sistema não depende de qual seja.
- **A mensagem-modelo (template) entra na CRM-4b.** A Meta só deixa escrever
  livremente nas 24 h desde a última mensagem do cliente; fora disso exige texto
  aprovado por ela e **cobra por envio**. O dono quis o recurso, e ele vem
  separado porque depende de aprovação externa e de custo por mensagem.

Gatilho de revisão: segundo cliente que venda pelo Helpoint (Stripe Connect);
resposta da Stripe sobre Pix (Bling Conta Digital ou não); alguém atendendo em
tempo integral pelo WhatsApp do Helpoint (caixa de entrada própria).

## ADR-007 — Twenty CRM é referência, não componente; automações viram motor de fluxo no banco

**Data:** 2026-09-10. **Status:** vigente.

O dono perguntou se um fork do Twenty CRM (`twentyhq/twenty`, open source,
AGPL-3.0) ajudaria o CRM do Comercial. A leitura do código
(`docs/pesquisa-twenty-crm.md`) mostrou um sistema bom, mas inteiro: servidor
NestJS, Redis, worker, um schema Postgres por empresa e permissões aplicadas
em TypeScript. Rodá-lo ao lado duplicaria login, empresa e contato; trocar o
nosso CRM por ele jogaria fora o CRM-1 e a cadeia pedido → pagamento → negócio
que vive no mesmo banco (ADR-006). E o código é AGPL: copiá-lo obrigaria a
abrir o Helpoint, que é proprietário.

Decisões do dono, com o que cada uma implica:

- **O Twenty é referência de produto.** Nenhum código dele entra. Entram
  padrões, listados na seção 8 da pesquisa, distribuídos em cinco levas.
- **Cinco levas, nesta ordem:** E1 funil editável (ordem, tipo, cor,
  criar/remover etapa, **vários funis por empresa**); E2 **campos
  personalizados em contato e negócio** (catálogo por empresa + coluna `jsonb`
  validada por trigger — nunca `ALTER TABLE` por empresa, que é o que o Twenty
  faz e o que quebra RLS e PostgREST); E3 **importação de planilha com
  contatos e negócios** (formato de exportação do Kommo), dedupe pela mesma
  regra do lead do site e "desfazer" da última importação; E4 indicadores de
  venda; E5 **automações completas**.
- **Automações: um motor só, no banco.** As regras "um gatilho + uma ação" da
  L2 são convertidas em fluxos de um passo e o motor antigo sai. O novo:
  fluxo = gatilho + passos em grafo (array plano com `next`), run com cópia
  congelada do fluxo, passos SQL executados inline com teto de 20 e o resto
  pelo tick de um minuto; passos externos (e-mail, HTTP, IA) por uma edge
  function chamada pelo cron; gatilhos de registro (chamado, negócio, contato,
  pedido), agenda, prazo, webhook e manual; ramificação, condição e espera;
  editor visual com posições calculadas. Escrita feita por fluxo **não
  dispara** outro fluxo (regra de 2026-09-08 mantida).
- **Fora, de propósito:** passo de código do usuário, iterador, formulário
  que pausa o fluxo, rascunho de e-mail, "escolher registro" (rodízio),
  visões salvas, sincronização de e-mail, mesclar registros, lixeira.

Gatilho de revisão: segundo cliente que peça objeto personalizado além de
contato e negócio (aí se discute catálogo de objetos); primeiro pedido de
código próprio em automação (edge function por fluxo); pedido de "salvar
este filtro" (visões como dado, seção 4 da pesquisa).

## ADR-008 — Nada semeado como regra: segmentos, funis, tabelas de preço e provedores são da empresa

**Data:** 2026-09-10. **Status:** vigente. **Base:** `docs/proposta-fluxo-comercial.md`
(processo real da Minasflor e as sete decisões do dono).

O dono viu o funil semeado e leu "fixo no código". A regra que ele fixou vale
para o Comercial e para todo módulo: **a empresa monta; o sistema só oferece
um assistente de primeira abertura** com perguntas fixas, e um exemplo para
quem pular. A Minasflor é a empresa cobaia — nenhuma escolha se justifica
"porque ela faz assim"; toda solução cobre também a empresa sem as mesmas
ferramentas.

Decisões, com o que cada uma implica:

- **Segmentos por empresa** (`crm_segments`): cada um com funil padrão e
  tabela de preço padrão; o contato escolhe o segmento e o resto se deduz.
  Tenant novo nasce sem funil; o assistente (`crm_setup`) cria um funil por
  segmento. Leva CRM-1b.
- **Tabelas de preço = % sobre o preço base, com exceção por produto**; o
  contato pode ter tabela própria (distribuidor com tabela especial). O
  preço é calculado pelo banco (`crm_product_price`); o pedido registra a
  tabela. Leva CRM-1b.
- **Portões por etapa** (`required_fields`): "para entrar em X, precisa de
  Y". Recusa em português, no banco; escrita do sistema passa. Leva CRM-1b.
- **Cobrar, emitir nota e entregar são três escolhas separadas** do
  assistente (a Yampi junta as três; o Stripe só cobra). Provedor de
  pagamento por empresa: Yampi (link pela API + webhook `order.paid`; preço
  por segmento via **cupom gerado por link**, nunca fixo), Stripe (já
  construído) ou "por fora". Nota: Yampi→Bling, Bling pelo Helpoint, outro,
  nenhuma. Entrega: Correios pela Yampi/Bling, transportadora do cliente,
  retirada, não se aplica. Leva CRM-2 ("provedores").
  **Complemento (2026-09-12, CRM-2a):** a chave é **da empresa, colada na
  tela** (Configurações do Comercial → Pagamento) — nunca segredo global do
  servidor, porque cada tenant tem a própria conta. Yampi e Stripe podem
  estar ligados juntos; um é o padrão e o pedido troca. Stripe hoje é
  "colar a chave"; "Conectar com Stripe" (Connect) fica para depois.
  **Nota fiscal (CRM-2b, 2026-09-12):** "Bling pelo Helpoint" é OAuth por
  empresa ("Conectar com Bling"), não chave colada — o Bling só oferece
  OAuth; o app Helpoint é um só, registrado pelo dono do produto. Nota é
  passo de fluxo (`bling_order`), não botão: nasce do "pedido pago" e a
  empresa escolhe se gera e se transmite. Quem emite pela Yampi não conecta.
  **Entrega (CRM-2c, 2026-09-12):** não é integração — é a transportadora do
  cliente no contato e um modelo de fluxo "pedido pago → tarefa para a
  expedição". Correios pela Yampi/Bling continuam por lá; a pergunta 6 do
  assistente se resume a "quem despacha?".
- **Financeiro nos dois casos:** o modelo de fluxo "ganhou → cobrar" tem o
  passo "criar conta a receber" (`fin_entries`, já existe): empresa sem ERP
  liquida ali e isso marca o pedido pago; empresa com ERP externo liga ou
  desliga o passo. Chamado de cadastro no ERP nasce do fluxo, editável.
  Leva CRM-1d.
- **Formulário do site próprio** (sai do Kommo) na CRM-3; Instagram/Facebook
  (Lead Ads) junto com o WhatsApp (CRM-4), pela mesma aprovação da Meta.
- Boleto fora para todos; triagem à mão no Helpoint até o WhatsApp.

Gatilho de revisão: primeira empresa que precise de preço por quantidade
(faixas) ou por cliente individual além da tabela; API da Yampi sem cupom de
uso único (então: um SKU por segmento); segundo provedor de nota fiscal.

## ADR-009 — CRM é módulo próprio; o caminho "nativo" da venda é Asaas + Focus NFe + Melhor Envio; Expedição com estoque por lote

**Data:** 2026-09-12. **Status:** vigente (decisões tomadas; levas a planejar).
**Base:** as seis ideias do dono depois da CRM-2 e as respostas dele.

- **CRM sai do Comercial e vira módulo próprio** ("são coisas distintas").
  Tudo de vendas vai para o CRM: funil, contatos, negócios, pedidos,
  produtos, importação, indicadores e as configurações deles (segmentos,
  funil, tabelas de preço, campos, pagamento, nota fiscal, fluxos de venda).
  O Comercial fica só com chamados (fila, categorias, prazos, automações de
  chamado, acesso). Endereços `/crm/…`; os antigos `/comercial/…` de vendas
  redirecionam. Acesso ao CRM é concessão própria (`crm` em
  `available_modules` e no perfil), não herdada do Comercial.
- **Configurações num lugar só**, na mesma leva: uma área "Configurações"
  com uma seção por módulo, visível para quem tem acesso administrativo
  daquele módulo. Hoje cada módulo tem a sua tela e "está muito bagunçado".
- **Yampi e Bling não são o caminho padrão do produto** — são opções para
  quem já opera neles. O caminho padrão ("nativo": o Helpoint faz o fluxo
  inteiro sem loja virtual nem ERP) liga três serviços especializados, cada
  um com conexão simples por empresa: **Asaas** para cobrar (Pix, cartão,
  boleto e link de pagamento pela mesma chave), **Focus NFe** para a nota
  (a empresa sobe o certificado A1 uma vez no painel deles; o Helpoint manda
  o pedido e recebe NF-e e DANFE) e, para a etiqueta, ~~Melhor Envio~~ →
  **os três conectores do bloco "Etiqueta" abaixo** (o dono recusou o
  intermediário no mesmo dia). Stripe, Yampi e Bling continuam como
  provedores. Recusado: emitir NF-e direto na SEFAZ (certificado, regras por
  estado, contingência — anos de trabalho).

  **Complemento de 2026-09-12 (confirmado pelo dono): quatro encaixes com nome
  de função, não de fornecedor.** A pergunta que separa as empresas não é
  "qual sistema ela usa", é *onde a venda acontece* (proposta do Helpoint, ou
  uma loja online) e *quem é o dono do registro depois de vender* (o Helpoint,
  ou um ERP que ela já tem). Então tudo fica atrás de quatro encaixes, e o
  assistente escolhe o fornecedor de cada um por empresa:

  | Encaixe | Padrão | Outras opções |
  |---|---|---|
  | **Cobrar** | Asaas | Stripe, Yampi (link), por fora |
  | **Emitir nota** | Focus NFe | Bling (quem tem o ERP), outro sistema, nenhuma |
  | **Etiquetar** | Correios direto (CWS) | buscar do Bling, buscar da Yampi, transportadora do cliente, retirada |
  | **Receber pedidos de fora** | — | Yampi, e depois Nuvemshop/Shopify/WooCommerce |

  Consequências que mudam o que já existe: **o Bling deixa de ser "o jeito de
  emitir nota" e passa a ser conector de ERP** — quem roda no Bling já emite
  nota, controla estoque e financeiro por lá, então o Helpoint só manda o
  pedido e não emite nada pela Focus. **A Yampi deixa de ser checkout e passa
  a ser origem de pedidos** — o valor dela é o pedido pago na loja cair na
  Expedição; o link com cupom que a CRM-2a construiu resolve a venda por
  WhatsApp da Minasflor e fica como está, sem crescer. Trocar ou somar
  fornecedor vira conector novo, nunca reescrita.

  **Etiqueta, decidido em 2026-09-12 (o dono recusou o Melhor Envio):** a
  empresa que tem contrato com os Correios já liga a API deles na Yampi e no
  Bling sozinha, então intermediário não acrescenta nada. O encaixe
  "etiquetar" ganha três conectores, e o ganho é o mesmo nos três — na tela de
  separar, depois de bipar tudo, aparece a etiqueta para imprimir e o rastreio
  se preenche:
  - **Buscar do Bling** (`GET /logisticas/etiquetas?formato=&idsVendas[]=`
    devolve o link da etiqueta; `POST /logisticas/objetos` cria o objeto com
    rastreio e `POST /logisticas/remessas` fecha a PLP). É o mais barato:
    o pedido já vai para lá pelo passo `bling_order` da CRM-2b.
  - **Buscar da Yampi** (`/orders/{id}/labels/{labelId}` guarda arquivo,
    código e URL de rastreio).
  - **Correios direto**, para quem não tem Bling nem Yampi. O caminho inteiro,
    confirmado na documentação: `POST /token/v1/autentica/cartaopostagem`
    (Basic com usuário e código de acesso, corpo com o número do cartão de
    postagem; o token vale 24 h) → `POST /prepostagem/v1/prepostagens`
    (remetente, destinatário, código do serviço, peso e declaração de conteúdo;
    devolve o id e o código do objeto, que é o rastreio) → `POST
    /prepostagem/v1/prepostagens/rotulo/assincrono/pdf` (devolve o `idRecibo`)
    → `GET /prepostagem/v1/prepostagens/rotulo/download/assincrono/{idRecibo}`
    (o PDF). Exige contrato ativo com os Correios. O PDF vem atrás de
    autenticação, então o Helpoint devolve o arquivo ao navegador para
    imprimir, em vez de guardar um link que só funcionaria com o token.
  Quem não tem contrato não gera etiqueta por nenhum caminho: para essa
  empresa continuam valendo a transportadora do cliente e a retirada, que a
  Expedição já cobre. Recusado: Melhor Envio.
- **Módulo Expedição junto com estoque por lote:** fila de pedidos pagos →
  separar bipando os itens (código de barras/SKU) → FIFO sugere o lote pela
  validade → etiqueta → despachado com rastreio. Entrada de lote com
  validade e saldo por lote entram na mesma leva; FIFO é configurável.
- **OKR/Projetos no estilo Scopi:** objetivos estratégicos → OKRs com metas
  e indicadores → planos de ação (projetos e tarefas), check-ins periódicos
  e FCA (fato, causa, ação) quando a meta desvia. Unifica L4 e L9.
- **Modo foco só por escolha do atendente:** o clique numa tarefa abre o
  painel da tarefa; o modo foco entra pelo botão "Focar"/"Modo foco".
  Corrigido em 2026-09-12 (o dono concluiu uma tarefa de cobrança achando
  que era o chamado resolvido que a originou).
- **Toda tarefa de fluxo nasce com chamado, e o fluxo diz onde
  (2026-09-13):** a mesma tarefa de cobrança voltou a confundir — aparecia no
  painel e não existia em fila nenhuma. A causa é de desenho: tarefa solta não
  tem módulo, fila, prazo de SLA nem relatório, então trabalho criado por
  automação ficava fora da medição. Decisão do dono: **o passo "criar tarefa"
  abre também um chamado**, no módulo que o próprio passo manda, já atribuído
  ao atendente — "isso gera relatórios e dados e controle das demandas". Não é
  regra fixa por módulo: quem monta o fluxo escolhe o destino, do mesmo jeito
  que já escolhe no passo "abrir chamado". Tarefa pessoal continua sem chamado.
- **A fila do painel é por prioridade, não por data (2026-09-13):** o painel
  agrupava por prazo e pintava de verde tudo que vencia depois de amanhã, sob o
  rótulo "Futuro". Em helpdesk a prioridade organiza a fila e o prazo é o
  relógio que diz quando estoura. Passa a agrupar por Crítico, Alto, Médio e
  Baixo, com atrasado em destaque dentro do grupo.
- **Ordem das levas:** bug do foco → CRM módulo próprio + configurações num
  lugar só → Expedição/estoque + trio nativo → CRM-3 formulário/agenda →
  OKR/Projetos → CRM-4 WhatsApp. Testes com contas reais (Stripe, Yampi,
  Bling, Asaas, Focus NFe, Melhor Envio) ficam para o final, juntos.

Gatilho de revisão: um dos três serviços do trio mudar de preço ou de API a
ponto de não compensar; a primeira empresa que precise de estoque em mais
de um depósito; a primeira empresa que venda por uma loja online que não seja
a Yampi (aí o encaixe "receber pedidos de fora" ganha o segundo conector e o
formato comum entre eles vira contrato).

## ADR-010 — O Helpoint é o sistema da Minasflor, não um produto vendido a várias empresas

**Data:** 2026-09-18. **Status:** vigente. **Supera a ADR-005.**

Decisão do dono: o Helpoint deixa de ser um sistema que outras empresas
contratam e passa a ser o sistema da Minasflor. Sai a parte de loja — a página
que vende, o "cadastre sua empresa", o plano contratado com limite de usuários
e prazo de teste, e o endereço que carrega o nome da empresa. Fica o sistema
inteiro: chamados, inventário, qualidade e SAC, marketing, RH, financeiro,
CRM, expedição, educacional, diretoria e a Lyra.

**O que NÃO muda, e por quê.** Por dentro, cada linha de cada tabela continua
marcada com a empresa a que pertence. Isso não é sobra do modelo antigo: é a
trava que impede um dado de aparecer no lugar errado. O navegador conversa
direto com o banco — não há servidor nosso no meio — e quem separa é essa
marca, lida por 395 regras de segurança dentro do Postgres. Arrancá-la seria
reescrever o sistema por inteiro, sem nada aparecer de diferente na tela, e
com a proteção desligada durante a obra. Então ela fica, invisível.

Consequências:

- **Ninguém cria empresa pelo sistema.** O caminho que existia foi fechado no
  banco, não só escondido na tela: a função que criava empresa foi removida e
  a permissão de inserir em `tenants` foi revogada de quem está logado. Só o
  servidor cria, e só uma vez — no dia em que a produção subir.
- **Pessoa nova entra por convite.** Quem administra envia o convite; a pessoa
  escolhe a senha e já cai dentro. O cadastro aberto (qualquer um criava conta
  e depois criava empresa) foi removido — em **duas partes**: o fonte saiu do
  repositório (`supabase/functions/staff-signup/`), e a função foi apagada do
  servidor à parte (`supabase functions delete`), porque apagar o diretório
  local não desfaz o deploy anterior — ela continuava ACTIVE no
  `test-helpoint` até a segunda parte acontecer.
- **Plano, limite de usuários e prazo de teste deixaram de existir.** A coluna
  continua no banco, parada e comentada como morta — apagar seria
  irreversível e não muda nada na tela. Quem decide o que cada pessoa vê é
  quem administra, na tela de acessos, módulo a módulo. Nenhum módulo do
  sistema fica escondido da Minasflor.
- **O endereço perde o nome da empresa.** `/t/minasflor/inicio` virou
  `/inicio`. Link antigo que alguém tenha salvo continua funcionando: o
  sistema o traduz sozinho para o endereço novo.
- **O portal do cliente (SAC), o CRM, o formulário do site e a proposta
  pública não mudam.** Ali "empresa" quer dizer a Minasflor atendendo os
  clientes dela — é o negócio, não a loja.
- **Os testes que provam a separação dos dados continuam valendo**, e
  continuam criando duas empresas de mentira para provar que uma não enxerga a
  outra. Eles são a prova de que a trava de dentro funciona.
- **A ADR-002 (porte para Next.js) perde um dos motivos.** "A home pública
  precisa aparecer bem no Google e no link compartilhado" some junto com a
  página de vendas. Os outros motivos continuam de pé: lugar para código de
  servidor e um container só. O porte não está cancelado — está com um
  argumento a menos.

Gatilho de revisão: o dono decidir vender o Helpoint a outra empresa. O
caminho de volta existe e é curto, porque a separação por empresa nunca saiu
do banco: seria recriar a função de cadastro, a tela de criar empresa e o
endereço com o nome da empresa.
