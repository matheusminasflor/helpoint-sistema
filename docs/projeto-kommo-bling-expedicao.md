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

## 4. Projeto do Kommo: proposta e decisões (2026-11-08)

Proposta visual: https://claude.ai/artifact/WJMy4yWq43hcShLZWYAuan

O que foi medido em 60 dias:
- 115 de 232 leads que escreveram no último mês ficaram sem resposta de pessoa;
- 65 de 66 leads ficaram parados na Entrada;
- 5 de 19 perdidas estão sem motivo;
- 0 leads têm a origem registrada;
- usuários do Kommo: "Minasflor Professional" (o único que atende) e "Atendente 01" (sem uso);
- cadastro do Helpoint: 95% dos clientes ativos têm CPF/CNPJ e 48% têm telefone.

As 7 frentes:
1. funis com etapas curtas;
2. triagem automática;
3. tarefa quando o lead fica sem resposta;
4. venda ganha com CPF/CNPJ (e valor, fora Distribuidor) e perdida com motivo obrigatório;
5. um login por pessoa;
6. números da empresa fora dos leads (lista no Helpoint e etiqueta Interno);
7. origem do lead (link da bio com mensagem pronta, anúncio de WhatsApp, UTM).

Decisões do dono:
1. Educacional, MF LOVER, Serviços prestados e ENAD continuam no Kommo, mas **fora dos indicadores**.
2. A triagem é feita pelo **robô, com 3 opções** (uso em casa, salão, revendo). Quem não responde é classificado por uma pessoa.
3. **Um login por pessoa.** Hoje só a Thayná usa o login único "Minasflor Professional": ele passa a ser dela, e cada
   pessoa nova ganha o seu login.
4. Lead **sem resposta de pessoa em 30 minutos**, contados no horário comercial, vira tarefa.

Depois da etapa 2, voltar na etapa 1 e conferir se os números batem.

## 5. Versão 3 do projeto do Kommo: Lyra e link da Yampi (2026-11-08)

Mesma página da proposta (versão 3). Decisões do dono:
- **Lyra, assistente da Minasflor:** usa emoji e atende no WhatsApp as 3 marcas (BY.MF, Minasflor e MF.PRO).
- **CPF/CNPJ:** o robô pede ao Salão e ao Distribuidor.
- **A IA só classifica e tira dúvidas pela base.** Não fala de preço de revenda nem de condição.
- **Base de produtos:** eu faço o rascunho, o Marketing revisa e o dono aprova.

O que foi conferido na conta e na documentação do Kommo:
- **Plano:** Avançado (legado), 1 licença, válido até 16/03/2027.
- **Agente de IA:** o Avançado permite até 3. Cada resposta custa cerca de 15 créditos; 1.250 créditos por licença dão cerca
  de 83 respostas por mês; créditos extras são vendidos de 5.000 em 5.000.
- **Campo obrigatório por etapa:** existe no Avançado. Motivo de perda obrigatório não está confirmado; a saída é um campo
  obrigatório na etapa de perdida.
- **Sem resposta:** o Kommo não tem alerta automático; o controle será tarefa criada pelo Salesbot mais o aviso do Helpoint.
- **Leads de entrada:** a etapa pode ser desligada em cada funil. O Salesbot muda o lead de funil.
- **Chamadas para fora:** a IA não acessa sistemas de fora. Só o Salesbot (passo de widget, `widget_request`) chama um
  endereço externo e usa a resposta.
- **Instagram:** 0 de 3 contas ligadas, então o Direct não entra no Kommo.

Desenho:
- **Quem faz o quê:** o Salesbot faz o que é fixo e não gasta crédito; a Lyra entra só nas dúvidas escritas.
- **Funis:** Com a Lyra → Com a Thayná → Link enviado (ou Enviado ao representante) → Venda ganha / perdida.
- **Link de compra por loja:**
  - BY.MF: link do site;
  - Minasflor e MF.PRO: link de pagamento da Yampi gerado pelo Helpoint para aquele lead
    (`POST /v2/{alias}/checkout/payment-link`);
  - o aviso de pago da Yampi marca a venda ganha com o valor pago.
- **Antes das chaves da Yampi (fase 1):** a Lyra anota o pedido e a Thayná gera o link como hoje.

## 6. Versão 4: os 3 Instagrams ligados (2026-11-08)

O dono ligou minasflor, mf.professional e bymf.br. Cada conta entrou com duas fontes, "Messenger" (o Direct) e
"Comentários do Instagram", e as duas caem no funil Entrada, com a etapa de aceitar à mão ligada.

