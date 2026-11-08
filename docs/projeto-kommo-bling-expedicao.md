# Kommo, Bling e Expedição: o que o dono pediu (2026-11-07)

Registro do pedido do dono, para o próximo chat começar daqui. Proposta de indicadores ligada a isto:
https://claude.ai/artifact/BdbduFL8B9PraSeBTmffMU (v5, decisões aprovadas: lead é só o Kommo; tráfego pago e leads em
blocos separados; lista de ganhas e perdidas com nome e link; pendências do Kommo na tela; valor do distribuidor lançado
no Kommo por quem cuida dos leads).

## 1. Projeto do Kommo (outro chat, com o conector do Kommo)

Analisar a conta `ticminasflor.kommo.com` inteira e trazer um projeto. O conector do Kommo do claude.ai é só leitura:
mudar automação, funil ou etapa é feito pelo dono no Kommo, com o passo a passo.

Problemas a resolver:
- **Tráfego pago × leads:** o Kommo não sabe quais leads vieram de anúncio. Os campos "Meta Ads ID…" e `utm_*` existem
  e estão vazios nos 207 leads de 60 dias. Os anúncios atuais são de visita ao perfil, não de mensagem.
- **Venda ganha não alimentada:** quem cuida dos leads nem sempre marca venda ganha e nem lança o valor (outubro: 7
  ganhas de Distribuidor sem valor; uma ganha de R$ 5.096 ficou na Entrada, sem segmento; 4 de 7 perdidas sem motivo).
- **Automações:** rever e criar (etiqueta da conta do Instagram pela mensagem pronta do link da bio, triagem, lembretes
  de fechar o lead).
- **Funis:** rever Entrada, Consumidor Final, Salão de Beleza, Distribuidor, Educacional, MF LOVER, Serviços prestados, ENAD.
- **Números internos:** colaboradores com número da empresa chamam o WhatsApp que atende os leads e viram leads,
  inflando os indicadores. Analisar soluções no Kommo (na origem) e no Helpoint (lista de números da empresa que o robô
  ignora).

Medido em 2026-11-07 (diagnóstico `mkt-kommo-coletar` com `{diagnostico: 60}`): fonte "Minasflor Comercial" 155,
"FORMULÁRIO SITE" 36, "Formulário MASTERCLASS SALÃO" 16; conversas por canal: `waba` 246, `instagram_business` 3;
formulário do site com `referrer` (Google 15, l.instagram.com 12, site 5).

## 2. Bling e Yampi

- As duas lojas virtuais ficam na **Yampi**: **BY.MF** e **MF.PRO / Minasflor** (produtos Minasflor e MF Pro para salão
  e consumidor final). O pedido feito na Yampi cai no **Bling**, onde saem a nota fiscal, a etiqueta dos Correios etc.
- Distribuidor: repassado ao vendedor interno; não passa por essas lojas.
- **Indicadores:** vendas por loja e a conferência venda ganha no Kommo × pedido no Bling (pelo telefone do contato).
- **Expedição (novo):** todo pedido das lojas BY.MF e MF.PRO/Minasflor cai **sozinho** na Expedição do Helpoint, com a
  **etiqueta dos Correios**, a **DANFE simplificada** e o **espelho do pedido**. Isto muda a decisão de 2026-10-02
  ("Expedição só atendimento; etiqueta apagada"): é proposta nova, com tela, antes de construir.
- Depende das chaves `BLING_CLIENT_ID` e `BLING_CLIENT_SECRET` (`docs/marketing-ligacoes-meta-kommo-bling.md`) e de
  conferir na API do Bling o que ela entrega de etiqueta e DANFE.

## 3. Distribuidor: valor faturado no Forteplus (decidido em 2026-11-07, entra na etapa 2)

Toda venda do segmento Distribuidor passa pelo Forteplus. A venda ganha no Kommo só avisa que **fechou**: o valor que
ela tem lá não entra no indicador. O valor que vale é o **faturado**.

- **Ligação (o dono recusou ligar só pelo telefone, 2026-11-07):** a forma de ligar entra no projeto do Kommo, junto com
  a melhoria do CRM. A proposta a levar: um campo **CPF/CNPJ** no lead, obrigatório para marcar venda ganha (o Kommo permite
  campo obrigatório por etapa). O Helpoint compara esse campo com `com_clientes.documento`. Telefone e e-mail servem só
  para **sugerir** o cliente, e alguém confirma. Venda ganha sem cliente ligado vai para "Para corrigir".
- **Valor:** a soma de `com_vendas_itens.valor_nota` do cliente, com CFOP de venda, das notas emitidas **até 7 dias depois
  de fechar**. "Pago" foi descartado porque o Forteplus não manda pagamento ao Helpoint.
- **Situações:** Faturado (com o valor e o número das notas), Aguardando nota e Cliente não encontrado.
- **Consumidor e Salão:** continuam com o valor do Kommo. Na etapa 3, passam a usar o pedido do Bling.
- **Caso conferido:** Priscila, lead 118411874, fechou em 26/10 com R$ 5.096. O telefone termina em 8274, igual ao do cliente
  2147. Os pedidos 11466 e 11467 somam R$ 5.098, e as notas 18843 e 23453 saíram em 27/10. Os pedidos 11475 e 11476
  (R$ 627, notas 553 e 23452) são outra compra.
- **Antes de construir:** medir quantas ganhas de Distribuidor batem pelo telefone e fazer a proposta visual.
