# Pesquisa — CRM + Comercial (Kommo, Salesforce, Stripe, Bling, WhatsApp)

Levantamento de 2026-09-09 para a leva "CRM + Comercial" (ideia 11 do dono). Só fonte
oficial ou primária; o que não foi possível confirmar está marcado **não confirmado**.
Serve de base para o planejador e para a rodada de decisões com o dono — não decide nada.
A leitura do código do Twenty CRM, feita em 2026-09-10, está em `docs/pesquisa-twenty-crm.md`.

Termos: *pipeline/funil* = as etapas por onde um possível cliente (lead) passa até fechar;
*webhook* = aviso automático que um sistema manda para outro quando algo acontece;
*template* = mensagem pré-aprovada; *BSP* = empresa parceira da Meta que revende o WhatsApp
oficial; *NF-e* = nota fiscal eletrônica.

---

## 1. Kommo (ex-amoCRM)

O que o produto faz de fato, segundo a documentação oficial (support.kommo.com):

- **Funil com etapas e cartões de lead.** "Pipelines serve as the central hub of your
  workflow", etapas personalizáveis ("add, delete, rename, reorder, and change their
  colors"), leads criados à mão, importados ou **automaticamente pelos canais** (WhatsApp,
  Instagram, Facebook); vários funis por produto/canal/departamento; histórico de leads
  fechados. Fonte: https://support.kommo.com/docs/pipelines-overview.md
- **Caixa de entrada unificada.** A integração oficial de WhatsApp Business exige plano
  Kommo + integração conectada ao número + **forma de pagamento na conta WhatsApp Business
  da Meta**; templates precisam de aprovação da Meta e "Meta may charge for WhatsApp
  template messages". Fonte: https://support.kommo.com/docs/whatsapp-business-overview.md
  — A opção "WhatsApp Lite" (conexão por QR code, não oficial) **não está documentada no
  suporte nem no site** que li: **não confirmado**.
- **Digital Pipeline (automação).** Gatilhos: "pipeline triggers, scheduled triggers,
  behavior-based triggers and conversational triggers" (ex.: "When moved to this stage",
  lead novo, e-mail recebido). Ações: Salesbot, criar tarefa, criar lead, enviar e-mail,
  **webhook**, mudar etapa, adicionar tag, concluir tarefa, gerar formulário, mudar
  responsável, mudar campo, apagar arquivos.
  Fonte: https://support.kommo.com/docs/set-up-digital-pipeline-triggers.md
- **Salesbot.** Editor visual de blocos: mensagem, lista (WhatsApp), condição, validação,
  pausa, nota, tarefa, mudar status/responsável, criar lead, formulário, definir campo,
  webhook, e-mail, "Round Robin", código customizado e widgets ("Stripe, Mailer, etc.").
  Fonte: https://support.kommo.com/docs/salesbot-overview.md
- **Tarefas e calendário; campos personalizados no lead.**
  Fontes: https://support.kommo.com/docs/tasks-calendar-overview.md ,
  https://support.kommo.com/docs/customize-fields-in-lead-profiles.md
- **Catálogo de produtos.** Produtos com preço, descrição, SKU; vinculados ao lead com
  quantidade, "the system automatically calculates total sale amounts"; histórico de compra
  no perfil; integra com "Shopify, WooCommerce, **Bling**". A página **não fala em gerar
  fatura ou link de pagamento** a partir do catálogo.
  Fonte: https://support.kommo.com/docs/product-catalogs-overview.md