Riscos e o que já existe:
- **Comentário vira lead.** Cada comentário cria um lead, e o robô do Helpoint conta como "Sem triagem". Proposta: tirar
  "Comentários" das fontes.
- **Agente de IA:** já existe "Minasflor assistente de suporte", desligado desde 26/03/2026, com 0 créditos usados. Ele
  vira a Lyra.
- **Salesbot:** não há nenhum criado.

Onde o lead nasce, conforme o canal:
- Direct @bymf.br: Consumidor Final;
- Direct @minasflor, Direct @mf.professional e WhatsApp: Salão;
- formulário do site: Distribuidor.

Com isso, a origem do Direct passa a ser automática pela conta.
- **Comentários (atualizado em 2026-11-08):** o Kommo não deixa tirar a fonte "Comentários do Instagram". A tela não tem
  botão para isso, a integração só oferece sair da conta e a documentação não explica. Então:
  - no Helpoint, lead que veio de comentário não conta nos indicadores;
  - no Kommo, a automação de comentários convida a pessoa para o Direct;
  - pergunto ao suporte do Kommo se há como desligar.
- **Direct:** a Lyra e o Salesbot fazem a triagem igual ao WhatsApp. O Direct não traz o telefone, então a Lyra pede o
  WhatsApp.
- **Funil próprio para comentários (versão 5, 2026-11-08):** criar o funil "Instagram · Comentários", fora dos indicadores,
  com as etapas Comentou → Convidado ao Direct → Só comentou (perdida em 7 dias).
  - Quem responde no Direct vai para a triagem da Lyra e muda para o funil do segmento, com a etiqueta
    `veio-de-comentario`.
  - Filtros salvos no Kommo: "Vieram de comentário" e "Só comentou".
  - Novo indicador no Helpoint: comentários → conversas → vendas, por conta.
  - Regra do Instagram: uma única mensagem no Direct por comentário, até 7 dias depois dele.

## 7. Revisão antes de aprovar (versão 6, 2026-11-08): 18 correções

Os pontos que mais pesam:
1. **Passo 0, antes de mexer no Kommo.** Hoje `mkt-kommo-coletar` procura os funis pelo nome e exige os 4, com a
   Entrada (`segmentoDo.size < 4`, linha 69). Arquivar ou renomear um funil derruba a leitura. Ele precisa passar a mapear
   os funis pelo id, aceitar a Entrada arquivada e ignorar os funis que não são de venda.
2. **Entrada arquivada, não apagada.** Os leads abertos são triados antes.
3. **Marco nos Indicadores** avisando a mudança da régua: comentário, pós-venda e números internos deixam de contar.
4. **4ª opção na lista**, "Já sou cliente": vai para a etapa Pós-venda, fora dos indicadores.
5. **Horário:** a mensagem de prazo segue o expediente e os feriados.
6. **Pessoa reserva e gestor do aviso:** decisão do dono.
7. **Créditos da IA:** conferir o consumo toda semana. O controle dos 30 minutos também pega a Lyra parada.
8. **Janela de 24 h do WhatsApp:** o lembrete sai em 20 h; depois disso, só com modelo aprovado.
9. **CPF/CNPJ:** conferir os dígitos verificadores.
10. **Duplicados:** uma pessoa conta uma vez só, pelo CPF/CNPJ ou pelo telefone.
11. **Números da empresa:** o Helpoint põe a etiqueta `interno` nos contatos do Kommo.
12. **LGPD:** dizer a finalidade e mandar a política de privacidade. O consumidor não informa CPF no chat.
13. **Yampi:** confirmar a loja e a tabela do salão; desativar os links usados; ligar o pagamento ao lead pelo id do link,
    ou pelo CPF/telefone.
14. **Endpoints com assinatura:** a chamada do Kommo e o aviso da Yampi só entram assinados.
15. **Plano do Kommo** vence em 16/03/2027 com a renovação desligada: decisão do dono.
16. **Comentários:** plano B com um Salesbot que move o lead.
17. **Saúde:** pergunta de saúde vai para pessoa; no 1º mês, ler 20 conversas por semana.
18. **Histórico:** o recálculo de 400 dias muda os meses passados.

Decisões do dono sobre a revisão (2026-11-08):
- **Férias:** a empresa tira férias coletivas, então não há pessoa reserva. A Lyra segura a conversa e avisa a data de
  volta, e a tarefa fica marcada para esse dia.
- **Aviso dos 30 minutos:** vai para a Thayná, para o dono e para o gestor comercial.
- **Plano do Kommo:** lembrete no Helpoint em 14/02/2027, 30 dias antes de vencer, para o dono e o admin.
