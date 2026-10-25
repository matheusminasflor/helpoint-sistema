# Portal do Distribuidor — a ideia (dono, 2026-10-21)

Status: **ideia em planejamento**. Nada construído. Decisões ainda abertas no fim.

## Para quem e para quê

Aplicativo dentro do Helpoint para os **clientes que revendem** a Minasflor — distribuidores e revendedores. Usado
principalmente no celular (carro, salão, entre visitas). Um "vendedor ajudante": toda manhã responde

1. quem eu preciso visitar?
2. quem eu preciso vender de novo?
3. onde estou deixando dinheiro na mesa?

Aparência muito simples, moderna e comercial; desenho guiado pelas Laws of UX (https://lawsofux.com/).

## O que o distribuidor faz no portal

**Prospecção e carteira de salões**
- Ele já prospecta no dia a dia: acha salões no Google Maps, na região dele, que ainda não conhece.
- No portal, ele **cadastra o salão** (botão "lançar") e **agenda a visita**. O salão nasce como prospecção e anda
  pelo funil (novo → contato → visita → testando → cliente).
- A Minasflor **não busca nem trabalha esses leads**, mas **quer ter os dados** (fica tudo no Helpoint).
- **Futuro, fora do MVP:** botão "prospectar minha região" — escolhe estado/cidade/filtros, a IA pesquisa no Google
  Maps e traz os salões para ele cadastrar.

**Vendas e estoque dele**
- Ele registra as **vendas dele aos salões** e controla o **estoque dele** pelo app (o que tem, o que entrou, o que
  saiu). É daí que saem recompra, média do salão, oportunidades e resultados.
- **Entrada no estoque (dono, 2026-10-21): o próprio distribuidor dá entrada na nota fiscal** que recebeu e assim
  atualiza o estoque — não entra sozinho quando a Minasflor fatura.

**Relação com a Minasflor**
- **Pedido de compra à Minasflor** pelo app: escolhe os produtos do catálogo e envia. Cai no **Comercial** do
  Helpoint, que trata o pedido e tenta aumentar a venda.
- **Abrir SAC** (atendimento/reclamação) para a Minasflor pelo app.

## O que a Minasflor faz e vê

- **Cadastra os produtos** no Helpoint; o que está cadastrado aparece para o distribuidor.
- **Estoque e lote da Minasflor:** produto sem estoque **some sozinho** do catálogo do distribuidor.
- O **Comercial vê o estoque de cada distribuidor**: o que ele tem e o que precisa repor — para vender melhor.
- Vê também os pedidos, a carteira de salões e as vendas dele.

## Tabela de preço por cliente (adendo do dono, 2026-10-21)

- Cada distribuidor tem a **sua tabela de preço**. O **preço base é o de revenda**; cada tabela é uma
  **porcentagem** do preço de revenda. O dono passa as porcentagens quando isso for construído.
- Exemplo do dono, shampoo "João mais 7": revenda R$ 80 · atacadista R$ 40 · VIP R$ 50 · VIP Mais R$ 60
  (ou seja, 50%, 62,5% e 75% da revenda).
- No app, o distribuidor vê **exatamente o preço da tabela dele**.
- Já existe o nome da tabela por cliente em `com_clientes.tabela_preco` (vindo do Forteplus: VIP MAIS 148, VIP 122,
  ATACADISTA 46, ATACADISTA CONDICAO 25, REVENDA 20, …). Falta o preço de revenda por produto e a % de cada tabela.

## Cadastro com liberação (adendo do dono, 2026-10-21)

1. O distribuidor **pede o cadastro** pelo app.
2. A Minasflor **recebe o aviso**, **confere os dados** e **atrela a tabela de preço** dele.
3. A Minasflor **confirma**; ele recebe **e-mail de acesso liberado**.
4. Só depois disso ele usa o sistema.

O portal do cliente já tem o começo disso (`customer_profiles.vinculo_confirmado`, `vinculo_pedido_em`).

## LGPD (adendo do dono, 2026-10-21)

Além das Laws of UX, a LGPD é obrigatória: são dados sigilosos do distribuidor e dados de pessoas dos salões.
Precisa de **Termos de Uso** e **Política de Privacidade** detalhados, aceitos no primeiro acesso, dizendo que dados
coletamos, para quê, com quem compartilhamos, por quanto tempo guardamos, e como a pessoa pede para ver, corrigir
ou apagar os dados dela.

## Telas do MVP (proposta inicial)

Meu dia · Salões (com funil) · Recompras · Oportunidades · Agenda · Resultados — mais **Pedido à Minasflor**,
**Meu estoque** e **SAC**, que entraram com o adendo do dono.

## O que já existe no Helpoint (medido em 2026-10-21)

- `com_produtos`: 351 produtos (código e nome, vindos das notas do Forteplus) — sem preço de tabela por cliente,
  sem estoque, sem lote.
- Estoque e lote **da Minasflor** (produto acabado) **não estão no Helpoint**: vivem no Forteplus. O estoque de
  expedição foi apagado em 2026-10-02.
- Portal do cliente (`customer_profiles`, login por código no e-mail, vínculo com o código do cliente no Forteplus)
  e SAC (`sac_tickets`, `sac_products`, `sac_product_batches`) existem e estão **sem uso** (0 registros).
- Compras de cada distribuidor à Minasflor: notas do Forteplus importadas (`com_vendas_itens`), tabelas Atacadista e
  Revenda (~70 clientes).

## Conecta Venda (dono, 2026-10-21)

O pedido do app deve cair no **Conecta Venda**, que já está ligado ao Forteplus por API: pedido que entra no Conecta
entra sozinho no Forteplus. São **duas contas Conecta**, uma da **MF** e uma da **INBRAS** (uma chave de API cada).

O que a API do Conecta permite (lido em https://api.conectavenda.com.br/docs/openapi-bundled.json, 2026-10-21):

- **Não existe "criar pedido".** Para pedidos, a API só **lista** (`pedidos/listar`) e **muda a situação**
  (`pedidos/editar`: em_aberto, em_producao, pago, enviado, entregue, finalizado, em_analise, cancelado). O pedido
  nasce quando o comprador fecha a compra **dentro de um catálogo do Conecta** (link), e cada catálogo tem **uma
  tabela de preço** e um vendedor.
- **Ler pedidos** traz: situação, CNPJ/razão social, catálogo, tabela, itens (referência, EAN, quantidade, valor
  unitário), valores, pagamento, frete e o link de acompanhamento. **Não traz o número da nota fiscal.**
- **Ler produtos** (`produtos/listar`) traz fotos, grupo, **estoque** e **preço por tabela** de cada produto.
- **Sacolas abandonadas**: carrinhos que não viraram pedido, com o cliente quando ele se identificou.
- Limites: **30.000 chamadas por mês por conta** (negociável) e 5 MB por chamada. Uma leitura a cada 10 minutos
  gasta ~4.300 chamadas/mês por tipo de dado.

Consequência: o Helpoint **não consegue mandar** o pedido para o Conecta pela API de hoje. Ou o distribuidor fecha o
pedido num catálogo do Conecta aberto pelo app, ou o Conecta precisa liberar a criação de pedido pela API.
Em compensação, preço por tabela e estoque da Minasflor **já existem no Conecta** (decisões 1 e 2 abaixo).

**Decidido (dono, 2026-10-21):**
- O distribuidor faz o pedido **no catálogo do Conecta**, aberto pelo app já na tabela dele. O pedido segue sozinho
  para o Forteplus, como hoje. O Helpoint **lê** os pedidos de volta (`pedidos/listar`, pelo CNPJ) e mostra a
  situação para o distribuidor ("Meus pedidos") e para o Comercial. As telas de montar e revisar o pedido dentro do
  app saíram do desenho.
- **MF ou INBRAS: ele escolhe a cada pedido** (dois botões, um catálogo de cada conta).
- O Comercial não confirma nem lança o pedido no Helpoint (já está no Forteplus); a tela dele mostra o pedido, a
  situação e o "para aumentar a venda", incluindo carrinho que ele montou e não fechou (sacolas abandonadas).
- Pendente de conferir com o Conecta: se o catálogo pede login do comprador, e se a integração com o Forteplus
  atualiza a situação do pedido (faturado/enviado) — a API não traz o número da nota; a entrada da nota usa as notas
  importadas do Forteplus.

## Decidido em 2026-10-25 (dono, antes da etapa 6)

1. **Estoque e preço da Minasflor: lidos do Conecta** (`produtos/listar`, a cada 10 minutos, as duas contas MF e
   INBRAS). As chaves de API ficam nos segredos das funções; o dono cadastra no fim.
2. **O estoque do distribuidor**: o que ele compra da Minasflor **entra sozinho quando a nota é importada do
   Forteplus** (`com_vendas_itens` do código dele); a **venda ao salão ele registra no app** (salão, produtos,
   quantidades).
3. **LGPD**: a Minasflor vê o salão, a cidade e o que ele compra; **telefone e nome do contato só o distribuidor e a
   equipe dele**. O termo do primeiro acesso diz isso.
4. **Quem libera o cadastro do distribuidor: a TI** — o Gestor da TI, ou quem da TI tiver no perfil a permissão de
   liberar distribuidor. Liga ao código do cliente no Forteplus.
5. (já decidido na v5) **Um login por pessoa**: o distribuidor e cada vendedor dele, o distribuidor vendo tudo.
6. (já decidido em 2026-10-21) **O pedido à Minasflor** é feito no catálogo do Conecta; o Helpoint lê de volta.

## Decisões em aberto (as de 2026-10-21; respondidas acima)

1. **Estoque e lote da Minasflor**: lançados no Helpoint (módulo novo) ou trazidos do Forteplus (integração/importação).
2. **Preço de revenda** de cada produto: cadastrado no Helpoint ou importado; e a % de cada tabela (o dono passa).
3. **Venda ao salão e estoque do distribuidor**: como ele registra (pedido rápido no app; o pedido da Minasflor
   faturado entra sozinho no estoque dele?).
4. **O pedido à Minasflor** vira o quê no Comercial: chamado, lançamento, pedido no Forteplus.
5. **LGPD**: termo de uso no primeiro acesso (dados dos salões ficam com a Minasflor) e quem vê telefone/contato.
6. **Acesso**: um login por distribuidor ou também os vendedores dele.
