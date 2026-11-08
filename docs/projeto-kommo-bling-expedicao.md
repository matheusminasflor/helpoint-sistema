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

## 8. Revisão completa (versão 7, 2026-11-08): mais 15 pontos, 33 no total

Segunda passada, sistemática: a página foi conferida seção por seção contra os dados, as regras do Kommo, do WhatsApp, do
Instagram e da Yampi, o código, a LGPD, o custo e as contradições internas.

Os 15 pontos novos:
- **19.** O segmento é contado pelo campo Segmento. Lead em "Com a Lyra" sem segmento conta como sem triagem.
- **20.** Funil "Atendimento (fora de venda)", com Pós-venda, Interno e Outros assuntos, fora dos indicadores.
- **21.** Só o Salesbot fala na primeira mensagem. A Lyra entra depois da triagem, ou pela etiqueta `precisa-ia`.
- **22.** Limite do plano: 2.922 de 5.000 leads. Leads "só comentou" excluídos 30 dias depois de fechados (decisão do dono),
  e aviso em 80%.
- **23.** Contato que já tem segmento vai direto para o funil dele.
- **24.** Comentários separados por palavras na automação, sem IA.
- **25.** Masterclass continua no Salão.
- **26.** Formulário do site vai para "Com a Thayná". Falta confirmar se ele é só para distribuidor.
- **27.** Motivo de perda: plano B com um campo obrigatório na etapa Venda perdida.
- **28.** O Helpoint escreve no Kommo só a etiqueta `interno` e a Venda ganha dos links que ele gerou, com registro.
- **29.** O Kommo não mescla contatos sozinho.
- **30.** No Instagram, as opções vão como respostas rápidas, e a janela também é de 24 h.
- **31.** O número oficial é o do Helpoint.
- **32.** Kommo × Bling se conferem, nunca se somam.
- **33.** O recesso da empresa é cadastrado no Helpoint.

Seis pontos só se provam montando, e cada um tem plano B (seção "Provar na montagem" da página).

Decisões do dono (2026-11-08):
- os leads "só comentou" são excluídos 30 dias depois de fechados (o Helpoint guarda a contagem antes);
- o formulário do site é só para distribuidor.

## 9. Comercial › Atendimento do CRM (versão 8, 2026-11-08, pedido do dono)

Uma tela nova no Comercial, separada dos indicadores das vendedoras do Forteplus.

**Por atendente do Kommo:** leads, vendas, vendido, taxa, 1ª resposta (mediana, só no expediente), fora do prazo, sem
resposta, tarefas atrasadas e perdidas sem motivo.

**Por segmento × atendente:**
- vendido no Distribuidor = nota do Forteplus;
- vendido em Salão e Consumidor = pago na Yampi, depois nota do Bling na etapa 3.

**Regras:**
- **Usuário novo:** todo usuário do Kommo aparece sozinho na visão da equipe.
- **"Meus":** depende de ligar o login do Kommo à pessoa do Helpoint. A ligação é pelo e-mail; quando o e-mail não bate, o
  admin liga uma vez. A Thayná é ligada à mão, porque o login dela usa o e-mail tic.minasflor@gmail.com.
- **Lyra:** tem linha própria. A venda é da Lyra quando nenhuma pessoa mandou mensagem no lead.
- **Lead que trocou de mãos:** a venda conta para quem fechou; a 1ª resposta, para quem recebeu primeiro.
- **Distribuidor sem nota:** fica em "Aguardando nota", fora do Vendido.
- **Quem vê tudo:** dono, admin e gestor comercial.

Os Indicadores do Marketing mostram o mesmo vendido, porque leem a mesma tabela.

Seção "Como garantimos", com as camadas de conferência:
- testes de cada regra e CI verde;
- conferência com o conector do Kommo;
- conferência venda por venda com as notas do Forteplus e os pedidos da Yampi;
- 2 semanas lado a lado antes da notícia;
- lista "Para corrigir";
- robô vigiado.

## 10. Passo 0 feito (2026-11-08) e achado 34

**Passo 0:**
- `mkt-kommo-coletar` usa `_shared/kommo-segmento.ts`: o funil é reconhecido pelo id, o campo Segmento vale mais que o
  funil, e lead na etapa "Com a Lyra" sem Segmento conta como sem triagem. Testes em `src/lib/kommo-segmento.test.ts`.
- CI #755 verde. Publicado em produção. A leitura de 08/11 deu os mesmos números de antes, mês a mês.

**Achado 34:**
- Priscila tem duas vendas ganhas de R$ 5.096:
  - lead 118411874 (Entrada, fechado em 26/10);
  - lead 115903858 (Distribuidor, formulário de 12/09, fechado em 05/11).
- **Correção no Kommo:** deixar só uma.
- **Regra para o passo 4:** cada nota do Forteplus conta uma vez, para a 1ª venda ganha do cliente; a outra vai para
  "Para corrigir: venda repetida".

## 11. Passo 1 feito no Kommo (2026-11-08, pelo navegador, com autorização do dono)

