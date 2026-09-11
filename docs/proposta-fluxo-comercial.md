# Proposta — o fluxo comercial contínuo no Helpoint

**Data:** 2026-09-10. **Status:** decidida pelo dono na mesma data (seção 6);
vira ADR quando a CRM-1b for planejada.
**Base:** o processo real descrito pelo dono em áudio (transcrito) nesta data,
o que o CRM já tem (`docs/inventario-sistema.md`, "Comercial — CRM"), a
pesquisa anterior (`docs/pesquisa-crm-comercial.md`) e a pesquisa desta rodada
(fontes no fim).

Regra que guiou tudo: **o Helpoint é o maestro, não substitui o que já
funciona.** Yampi, Mercado Pago, Bling, Correios e Forteplus continuam
fazendo o que fazem hoje. O Helpoint entra onde hoje está o caderno, o
WhatsApp interno e a redigitação. E nada é fixo para a Minasflor: segmentos,
funis, tabelas de preço e campos são criados por cada empresa.

---

## 1. Como é hoje (o que ouvi)

Três segmentos — **consumidor final**, **salão** (pede CNPJ) e
**distribuidor** — cada um com **tabela de preço própria** (preço base +
porcentagem por tabela; o distribuidor pode ter várias). Leads chegam por
Facebook, Instagram, WhatsApp (triagem à mão: nome, cidade/UF, endereço,
segmento) e pelo **formulário do site, que é do Kommo e só para distribuidor**.

| | Consumidor final e salão | Distribuidor |
|---|---|---|
| Atendimento | Triagem no WhatsApp/rede social | Triagem → reunião no Google Meet com apresentação |
| Fechamento | Vendedor monta **link de pagamento na Yampi** (produto e quantidade à mão) | Fecha na reunião; vendedor **anota o pedido no caderno** enquanto o lead fala |
| Preço | Sempre o de **revenda** (a Yampi não separa por segmento) — errado para salão | Tabela do distribuidor, aplicada só depois, no Forteplus |
| Pagamento | Cartão até 12x ou Pix (Mercado Pago, dentro da Yampi) | Financeiro cobra **por WhatsApp**, depois do cadastro |
| Depois de pago | Yampi avisa o **Bling** → nota fiscal automática → vendedor manda o pedido à expedição **por WhatsApp** → etiqueta dos Correios pelo Bling → despacho → rastreio por e-mail (Yampi) | Vendedor abre **chamado na TI** = ficha de cadastro → TI cadastra no **Forteplus** com a tabela certa → TI avisa o vendedor **à mão** → comercial gera o pedido no Forteplus → financeiro cobra → expedição e transportadora no Forteplus |
| Dado que falta | — | Área de atuação, investimento inicial, **transportadora** (só aparece quando chega ao financeiro) |

## 2. As dores, numeradas

1. **Preço errado por segmento** — o link sai com o preço de revenda para todo mundo.
2. **Pedido no caderno** durante a reunião do distribuidor.
3. **Ficha incompleta** do distribuidor (área de atuação, investimento inicial, transportadora) — e a transportadora chega tarde.
4. **Passagens de bastão à mão**: vendedor → TI (chamado redigitado), TI → vendedor (WhatsApp/presencial), comercial → financeiro, financeiro → expedição.
5. **Redigitação**: o mesmo cliente é digitado no CRM, no chamado, no Forteplus e na Yampi.
6. **Leads soltos**: Instagram/Facebook/WhatsApp entram à mão; o formulário do site é do Kommo.
7. **Funil "fixo"**: o dono viu o funil semeado e entendeu que segmentos e funis estão presos no código.

## 3. O que proponho, bloco a bloco

### A. Segmentos por empresa (dor 1, 3, 7)

Uma lista **"Segmentos"** nas Configurações do Comercial, criada pela empresa
(como categorias): nome, **exige CNPJ?**, **tabela de preço padrão**, **funil
padrão**, e **campos obrigatórios** (dos campos personalizados que já existem).
O contato ganha o campo "segmento". Escolher o segmento já define o funil em
que o negócio nasce, a tabela de preço do pedido e o que o vendedor precisa
preencher.

Sobre o funil que hoje nasce pronto: ele é **um exemplo editável**, não uma
regra — dá para renomear, mudar etapas, criar outros e apagar. Mas concordo
que semear um funil chamado "Funil de vendas" passa a impressão errada. Proposta:
na **primeira abertura do Comercial**, um assistente de uma tela pergunta
"Quais segmentos você atende?" e cria **um funil por segmento** (com as etapas
que a empresa escolher a partir de um modelo). Quem pular o assistente fica
com um funil vazio para montar.

### B. Tabelas de preço (dor 1)

