Anexo de correção — Frente 2: metas e carteiras (fonte da verdade)
Para colar no chat da IA. Corrige o ponto onde ela havia calculado o realizado por carteira somando vendas. O realizado por carteira é INFORMADO pelo diretor, lido do HISTORICO_METAS.json. Não se calcula do ERP.

O QUE MUDOU DEPOIS DESTE ANEXO (2026-09-24, decisão do dono ao testar a tela)

A regra de ouro acima CONTINUA VALENDO na íntegra: realizado é informado, nunca somado das vendas do ERP. O que mudou foi o TOTAL DA EMPRESA:

- Este anexo tratava `total_realizado` como campo próprio, digitado em paralelo às carteiras. O dono testou e disse: "essa questão de total da empresa não tem necessidade — se eu colocar meta por carteira e depois total da empresa, buga os valores. Não deveria existir total da empresa e sim por carteira."
- A medição deu razão a ele: nos 55 meses informados, em todos os anos, `total_realizado` é EXATAMENTE a soma das carteiras (diferença máxima R$ 0,00), e não há nenhum mês com total sem carteira. A hipótese de "venda fora de carteira" nunca se realizou.
- Agora: a META é só por carteira (a da empresa é a soma, calculada, não editável), e `total_realizado` continua na tabela — a Conciliação o lê — mas é MANTIDO POR TRIGGER a partir das carteiras, não digitado. Mês sem nenhuma carteira informada continua NULL, nunca zero.
- E o motivo de estar no banco e não na tela: a importação do JSON também escreve `metas_carteira` e não passa pela tela. Regra que vale para dois caminhos mora no banco.

Carteira renomeada na mesma data: "VIP" não existe na Minasflor — é ESPECIAL. As quatro são ESPECIAL, MG, DEMAIS ESTADOS e BERCARIO.

E a carteira é do ATENDENTE interno, não do cliente: "quem tem carteira somos nós, atendentes internos da Minasflor, e dentro dessas carteiras tem a base desses clientes" (o dono, 2026-09-24). O §7 abaixo, que manda remover o vínculo cliente→carteira, continua certo quanto ao CÁLCULO — o vínculo que voltará a existir serve para o farol do vendedor (quem ligar), nunca para somar realizado.
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
Conciliação: **CORRIGIDA EM 2026-09-25 — o texto anterior está abaixo, riscado, porque a premissa dele foi negada pelo dado.**

~~total_realizado (informado, com bonificação) menos venda líquida do ERP no mesmo período (calculada da BASE: SUM(valor) de linhas Tipo IN (venda, devolução), excluindo bonificação/industrialização). Exibir a diferença; não ajustar.~~

O `total_realizado` informado pelo diretor **não** tem bonificação dentro: ele é a **venda com nota fiscal (série 1)**. Medido nos sete meses informados de 2026: informado R$ 2.977.764,84 contra venda com nota R$ 2.992.415,08 — 0,49% de folga. Contra venda + bonificação daria R$ 3,1 milhões de diferença, e era isso que a tela exibia e chamava de "de propósito".

A regra que faltava é a **SÉRIE**, confirmada pelo dono em 2026-09-25: série 1 é com nota; série 75 é sem nota **e é cobrada do mesmo jeito**. No mesmo par de CFOP de remessa gratuita (5910/6910), a série 1 é **publicidade** e a série 75 é **bonificação** (com o cashback dentro).

A conciliação agora devolve as quatro caixas e **duas** diferenças: contra a venda com nota (diagnóstico — confirma de onde vem o número da planilha) e contra o **total faturado**, que é a que pede ação: a venda da série 75 que o diretor cobra e não registra. Exibir as duas; não ajustar nenhuma.

Implementação: `com_conciliacao(p_ano)`, migration `20261026020000_conciliacao_quatro_caixas.sql`. Nenhuma reimportação foi necessária — `serie` está gravada desde a primeira migration e nunca influenciou `classe`.

Registro relacionado: **não existe devolução nenhuma no importado** (zero linhas em quatro anos; os CFOPs não vêm no relatório do Forteplus). Por isso a tela deixou de dizer "venda líquida" — a fórmula continua usando `valor_curva`, que já traz devolução com sinal negativo, então no dia em que o export trouxer, a subtração acontece sozinha.
7. O que sai do escopo (confirmar com o usuário)
Vínculo cliente → carteira e atribuição em lote: REMOVER. Não é do processo.
Vínculo pessoa → carteira (aviso de meta ao responsável): é funcionalidade nova, não faz parte do processo atual, e exige um cadastro que hoje não existe ("quem responde por cada carteira"). Só manter se o usuário confirmar que quer — e tratar como cadastro à parte, sem relação com a BASE de vendas.