**Feito:**
- **Campos do lead:** CPF/CNPJ (texto), Segmento (lista: Consumidor final, Salão, Distribuidor), Marca (lista: BY.MF,
  Minasflor, MF.PRO) e Link Yampi (url). Cidade e Estado já existiam no contato.
- **Etapas:**
  - Consumidor Final e Salão: Com a Lyra (113891167 e 113891215), Com a Thayná (ex-Contatado/Contatados), Em negociação
    (mantida, sem mover leads) e Link enviado (113891171 e 113891219);
  - Distribuidor: Com a Lyra (113891223), A contatar, Com a Thayná (ex-Contatado), Enviado para o representante,
    Follow-up e Negociação.
- **Funis novos:**
  - "Instagram · Comentários" (14739447): Comentou, Convidado ao Direct;
  - "Atendimento (fora de venda)" (14739451): Pós-venda, Interno, Outros assuntos.
- **Priscila:** depois de unir os leads, sobrou o 118411874 (Entrada), que ganhou Segmento = Distribuidor. Ele não mudou
  de funil, para a data de fechamento não virar hoje. A leitura de 08/11 contou uma venda só, de R$ 5.096, como
  Distribuidor em 26/10.

**Provado na montagem:**
- campo obrigatório por etapa existe ("Obrigatório para funis de venda e etapas");
- motivo de perda obrigatório não existe;
- a fonte de comentários e o Direct ficam presos à integração do Instagram, que cai na Entrada.

**O que mudou no plano:**
- o WhatsApp "Minasflor Comercial" já cai no Consumidor Final e fica lá;
- a Entrada não é arquivada: ela continua como porta do Instagram, e o robô do passo 3 tira os leads de lá;
- passam para o passo 3: desligar "leads de entrada", os filtros salvos e o robô dos comentários.

**Em aberto:** o login "Minasflor Professional" é o mesmo que o dono usa (estava logado nele). Trocar o nome para
"Thayná" depende de confirmar quem usa o login.

## 12. Lojas e regra de canal (dono, 2026-11-08)

**As lojas:**
- **BY.MF** tem loja pública: https://bymfpro.com.br/.
- **Minasflor e MF.PRO não têm loja pública, de propósito.** Cada cliente recebe um link de pagamento personalizado da
  Yampi. Uma loja aberta igual à da BY.MF desagradaria os distribuidores.

**Para a Lyra:**
- nunca mandar link genérico de Minasflor ou MF.PRO, só o link daquele cliente (fase 1: gerado pela Thayná; fase 2:
  gerado pelo Helpoint);
- não publicar preço de Minasflor ou MF.PRO em resposta aberta.

**Catálogos:** estão em `C:\Users\matheus.baeta\Downloads\CATÁLOGOS_` (Styling, ebook Styling, Therapy, BY.MF, Minasflor,
Backbar, 2 cartelas de cores e o catálogo digital de distribuidores). A base da Lyra fica em `docs/lyra-base/`. O
catálogo de distribuidores ficou de fora, porque repete os produtos e traz condição de revenda.
- **Região com distribuidor (dono, 2026-11-08):** o salão ou o consumidor de Minasflor e MF.PRO compra direto, com o link
  dele, sem olhar a região. A Lyra não encaminha ao distribuidor.

## 13. Passo 3: o robô de triagem já existe (2026-11-08)

**O que já existe:**
- O Kommo tem robôs de boas-vindas ("Qualquer nova conversa"):
  - "BOT INICIAL MF": 1.113 disparos; na lista aparece apagado, com alerta no gatilho;
  - "BOT INICIAL MF copiar(1)": 552 disparos, ativo.
- O que eles fazem:
  - mandam "1 Consumidor Final / 2 Salão / 3 Distribuidor"; no original, as respostas foram 46,8%, 40,5% e 12,7% dos
    cliques;
  - mudam o lead para a etapa "Com a Thayná" do funil escolhido (ex-Contatado, renomeada no passo 1);
  - perguntam o nome.

Cerca de 43% de quem recebeu a mensagem não clicou, e é provável que esses leads sejam os parados na Entrada.

**Plano revisto:** não criar outro robô, que mandaria duas saudações. A ideia é copiar o robô ativo, melhorar a cópia
(texto da Lyra, 4ª opção "Já sou cliente", campo Segmento e etiquetas, CPF/CNPJ no Salão e no Distribuidor, tarefa da
Thayná), testar disparando à mão num lead de teste e só então trocar o gatilho.

**Formato do código do Salesbot** (visto num rascunho que não foi salvo): blocos
`{"0":{"block_uid","question":[{"handler":"send_message","params":{"text","type":"external","buttons":[{"type":"inline","text"}]}}]}}`.
Abrir o código é sem volta: o robô deixa de poder ser editado pelos blocos.

**Gatilhos disponíveis no Avançado:** criação ou mudança de etapa, nova conversa, comentário recebido e menção em
história. Gatilho por etiqueta é do plano Pro.