Hoje o produto tem um preço só. Proposta: **preço base** no produto +
**tabelas de preço** da empresa (nome + porcentagem sobre a base, com exceção
por produto quando precisar). Cada segmento aponta para uma tabela padrão; o
contato pode ter a sua (o distribuidor com tabela especial). O pedido pega a
tabela sozinho e mostra o preço certo — o vendedor não escolhe nem calcula.

### C. Pedido ao vivo, para a reunião (dor 2, 5)

A tela de pedido do negócio, repensada para ser usada **durante** a reunião:
busca de produto pelo nome, quantidade, total na hora com a tabela do
segmento, observações. Ao terminar: **"Enviar proposta"** gera um resumo
(PDF/mensagem pronta para o WhatsApp) e, se o segmento vende pelo link, o
**link de pagamento**. O caderno some; a ficha do cliente já está no contato.

### D. Pagamento: um "provedor" por empresa (dor 1, 4)

A Minasflor já tem a cadeia Yampi → Mercado Pago → Bling → Correios funcionando
e paga. Não vale recriar isso. A pesquisa mostrou que a **API da Yampi cria o
link de pagamento** (produtos por SKU + quantidade, cupom, cliente e endereço
já preenchidos) e **avisa por webhook quando o pedido é pago** (`order.paid`),
além de `order.status.updated` e nota fiscal criada. O que ela **não faz**:
preço por item no link — o preço é o do cadastro da Yampi.

Proposta: o Helpoint tem um **provedor de pagamento configurável por
empresa** — **Stripe** (já construído, falta a chave) ou **Yampi** (novo:
gera o link pela API a partir do pedido e marca "pago" pelo webhook). A
Minasflor escolhe Yampi e **nada muda** na nota fiscal, nos Correios e no
rastreio. O preço por segmento na Yampi fica resolvido com **um cupom por
tabela** (ex.: "salão −X%") que o Helpoint aplica sozinho ao gerar o link —
a única forma que a API oferece. Se as porcentagens das tabelas não couberem
em cupom, a alternativa é um SKU por segmento na Yampi (mais trabalho lá).

Quando o webhook diz "pago": o negócio vai para **Ganho** (isso já existe), o
vendedor é avisado, e uma **tarefa "separar pedido"** nasce para a expedição —
o WhatsApp interno vira um aviso do sistema. Produto (outras empresas):
Stripe continua como opção; Mercado Pago direto pode entrar depois.

### E. Portões por etapa (dor 3)

Cada etapa do funil pode exigir campos: "para mover para *Reunião marcada*,
área de atuação e investimento inicial preenchidos"; "para *Proposta*,
transportadora". Configurado na aba Funil, com os campos personalizados que
já existem. Assim a transportadora nasce na triagem, não no financeiro.

### F. Distribuidor ganho → cadeia sem WhatsApp interno (dor 4, 5)

O motor de fluxos já existe; falta ligar as pontas. Fluxo pronto, ligável com
um clique ("modelo"):

1. Negócio do funil Distribuidor vira **Ganho** → abre **chamado na TI**
   "Cadastrar distribuidor no Forteplus" com a **ficha pronta** (nome, CNPJ,
   e-mail, WhatsApp, endereço, CEP, tabela de preço, transportadora, itens do
   pedido) — sem redigitar.
2. TI **resolve o chamado** → vendedor avisado no sino e no e-mail (quando o
   e-mail entrar) → **tarefa para o financeiro** "Cobrar pedido nº X" com o
   resumo e o contato.
3. Financeiro marca o pedido como **pago** no Helpoint → aviso ao vendedor
   (e à expedição, se a empresa quiser). O pedido e a expedição de verdade
   seguem no Forteplus — o Helpoint guarda o que aconteceu e quando.

Para consumidor/salão, o modelo "**sem resposta**": 24 h parado → tarefa de
follow-up; 48 h → Perdido com motivo. Os dois modelos valem para qualquer
empresa; os prazos são dela.

### G. Leads: formulário próprio e redes sociais (dor 6)

O Helpoint já recebe lead do site (`crm-lead-intake`). Proposta: o formulário
**do Helpoint** no site, com o campo "segmento" (ou fixo em distribuidor, como
hoje) — sai do Kommo. Instagram e Facebook: a Meta entrega os leads dos
anúncios por webhook (**Lead Ads**), mas exige app aprovado pela Meta e cinco
permissões — entra **junto com o WhatsApp (CRM-4)**, que passa pela mesma
aprovação. Até lá: origens "instagram" e "facebook" no cadastro, à mão.

### H. Reunião (dor 2)

Botão **"Agendar reunião"** no negócio: cria o compromisso na Agenda do
Helpoint e a tarefa. O link do Google Meet automático precisa da conta Google
da empresa conectada — fica para depois; na primeira versão o vendedor cola o
link.

## 4. O que não muda (de propósito)

