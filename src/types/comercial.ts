// Tipos do domínio do Painel Comercial (L6a). Ver `.scratch/plano-painel-comercial.md`.

/** Texto, nunca 1/2 — o HTML antigo usa números e a inversão já aconteceu duas vezes na leitura do plano. */
export type Filial = 'INBRAS' | 'MF';

/** Eixo independente do CFOP (§3.8 do plano): 1 = venda faturada, 75 = o talão especial. */
export type Serie = '1' | '75';

/** Quatro classes de verdade, mais `outros` para o que não se reconhece (§3.1, §3.2). */
export type ClasseCfop = 'venda' | 'devolucao' | 'bonificacao' | 'industrializacao' | 'outros';

export interface FaturamentoMensal {
  competencia: string;
  filial: Filial;
  serie: Serie;
  venda: number;
  devolucao: number;
  liquido: number;
  bonificacao: number;
  unidades: number;
  clientes_ativos: number;
  skus_vendidos: number;
}

/**
 * Os quatro KPIs do topo do painel, numa linha só — nunca somados a partir
 * de `FaturamentoMensal` (achado 1 da auditoria: `count(distinct …)` não se
 * soma entre grupos de mês/filial/série. Somar os meses dava 129 clientes e
 * 307 SKUs onde os arquivos reais do dono, 2026, as duas filiais, têm 58 e
 * 182). `venda`/`bonificacao` continuam iguais aos de `FaturamentoMensal`
 * somados (são aditivos); só `clientes_ativos` e `skus_vendidos` mudam.
 */
export interface PainelTotais {
  venda: number;
  devolucao: number;
  liquido: number;
  bonificacao: number;
  unidades: number;
  clientes_ativos: number;
  skus_vendidos: number;
}

export interface RankingCliente {
  cliente_codigo: string;
  nome: string;
  tabela_preco: string | null;
  faturamento: number;
  participacao: number;
}

export interface CfopForaDaCurva {
  cfop: string;
  linhas: number;
  valor: number;
}

/** Uma competência (mês) que uma importação de vendas reclamou. */
export interface CompetenciaReclamada {
  competencia: string;
  linhas: number;
  total_venda: number;
}

/** O que a RPC `com_importar_vendas` devolve — a tela confere antes de dizer "importado". */
export interface ResumoImportacaoVendas {
  gravadas: number;
  /**
   * Eco do `p_descartes` que o navegador mandou, não uma recontagem do banco
   * (achado 11.4 da auditoria). Confiável porque `com_importar_vendas`
   * recusa a importação inteira quando `linhas_lidas ≠ itens + descartes`
   * (§4.3) — mas não confunda com uma contagem feita no banco.
   */
  descartes: Record<string, number>;
  competencias: CompetenciaReclamada[];
  outros_linhas: number;
  outros_valor: number;
  cfops_outros: string[];
  substituiu: boolean;
}

/** O que a RPC `com_importar_clientes` devolve. */
export interface ResumoImportacaoClientes {
  criados: number;
  atualizados: number;
  tabelas_alteradas: number;
}

/**
 * A última importação de cada tipo — para o rodapé fixo (§3.9): de qual
 * importação os números vêm. Domínio do módulo, por isso mora aqui (achado
 * 10.5 da auditoria) e não em `useComercialPainel.ts`, ao lado de todo o
 * resto do tipo do Comercial.
 */
