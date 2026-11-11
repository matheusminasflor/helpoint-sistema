# Regra da comissão do Comercial

Decidida pelo dono em 2026-11-12 (proposta https://claude.ai/artifact/DogLjeM9MuJUzFt2H7ALFV, seção 9).
Este arquivo é a especificação: o código segue o que está aqui.

## Princípio

- **Comissão é paga só sobre o que foi faturado**, com nota fiscal emitida. Lançado sem nota é previsão.
- Na tela aparecem duas partes: **Garantida** (com nota) e **A confirmar** (lançado sem nota, ou venda sem nota
  ainda). O "i" explica: "Comissão é paga só sobre o faturado, com nota fiscal emitida. A confirmar é previsão e
  pode mudar."
- Atualiza sozinha quando o Financeiro sobe o XML da nota e quando o Forteplus é importado. **O Forteplus
  prevalece.**
- **O mês fecha no último dia do próprio mês**, para todas as carteiras e para o Atendimento do CRM. A venda conta
  no mês da data da nota. Mês fechado mostra só a parte garantida, e o valor fica congelado mesmo que o cliente
  troque de carteira depois.
- Quem vê: cada pessoa vê só a sua; dono, admin e gestor comercial veem a de todos.

## Atendimento do CRM (atendente do Kommo)

| Segmento | % | Sobre o quê |
|---|---|---|
| Consumidor final | 10% | Venda com nota fiscal |
| Salão | 10% | Venda com nota fiscal |
| Novo distribuidor | 5% | Só o **1º pedido faturado** de um CNPJ que nunca comprou antes. Depois ele segue na carteira da vendedora. |

- Consumidor final e salão vendem pela loja (Yampi/Bling), e o Helpoint ainda não recebe essas notas. **Até o Bling
  ser ligado, essa comissão aparece só como "A confirmar"**, pelo valor da venda ganha no Kommo. Quando a nota
  chegar, vira "Garantida" pelo valor da nota.
- A atendente é a responsável pelo lead no Kommo.

## Carteiras de distribuidores ativos

| Carteira | % | Condição |
|---|---|---|
| ESPECIAL | 0,5% | Só se a carteira bater **100% da meta do mês** |
| DEMAIS ESTADOS | 0,5% | Idem |
| BERÇÁRIO | — | Sem comissão |
| ARTISTAS | — | Sem comissão |

- **Tudo ou nada:** bateu a meta do mês, ganha 0,5% sobre **toda a venda do mês** da carteira (a mesma "Venda total"
  que é comparada com a meta). Não bateu, zero.
- Enquanto o mês corre, a tela mostra "faltam R$ X para ganhar R$ Y", e a parte "a confirmar" usa a venda com a
  prévia (lançado depois da última nota).
- A comissão é de quem é dono da carteira no mês.

## Onde aparece

- Painel do Comercial: a comissão da própria vendedora.
- Metas e desempenho: a de cada vendedora e carteira (gestor). Com seletor de carteira: uma ou todas, quando a
  vendedora tem mais de uma.
- Atendimento digital (Atendimento do CRM): a de cada atendente, na aba "Por atendente".