Forteplus continua dono do pedido, do estoque e da expedição do distribuidor.
Bling continua emitindo a nota. Yampi continua cobrando e os Correios
continuam etiquetando. O Helpoint não vira ERP.

## 5. Ordem sugerida

| Leva | Entrega | Dores |
|---|---|---|
| **CRM-1b** | Segmentos por empresa + assistente de funis + tabelas de preço + portões por etapa | 1, 3, 7 |
| **CRM-1c** | Pedido ao vivo + "Enviar proposta" (PDF/WhatsApp) | 2, 5 |
| **CRM-2** (redesenhada) | Provedor de pagamento por empresa: **Yampi** (link pela API + webhook pago) ao lado do Stripe; tarefa para a expedição | 1, 4 |
| **CRM-1d** | Modelos de fluxo prontos: "distribuidor ganho → TI → financeiro" e "sem resposta 24/48 h" | 4 |
| **CRM-3** | Formulário do site próprio (sai do Kommo); Agenda + reunião | 6, 2 |
| **CRM-4** | WhatsApp oficial + Lead Ads (Instagram/Facebook) | 6 |

A integração direta com o Bling (a CRM-2 original) deixa de ser necessária
para a Minasflor: a Yampi já fala com o Bling. Fica como opção para empresa
que use Bling sem Yampi.

## 6. Decisões do dono (2026-09-10)

Princípio que ele reforçou em duas respostas: **a Minasflor é a empresa
cobaia; o sistema é multiempresa.** Toda dor dela pode ser de outra, e toda
solução tem de servir a quem não tem as mesmas ferramentas.

1. **Pagamento:** **Yampi e Stripe, os dois** — cada empresa escolhe o seu
   provedor nas configurações. Nenhum é "o da Minasflor".
2. **Preço por segmento na Yampi:** cupom por tabela, mas **gerado por link**
   (um cupom novo, de uso único, a cada link) — nunca o mesmo cupom, porque
   quem o descobre reusa em outro segmento. O dono acredita que as tabelas são
   porcentagens sobre um preço só, aplicadas no total do pedido; **confirmar
   com o comercial** antes da CRM-2. Pré-requisito técnico a apurar: a API da
   Yampi criar cupom de uso único (endpoint de promocodes).
3. **Funis no começo:** **assistente** que cria um funil por segmento. E mais
   amplo: **todo módulo do Helpoint deve ter um assistente de configuração**
   em que a empresa monta as coisas do seu jeito — não só o Comercial.
4. **Tabelas de preço:** porcentagem sobre o preço base, com exceção por produto.
5. **Chamado ao ganhar o distribuidor:** automático pelo fluxo, mas o fluxo é
   **personalizável e montado por assistente** (não um modelo trancado).
6. **Financeiro:** tarefa + "marcar pago" — **e o Helpoint precisa resolver os
   dois casos**: empresa com ERP externo (Minasflor/Forteplus) e empresa que
   usa só o Helpoint. Ver 6.1.
7. **Formulário do site:** troca pelo do Helpoint na CRM-3.

### 6.1 Os dois casos do financeiro

O módulo Financeiro **já tem contas a receber** (`financeiro/contas-a-receber`,
tabela `fin_entries`, com vencimento, liquidação e fluxo de caixa). Então o
modelo de fluxo "ganhou → cobrar" tem um passo **"criar conta a receber"** com
o valor da proposta, o contato e o vencimento:

| Empresa | Como fica |
|---|---|
| **Usa só o Helpoint** | O passo cria a conta a receber; o financeiro cobra por onde quiser e liquida ali; liquidar = pedido pago → avisa vendedor e expedição. Sem tarefa solta: a conta a receber **é** a tarefa |
| **Tem ERP externo** (Minasflor) | O mesmo passo pode ficar ligado (a conta a receber vira o espelho do que está no ERP, e o fluxo de caixa do Helpoint fica completo) ou desligado no assistente; nesse caso nasce só a tarefa "Cobrar pedido nº X" e o "marcar pago" fica no pedido |

Nos dois casos, quem vende por link (Yampi/Stripe) não passa por aqui: o
webhook já marca pago e, se a empresa quiser, também lança a receita.

## 7. E se a empresa não usa Yampi? — o assistente do Comercial

Pergunta do dono (2026-09-10): "se eu fosse outra empresa e escolhesse o
Stripe, qual é o fluxo?" A resposta mostra por que a Yampi não pode ser o
modelo: ela junta **três serviços** num só — cobrar, emitir nota e postar.
O Stripe faz só o primeiro. Então o Helpoint trata os três como **escolhas
separadas**, e o assistente pergunta cada uma. As perguntas são fixas no
sistema; as respostas modelam a empresa.

### 7.1 As perguntas do assistente (primeira abertura do Comercial)