- **Faturas.** O que há documentado é "Create and send PayPal invoices in Kommo"
  (https://support.kommo.com/docs/create-and-send-paypal-invoices-in-kommo.md). Fatura
  nativa com Stripe: **não confirmado** (o Salesbot cita um widget Stripe).
- **Relatórios.** "Analytics and reports overview", desempenho da equipe, metas.
  Fonte: https://support.kommo.com/docs/manage-stats-in-kommo.md

**Reclamações reais (Capterra, jan/2026, verbatim):** "Initial setup and configuration can
be a bit confusing and time-consuming"; "Some configurations take time to get right
(especially automations and integrations)"; "Some features felt a bit confusing at first,
especially the automations and settings"; "Somethings were not intuitive"; "Support and CS
team dont understand some techincal problems". Fonte:
https://www.capterra.com/p/120048/Kommo/reviews/ . Observação honesta: a maioria das
avaliações elogia a simplicidade do Kommo frente a Salesforce; a complexidade sentida
está **na configuração de automações e integrações**, não no funil em si (agregador:
https://www.selecthub.com/p/crm-software/kommo/).

**Leitura para o Helpoint:** o núcleo que a Minasflor usa cabe em três coisas — funil com
etapas, conversa do WhatsApp dentro do cartão do lead, e "quando X → então Y" (que a leva
L2 já tem). O que gera confusão no Kommo é justamente o excesso de blocos do Salesbot.

## 2. Salesforce Sales Cloud — só o esqueleto

- **Cotação (Quote) ligada à oportunidade.** "Each opportunity can have multiple associated
  quotes, and any one of them can be synced with the opportunity"; itens da cotação
  sincronizam com os produtos da oportunidade; PDF por template e envio por e-mail.
  Fonte: https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.quotes_overview.htm&language=en_US
- **Produtos / tabelas de preço (Price Books) e Pedidos (Orders):** as páginas oficiais
  não abriram (404/erro de carregamento) — detalhes **não confirmados**; o modelo
  conhecido é produto → entrada em tabela de preço → item de oportunidade → cotação →
  pedido.
- **Link de pagamento.** "Salesforce Payments … powers Pay Now for quick creation of unique
  or reusable payment links that you can embed with any record"; é licença à parte,
  integrada a **Commerce e Order Management**, e a página **não cita cotações do Sales
  Cloud**. Fonte:
  https://help.salesforce.com/apex/HTViewHelpDoc?id=commerce.payments_product_intro.htm&language=en_US
  Ou seja: até na Salesforce, "link de pagamento a partir da venda" é módulo separado
  ou terceiro.

**Leitura para o Helpoint:** vale copiar a cadeia *oportunidade → cotação (itens, preço)
→ pedido*, com a cotação virando o "link de loja" do vendedor.

## 3. Stripe no Brasil

- **Meios de pagamento para conta brasileira** (tabela oficial): **Boleto** — moeda BRL,
  conta BR, cliente BR; **Pix** — BRL, conta "BR (Invite only)", cliente BR. Cartões:
  padrão. Fonte: https://docs.stripe.com/payments/payment-methods/payment-method-support
  (linhas Boleto e Pix da tabela "Country and currency support"). **Pix é por convite**:
  precisa pedir liberação à Stripe.
- **Tarifas publicadas para o Brasil:** "3,99% + R$ 0,39 por transação … cartões
  nacionais"; "+ 2% para transações com cartões internacionais"; "1,19% por PIX pago";
  "R$ 3,45 por boleto pago"; conversão de moeda "a partir de 2%".
  Fonte: https://stripe.com/br/pricing
- **Link temporário existe, com limite.** Checkout Session aceita `expires_at`: "It can be
  anywhere from **30 minutes to 24 hours** after Checkout Session creation. By default, this
  value is 24 hours." Fonte: https://docs.stripe.com/api/checkout/sessions/create
  → cobre exatamente o pedido do dono ("1h a 24h"). Link **definitivo** = Payment Link
  (não expira; pode ser desativado). Fonte: https://docs.stripe.com/payment-links/api
- **Webhooks.** A Stripe envia eventos assinados (cabeçalho `Stripe-Signature`, HMAC
  SHA-256) para uma URL HTTPS; o receptor deve responder `2xx` rápido; reentregas por até
  3 dias; eventos podem chegar fora de ordem e duplicados (guardar o `event.id`). Eventos
  úteis: `checkout.session.completed`, `payment_intent.succeeded`. Fonte:
  https://docs.stripe.com/webhooks
- Boleto e outros métodos "might take between 2 and 14 days to confirm the payment" —
  o pedido só deve ir ao Bling no webhook de pagamento confirmado, não no clique.
  Fonte: https://docs.stripe.com/payment-links/api

## 4. Bling ERP

- **API v3, REST + OAuth 2.0**, token Bearer no cabeçalho. Fonte:
  https://developer.bling.com.br/bling-api . Renovação por `refresh_token`; a Bling está
  migrando para tokens JWT (`enable-jwt: 1` em todas as requisições, inclusive na
  renovação); prazo de bloqueio do token antigo "em definição". Fonte:
  https://developer.bling.com.br/migracao-jwt . Tempo de vida exato dos tokens: **não
  confirmado** (não está nessas páginas).
- **Limites:** "3 requisições por segundo, 120.000 requisições por dia"; acima disso,
  HTTP 429. Fonte: https://developer.bling.com.br/limites
- **Criar pedido de venda:** `POST /pedidos/vendas` com id do contato, itens (código,
  quantidade, valor), parcelas (vencimento, valor, id da forma de pagamento); devolve o id
  do pedido. Fontes: https://developer.bling.com.br/referencia (referência oficial, só
  navegável no site) e
  https://docs.floui.io/guia/conectores/categorias/servicos-externos/bling-erp-bling-api-v3/pedido-de-venda/criar-pedido-de-venda
- **NF-e pela API:** existe seção "Notas fiscais — API para desenvolvedores"
  (https://ajuda.bling.com.br/hc/pt-br/sections/360008117354-Notas-fiscais-API-para-desenvolvedores)
  e endpoints de nota fiscal na referência; o caminho exato "gerar NF-e a partir do
  pedido" na v3: **não confirmado** nesta rodada — apurar na referência com a conta da
  Minasflor na hora de desenhar.
- **Loja / link de pagamento próprio: SIM.** "Pix, boletos, links de pagamento ou
  maquininha POS. Receba e pague com facilidade, tudo integrado ao ERP" — mas via **Bling
  Conta Digital**, com taxas por plano (QR Pix R$ 0,30–0,90; boleto R$ 1,30–1,95 por
  transação) e lançamento automático no contas a pagar/receber. Fontes:
  https://www.bling.com.br/funcionalidades/link-pagamento ,
  https://www.bling.com.br/funcionalidades/meios-de-pagamento
- **Integração nativa com Stripe: NÃO.** A página de meios de pagamento não cita Stripe;
  o que existe é ponte por terceiro (Pluga: "a cada pagamento aprovado no Stripe, gerar um
  contas a receber no Bling"). Fonte: https://pluga.co/ferramentas/stripe/integracao/bling/

## 5. WhatsApp Business (API oficial da Meta)

- **Cobrança por mensagem (desde 1/7/2025):** "You are only charged when a template message
  is delivered"; mensagens de serviço (resposta a quem escreveu) são grátis dentro da
  **janela de 24 h**; templates de utilidade dentro da janela também; "Free Entry Point"
  de 72 h quando o cliente chega por anúncio clique-para-WhatsApp. Categorias: marketing,
  utilidade, autenticação, serviço. Fontes:
  https://developers.facebook.com/docs/whatsapp/pricing ,
  https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing
- **Valores para o Brasil:** a Meta só mostra na calculadora
  (https://whatsappbusiness.com/pt-br/products/platform-pricing/); a página diz que não
  cobra mensagens de serviço nem de utilidade em resposta ao usuário. Números em R$:
  **não confirmado** nesta rodada. Novidade: contas brasileiras passam a ser faturadas em
  **BRL**; contas antigas precisam migrar até **30/06/2027**.
- **Número:** "Numbers already in use with WhatsApp cannot be registered unless they are
  deleted first"; portfólio novo começa com **2 números**, sobe para 20 com verificação;
  nome de exibição obrigatório. Fonte:
  https://developers.facebook.com/docs/whatsapp/phone-numbers
- **Migrar o número que está no Kommo:** o número pode migrar entre contas/parceiros
  (WABA → WABA) — pré-requisitos citados nas páginas de parceiros: **verificação
  dupla desligada**, empresa verificada, nome de exibição aprovado e acesso ao SMS/ligação
  do número. Fontes:
  https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/migrate-existing-whatsapp-number-to-a-business-account/ ,
  https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration .
  Se hoje o Kommo usa o número pelo **app** (não pela API), migrar = apagar a conta do
  app ("Deleting your account results in lost messaging history") — **o histórico de
  conversas fica no Kommo, não vem junto**.
- **Verificação da empresa (Meta Business Verification):** exigida para permissões
  avançadas e para subir limites; documentos e prazo estão na Central de Ajuda (a página
  não abriu por aqui — **não confirmado** o prazo). Fonte:
  https://developers.facebook.com/docs/development/release/business-verification
- **Não oficial (QR code / bibliotecas de engenharia reversa):** viola os termos; relatos
  de banimento permanente sem recurso; a Meta descontinuou a API on-premise em out/2025 e
  exige Cloud API por BSP. Fontes secundárias (não Meta):
  https://ominiflow.com/blog/whatsapp-ban-explained-complete-guide-2026 ,
  https://zylos.ai/research/2026-01-26-whatsapp-api-automation/ . Para um produto que
  vai ser vendido (ADR-005), só a oficial serve.

## 6. Síntese para decisão

1. **Caminho realista:** Helpoint (CRM: lead → cotação com itens) → Stripe Checkout
   (link com `expires_at` de 30 min a 24 h, ou Payment Link fixo) → webhook
   `checkout.session.completed` numa edge function → `POST /pedidos/vendas` no Bling →
   NF-e no Bling. Stripe não fala com Bling sozinho; o elo é o Helpoint.
2. **Simples:** funil + cotação + link Stripe + webhook — tudo dentro do que o repositório
   já sabe fazer (edge functions com segredo, cron, notificações, automações da L2).
3. **Decisão de negócio antes de codar:** Stripe (3,99%+R$0,39 cartão; Pix só por
   convite, 1,19%) **ou** Bling Conta Digital (Pix R$ 0,30–0,90 fixo, já cai no
   financeiro do Bling). Para venda B2B por Pix/boleto, o Bling pode sair mais barato e
   com menos integração; o Stripe ganha em cartão, link temporário e webhook maduro.
4. **Caro/lento:** verificação da empresa na Meta; número do WhatsApp (verificação dupla,
   nome de exibição, migração — e perda do histórico se hoje é pelo app); homologação e
   regras de NF-e no Bling; Pix na Stripe depende de convite.
5. **Riscos:** limite de 3 req/s no Bling (fila, não disparo em lote); webhook duplicado
   ou fora de ordem (idempotência pelo `event.id`); boleto confirma em dias (pedido só
   após pagamento confirmado); WhatsApp não oficial = banimento.
6. **O que copiar do Kommo:** funil com etapas, conversa dentro do cartão, catálogo ligado
   ao lead com total automático, automação "quando X → então Y". **O que deixar de fora:**
   Salesbot de dezenas de blocos (é onde nasce a reclamação de complexidade).
