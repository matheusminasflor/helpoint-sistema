# Regra do cashback (decisões do dono, 2026-10-06)

Fonte: conversa com o dono em 2026-10-06, as memórias fiscais do Forteplus (`MEMORIA_FISCAL_VENDA.xls`,
`BONFICACAO_MEMROIA_FISCAL.xls`), os relatórios "Mercadorias Vendidas" de setembro (Minasflor e Inbras)
e a planilha que o Comercial usava antes do sistema (`Cashback_3.xlsx`, aba CashBack).

## O que conta como compra para o cashback

**Nota com CFOP de VENDA — de qualquer série.** O dono: "Série 1 com CFOP de venda; série 75 porém a
natureza da operação é Venda, então de fato é venda e deve contar no cashback."

No Forteplus a série não separa sozinha: a série 1 leva venda **e** publicidade; a série 75 leva
cashback, bonificação **e** a "condição metade sem nota" (que é venda). Quem separa é o **CFOP**, como
está cadastrado na memória fiscal:

| Memória fiscal (natureza) | CFOPs | Cashback |
|---|---|---|
| Venda | 5101, 5401, 5405, 6101, 6107, 6401, 7101 (e 5102, 6102, 6403, que aparecem no histórico) | **conta** |
| Bonificação (inclui publicidade, brinde e o próprio cashback) | 5910, 6910, 7949 | não conta |
| Industrialização / outros | 5901, 6901, 6903, 5151, 6949 | não conta |

Devolução de venda (CFOP de devolução) **abate** a compra do mês, como já era.

Medido no banco em 2026-10-06 (`com_vendas_itens`): o cálculo contava `classe in ('venda','devolucao')`,
mas a classe estava errada em dois CFOPs — **7949** marcado como venda (é bonificação; R$ 24,3 mil no
histórico) e **5405** marcado como "outros" (é venda).

**Cadastro a corrigir no Forteplus:** na memória fiscal de Bonificação, a operação **853**
(MG → RS, contribuinte ICMS, "BONIFICACAO CONTRIBUINTE RS") está com o CFOP **6401**, que é de venda.
Toda bonificação emitida por ela entra como venda até o cadastro ser corrigido.

## O valor do cashback e a regra de ativação

Exemplo da planilha (CLARA & BELLA, tabela ATACADISTA):

| Compra de setembro | Compra para ativar (metade) | Cashback |
|---|---|---|
| R$ 28.476,04 | R$ 14.238,02 | R$ 1.139,04 (4% — faixa da tabela) |

1. A compra do mês **M** (só o que conta, acima) × a porcentagem da faixa da tabela de preço do cliente
   = o cashback **gerado** em M. (A tabela de faixas por tabela de preço já existe no sistema.)
2. **Compra para ativar** = compra de M ÷ 2.
3. O cashback gerado em M só é **liberado** se a compra do mês **M+1** for **maior ou igual** à compra para
   ativar. Comprou menos, não libera. (Decisão do dono: "setembro gera, outubro libera".)