| # | Pergunta (em linguagem leiga) | Opções | O que a resposta liga |
|---|---|---|---|
| 1 | Quais segmentos de cliente você atende? | lista livre (ex.: consumidor, salão, distribuidor) | Um funil por segmento, com etapas de um modelo editável; campo "segmento" no contato |
| 2 | Algum segmento exige CNPJ ou outros dados antes de avançar? | por segmento: campos obrigatórios e em que etapa | Portões por etapa |
| 3 | Você tem tabelas de preço diferentes por segmento? | não / sim: nome e % sobre o preço base | Tabelas de preço; cada segmento aponta para uma |
| 4 | **Como você cobra o cliente?** | Yampi / Stripe / por fora (o dinheiro entra fora do sistema) | Provedor de pagamento da empresa (chaves nas configurações); "por fora" = só "marcar pago" |
| 5 | **Quem emite a nota fiscal?** | a Yampi já manda para o Bling / o Bling, pelo Helpoint / outro sistema, à mão / não emito | Passo "criar pedido no Bling" do fluxo; ou tarefa "emitir nota" para o financeiro |
| 6 | **Como você entrega?** | Correios pela Yampi/Bling / transportadora que o cliente indica / retirada / não se aplica (serviço) | Campo "transportadora" no contato e tarefa "separar e despachar" para a expedição |
| 7 | Você tem um ERP fora do Helpoint para clientes e pedidos? | não / sim: qual e quem cadastra | Passo "chamado para cadastro no ERP"; conta a receber ligada ou desligada (seção 6.1) |
| 8 | O que fazer com quem some? | prazo para follow-up e para "perdido" (ou desligar) | Modelo de fluxo "sem resposta" com os prazos da empresa |

Toda resposta pode ser mudada depois nas Configurações; o assistente só
evita a tela em branco. Pular o assistente deixa a empresa com um funil vazio
e nada ligado.

### 7.2 O fluxo de uma empresa no Stripe, ponta a ponta

Exemplo: empresa que respondeu **Stripe**, **nota pelo Bling via Helpoint**,
**transportadora** e **sem ERP**.

1. Lead entra (formulário, redes, à mão) → contato com segmento → negócio no funil do segmento.
2. Vendedor monta o **pedido** (tabela do segmento; frete como linha do pedido, digitado ou tabela fixa — v1) → "Enviar proposta".
3. "Gerar link" → **Stripe Checkout** (já construído: cartão; Pix quando a Stripe liberar; validade do link) → cliente paga.
4. Webhook do Stripe (já construído) marca **pago** → negócio vai para **Ganho** → vendedor avisado.
5. Fluxo "pedido pago" da empresa: **cria o pedido no Bling** (API v3 → nota fiscal) → **conta a receber** já liquidada no Financeiro → **tarefa "separar e despachar"** para a expedição, com a transportadora do contato → cliente avisado (e-mail/WhatsApp quando entrarem).
6. Rastreio: a empresa digita no pedido (v1) → aviso ao cliente. Integração de frete (Correios/Melhor Envio) é leva futura, se aparecer empresa que precise.

A mesma empresa no **Yampi** pula o passo 5 quase inteiro: a Yampi avisa o
Bling e posta; o Helpoint só marca pago, lança a receita se quiser e abre a
tarefa da expedição. E a empresa **"por fora"** (cobra por Pix manual, por
exemplo) tem o mesmo fluxo com "marcar pago" no lugar do webhook.

O que isso muda na ordem das levas: a **CRM-2 vira "provedores"** — pagamento
(Yampi, Stripe, por fora), nota (Bling pelo Helpoint, ou não) e entrega — cada
um uma peça que a empresa liga. A integração Helpoint → Bling volta a ser
necessária, para quem usa Stripe.

## Fontes desta rodada

- Yampi — criar link de pagamento (SKU + quantidade, cupom, cliente; sem preço
  por item): https://docs.yampi.com.br/api-reference/checkout/links-de-pagamento/criar-link-de-pagamento
- Yampi — eventos de webhook (`order.paid`, `order.status.updated`,
  `order.invoice.created`…): https://docs.yampi.com.br/api-reference/webhooks/listar-eventos-de-webhooks-disponiveis
- Yampi — webhooks (cabeçalhos `User-Token`/`User-Secret-Key`): https://docs.yampi.com.br/api-reference/webhooks/visualizar-webhook
- Yampi — link de pagamento (central de ajuda): https://help.yampi.com.br/pt-BR/articles/13057071-como-criar-um-link-de-pagamento-na-yampi
- Bling — webhooks (pedido, nota fiscal; assinatura `X-Bling-Signature-256`): https://developer.bling.com.br/webhooks
- Meta — Lead Ads por webhook (permissões e App Review): https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/quickstart/webhooks-integration
- Kommo — formulários web e webhooks: https://support.kommo.com/docs/pt-br/manage-webforms-in-kommo , https://pt-developers.kommo.com/docs/webhooks
