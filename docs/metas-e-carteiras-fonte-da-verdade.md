Anexo de correção — Frente 2: metas e carteiras (fonte da verdade)
Para colar no chat da IA. Corrige o ponto onde ela havia calculado o realizado por carteira somando vendas. O realizado por carteira é INFORMADO pelo diretor, lido do HISTORICO_METAS.json. Não se calcula do ERP.
1. Regra de ouro (não violar)
A tabela de vendas/BASE (dados do ERP) NÃO tem coluna de carteira. Carteira não existe no ERP.
Carteira vive só em tabelas de metas, alimentadas por HISTORICO_METAS.json (e METAS_<ano>.json), mantidos pelo diretor.
Realizado por carteira = valor lido do arquivo, nunca SUM(vendas).
A conciliação compara o total informado pelo diretor (que conta bonificação) com a venda líquida do ERP (venda − devolução, sem bonificação), e mostra a diferença sem ajustar.
2. Colisão de nomes: "VIP carteira" ≠ "VIP tabela"
Existem dois conceitos diferentes que usam a palavra VIP — nunca junte os dois:
Conceito
Onde vive
Para que serve
Valores
Carteira
HISTORICO_METAS.json / tabela metas_carteira
agrupamento comercial/geográfico do painel do diretor
VIP, MG, DEMAIS ESTADOS, BERÇÁRIO
Tabela de preço
CLIENTESXTABELA / cadastro do cliente
política de preço e grade de cashback
ATACADISTA, VIP, VIP MAIS, REVENDA, SALÃO REF, DIRETORIA (+ variantes CONDICAO)
MG = Minas Gerais, DEMAIS ESTADOS = outros estados (dimensão geográfica). A tabela de preço é outra coisa. Não há join entre elas.
3. Estrutura do HISTORICO_METAS.json (o que ler)
{
  "ano_base": 2026,
  "origem": "Apresentacao Comercial acumulado - planilha do diretor",
  "anos": {
    "2022": {
      "cart": { "VIP": [12 valores], "MG": [12], "DEMAIS ESTADOS": [12] },
      "total": [12 valores],
      "meta":  [12 valores]        // pode ser null em alguns anos
    },
    "2023": { "cart": {...}, "total": [12], "meta": null },
    "2024": { "cart": {...}, "total": [12], "meta": null },
    "2025": { "cart": {...}, "total": [12], "meta": [12] },
    "2026": {
      "cart": { "VIP": [12], "MG": [12], "DEMAIS ESTADOS": [12], "BERCARIO": [12] },
      "total": [12],
      "meta": [12],
      "metaTotal": [12]            // série de meta separada, meses futuros podem ser null
    }
  }
}
Notas:
Cada array tem 12 posições = meses, índice 0 = janeiro … 11 = dezembro.
BERCARIO (sem acento no JSON) só aparece a partir de 2026.
Valores 0.0 ou null em meses ainda não preenchidos significam "sem dado" — trate como NULL, nunca plote como R$ 0,00. (É a causa do bug "Fechamento de 2025: R$ 0,00".)
meta e metaTotal são duas séries de meta distintas; se houver dúvida de qual usar em cada gráfico, pergunte ao usuário antes de assumir.
Se existir METAS_<ano>.json, as metas dele sobrepõem anos[<ano>].meta para aquele ano.
4. Esquema de banco (alvo)
-- Realizado por carteira (INFORMADO pelo diretor). Sem relação com vendas.
CREATE TABLE metas_carteira (
  ano        INT      NOT NULL,
  mes        SMALLINT NOT NULL,          -- 1..12
  carteira   TEXT     NOT NULL,          -- 'VIP','MG','DEMAIS ESTADOS','BERCARIO'
  realizado  NUMERIC(14,2),             -- NULL = sem dado (não é zero)
  PRIMARY KEY (ano, mes, carteira)
);
-- Totais e metas por mês (também informados).
CREATE TABLE metas_ano (
  ano             INT      NOT NULL,
  mes             SMALLINT NOT NULL,     -- 1..12
  total_realizado NUMERIC(14,2),         -- <- anos[ano].total[mes]  (conta bonificação)
  meta            NUMERIC(14,2),         -- <- anos[ano].meta[mes]  (ou METAS_<ano> se existir)
  meta_total      NUMERIC(14,2),         -- <- anos[ano].metaTotal[mes]
  PRIMARY KEY (ano, mes)
);
origem e ano_base do JSON podem ir para uma tabela de metadados/auditoria da importação.
5. Mapeamento campo-a-campo (import do JSON → banco)
Para cada ano Y em anos:
metas_carteira: para cada carteira C em anos[Y].cart, e cada mês m (0..11): INSERT (ano=Y, mes=m+1, carteira=C, realizado = cart[C][m]) — convertendo 0.0/null → NULL.
metas_ano: para cada mês m (0..11): total_realizado = total[m]; meta = (anos[Y].meta ? meta[m] : NULL); meta_total = (anos[Y].metaTotal ? metaTotal[m] : NULL) — mesma regra de 0.0/null → NULL.
Reimportar um ano = substituir as linhas daquele ano (delete+insert), coerente com "importo tudo do zero".
6. Como as telas consomem (não recalcular)
Realizado por carteira (painel diretor): SELECT realizado FROM metas_carteira WHERE ano=? AND carteira=? — nunca SUM de vendas.
Meta × realizado: de metas_ano (meta/meta_total vs total_realizado).
Seletor de ano: montar a partir dos anos presentes em metas_ano ∪ competências existentes na BASE — não fixar no código (causa do bug do ano).
Conciliação: total_realizado (informado, com bonificação) menos venda líquida do ERP no mesmo período (calculada da BASE: SUM(valor) de linhas Tipo IN (venda, devolução), excluindo bonificação/industrialização). Exibir a diferença; não ajustar.
7. O que sai do escopo (confirmar com o usuário)
Vínculo cliente → carteira e atribuição em lote: REMOVER. Não é do processo.
Vínculo pessoa → carteira (aviso de meta ao responsável): é funcionalidade nova, não faz parte do processo atual, e exige um cadastro que hoje não existe ("quem responde por cada carteira"). Só manter se o usuário confirmar que quer — e tratar como cadastro à parte, sem relação com a BASE de vendas.