export interface ComercialImportacao {
  id: string;
  tipo: 'vendas' | 'clientes' | 'metas';
  filial: Filial | null;
  file_name: string;
  linhas_lidas: number;
  itens_gravados: number;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// L6b — curva ABC, clientes a trabalhar, bonificação e pedidos em condição.
// Ver `.scratch/plano-l6b-curva-e-condicao.md`.
// ═══════════════════════════════════════════════════════════════════════════

/** O critério de ordenação da curva ABC — eixo próprio, nada a ver com a série. */
export type CriterioCurva = 'valor' | 'quantidade';

/** As três faixas de Pareto, mais `'-'` para o produto fora da classificação (saldo líquido ≤ 0 no período). */
export type FaixaCurva = 'A' | 'B' | 'C' | '-';

/**
 * Uma linha da curva ABC — por produto, no período/filial/critério
 * escolhidos. `participacao` e `acumulado` são nulos quando `faixa === '-'`
 * (produto fora da classificação): nunca zero, que sugeriria "vendeu, mas
 * pouco" em vez de "saldo negativo ou zero, sem Pareto para fazer".
 */
export interface ProdutoNaCurva {
  produto_codigo: string;
  nome: string;
  valor: number;
  quantidade: number;
  participacao: number | null;
  acumulado: number | null;
  faixa: FaixaCurva;
}

/**
 * Contagem e valor por faixa (achado A3 da auditoria, correção): a mesma
 * classificação de `ProdutoNaCurva`, agregada no banco por `faixa` — para os
 * cartões da tela não contarem sobre `linhas`, que `buscarComTeto` corta em
 * 500. Uma faixa sem produto no período simplesmente não aparece na lista.
 */
export interface FaixaContagem {
  faixa: FaixaCurva;
  produtos: number;
  valor: number;
}

/**
 * Bonificação por cliente e o quanto ela representa do que ele comprou.
 * `percentual` é nulo quando `comprado <= 0` — cliente que só recebeu
 * bonificação não tem percentual, tem um aviso (nunca zero, nunca a conta
 * feita no navegador dividindo por zero).
 */
export interface BonificacaoCliente {
  cliente_codigo: string;
  nome: string;
  tabela_preco: string | null;
  bonificado: number;
  comprado: number;
  percentual: number | null;
}

/**
 * Um pedido em condição: série 75 E cliente com `em_condicao`, as duas
 * coisas — nunca uma só (§13 do INSTRUCOES v7). `total` já soma venda e
 * bonificação; a tela nunca refaz essa conta.
 */
export interface PedidoEmCondicao {
  cliente_codigo: string;
  nome: string;
  competencia: string;
  venda: number;
  bonificacao: number;
  total: number;
}

/**
 * Um cliente que comprou e parou: comprou em pelo menos 2 dos 3 meses
 * anteriores ao último mês com movimento, e não comprou nesse último mês.
 * "Nunca comprou" é da L6c.
 */
export interface ClienteATrabalhar {
  cliente_codigo: string;
  nome: string;
  tabela_preco: string | null;
  ultima_compra: string | null;
  valor_ultimos_3m: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// L6c — cashback e a ficha do cliente. Ver
// `docs/instrucoes-painel-comercial.md` (INSTRUCOES v7) §12.
// ═══════════════════════════════════════════════════════════════════════════

/** Um degrau da grade de cashback de uma tabela de preço: a partir de `valor_minimo`, `percentual` de cashback. */
export interface FaixaCashback {
  id: string;
  tabela_base: string;
  valor_minimo: number;
  percentual: number;
}

/**
 * A apuração de um cliente num mês. `tabela_base` vem de `com_clientes`
 * (atributo atual, sem histórico — §0 do plano original foi descartado: o
 * INSTRUCOES v7 não pede linha do tempo de tabela de preço).
 *
 * `sem_programa = true` → `percentual` e `cashback` são NULOS (a tabela do
 * cliente não tem grade cadastrada — nunca zero, nunca estimado).
 * `sem_programa = false` e `comprado` abaixo do menor degrau → `cashback` é
 * ZERO (tem programa, não atingiu naquele mês) e `percentual` fica nulo (não
 * há faixa que se aplique). As duas coisas nunca se confundem.
 *
 * `sem_tabela = true` → o cliente não tem `tabela_base` nenhuma (sem linha
 * em `com_clientes`, ou com `tabela_preco` nula) — é anomalia a apontar
 * (§8), não o mesmo balde de `sem_programa` (que é REVENDA/SALÃO
 * REF/DIRETORIA: TEM tabela, só não tem grade). As duas flags nunca são
 * verdadeiras ao mesmo tempo (achado 3 da auditoria da L6c).
 */
export interface CashbackMensal {
  cliente_codigo: string;
  nome: string;
  competencia: string;
  tabela_base: string | null;
  comprado: number;
  percentual: number | null;
  cashback: number | null;
  sem_programa: boolean;
  sem_tabela: boolean;
}

/**
 * Um cliente, resumido no recorte (ano + filial) — soma das apurações
 * mensais (nunca o percentual sobre o acumulado). `ultima_faixa` e
 * `falta_proxima_faixa` olham o ÚLTIMO mês com movimento do cliente (a
 * faixa é mensal, não do período inteiro). `meta_para_ativar` é 50% da
 * compra do período, como o §12 do documento especifica.
 */
export interface CashbackResumo {
  cliente_codigo: string;
  nome: string;
  tabela_base: string | null;
  sem_programa: boolean;
  comprado: number;
  cashback: number | null;
  meses_com_direito: number;
  ultima_competencia: string | null;
  ultima_faixa: number | null;
  meta_para_ativar: number | null;
  falta_proxima_faixa: number | null;
  menor_distancia: number | null;
  sem_tabela: boolean;
}

/** Os cinco indicadores do topo da seção de cashback, numa linha só — a soma mora no banco, nunca no navegador. */
export interface CashbackIndicadores {
  cashback_total: number;
  comprado_total: number;
  percentual: number | null;
  clientes_nao_atingiram: number;
  clientes_sem_programa: number;
  clientes_sem_tabela: number;
}

/** Uma linha de produto na ficha do cliente — comprado, bonificado, ou parado. */
export interface FichaClienteProduto {
  produto_codigo: string;
  nome: string;
  valor: number;
  quantidade: number;
}

/** Um produto que o cliente nunca comprou no período — `valor_outros` é o quanto ele vendeu para os OUTROS clientes. */
export interface FichaClienteNuncaComprou {
  produto_codigo: string;
  nome: string;
  valor_outros: number;
}

/** Um produto que o cliente comprou em ≥2 dos 3 meses anteriores ao último mês com movimento dele, e não comprou nesse último mês. */
export interface FichaClienteParouDeComprar {
  produto_codigo: string;
  nome: string;
}

/**
 * A ficha do cliente inteira, num `jsonb` só. A âncora de `parou_de_comprar`
 * é o último mês com movimento DO CLIENTE, nunca `current_date`.
 * `nunca_comprou` tem teto de 100 linhas; `nunca_comprou_total` é o total
 * antes do corte, para a tela dizer "mostrando 100 de N".
 */
export interface FichaCliente {
  comprou: FichaClienteProduto[];
  bonificado: FichaClienteProduto[];
  parou_de_comprar: FichaClienteParouDeComprar[];
  nunca_comprou: FichaClienteNuncaComprou[];
  nunca_comprou_total: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// L6d — carteiras e metas. Ver .scratch/plano-l6d-metas-e-carteiras.md e
// docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §14/§15.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Uma carteira do comercial (VIP, MG, Demais Estados, Berçário — dado do
 * dono, editável). Atribuída a cliente (`com_clientes.carteira_id`) pelo
 * supervisor/admin, nunca derivada de tabela de preço, estado ou nome.
 */
export interface Carteira {
  id: string;
  nome: string;
  ativa: boolean;
}

/**
 * Uma meta de vendas: de uma carteira (`carteira_id` preenchido) ou da
 * empresa inteira (`carteira_id` nulo — o §15 tem as duas). `valor` nunca é
 * negativo; mês sem meta simplesmente não tem linha aqui.
 */
export interface MetaComercial {
  id: string;
  ano: number;
  mes: number;
  carteira_id: string | null;
  valor: number;
}

/**
 * Uma linha de `com_metas_x_realizado`: (competência, carteira). `meta` e
 * `cobertura` NULOS significam "mês sem meta definida" — nunca zero, nunca
 * divisão por zero. O balde `carteira_id === null` é "Sem carteira" (cliente
 * sem atribuição) — nunca a meta TOTAL da empresa, que é outra linha, lida
 * direto de `com_metas` pela tela.
 */
export interface MetaXRealizado {
  competencia: string;
  carteira_id: string | null;
  carteira_nome: string;
  meta: number | null;
  realizado: number;
  cobertura: number | null;
  peso: number | null;
}

/**
 * O quadro de conciliação do §15: venda líquida + bonificação = soma; a
 * diferença contra o valor da apresentação (digitado pelo diretor) aparece
 * exata — a tela nunca arredonda, esconde ou "ajusta" para fechar bonito.
 * `diferenca` é nula quando `p_apresentacao` não foi informado.
 */
export interface Conciliacao {
  venda_liquida: number;
  bonificacao: number;
  soma: number;
  diferenca: number | null;
}
