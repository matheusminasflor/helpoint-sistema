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
// Frente 2 — carteiras e metas do diretor. Ver
// docs/metas-e-carteiras-fonte-da-verdade.md (manda sobre tudo aqui) e
// .scratch/plano-frente2-metas-e-carteiras.md. Substitui os tipos da L6d
// (que calculavam realizado por carteira somando venda — o erro desta
// leva) e o `Carteira { id, nome }` de tabela de domínio: carteira agora é
// texto livre, sem `com_carteiras`. `nome` é a própria identidade — não há
// `id` separado.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Uma carteira conhecida pelo sistema (VIP, MG, Demais Estados, Berçário —
 * dado do dono). Vem de `com_carteiras_conhecidas()`: a união do que já
 * apareceu em `metas_carteira` (importado), `com_metas` (meta definida) e
 * `com_carteira_membros` (alguém responde por ela) — nunca uma lista fixa
 * no código. Se o dono criar uma quinta carteira, ela entra sozinha na
 * próxima importação.
 */
export interface Carteira {
  nome: string;
}

/**
 * Pessoa → carteira ("quem responde por cada carteira"). O trigger
 * `notify_on_meta_definida` avisa quem está em `com_carteira_membros` —
 * sem uma linha aqui, o aviso pelo sino nunca dispara para ninguém, mesmo
 * com a meta definida certinha.
 */
export interface CarteiraMembro {
  id: string;
  carteira: string;
  user_id: string;
  nome: string;
}

/**
 * Quem pode ser posto numa carteira: tem o módulo Comercial concedido, ou é
 * owner/admin. `unique (tenant_id, user_id)` no banco garante uma pessoa por
 * carteira; esta lista é só o universo de nomes para escolher.
 */
export interface PessoaElegivelCarteira {
  id: string;
  nome: string;
}

/**
 * Uma meta de vendas DEFINIDA no sistema (não importada): de uma carteira
 * (`carteira` preenchida) ou da empresa inteira (`carteira` nula — o §15
 * tem as duas). É o que o diretor digita daqui pra frente na grade, e é
 * ela que dispara o aviso pelo sino — complementar a `MetaAno`/
 * `MetaCarteira` (abaixo), que são o que ele JÁ MEDIU, importado do JSON.
 * `valor` nunca é negativo; mês sem meta simplesmente não tem linha aqui.
 */
export interface MetaComercial {
  id: string;
  ano: number;
  mes: number;
  carteira: string | null;
  valor: number;
}

/**
 * Uma linha de `metas_carteira` — realizado por carteira, INFORMADO pelo
 * diretor (nunca somado de `com_vendas_itens`). `realizado` nulo é "sem
 * dado" (mês ainda não coberto pela importação, ou `0.0`/`null` no JSON de
 * origem) — nunca R$ 0,00. Ver docs/metas-e-carteiras-fonte-da-verdade.md.
 */
export interface MetaCarteira {
  ano: number;
  mes: number;
  carteira: string;
  realizado: number | null;
}

/**
 * Uma linha de `metas_ano` — total e meta do mês, também informados pelo
 * diretor. `meta` vem de `anos[ano].meta` do HISTORICO (ou de
 * `METAS_<ano>.json`, quando existir, que o sobrepõe). As duas colunas são
 * nulas, nunca zero, quando o mês não tem dado.
 *
 * `metas_ano` também tem uma coluna `meta_total` (a segunda série de meta do
 * JSON do dono, de propósito ainda desconhecido — item 3 da correção da
 * auditoria de 2026-09-22) que este tipo não traz de propósito: nenhuma
 * tela lê. Ver `docs/nao-funciona.md`.
 */
export interface MetaAno {
  ano: number;
  mes: number;
  total_realizado: number | null;
  meta: number | null;
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

// ═══════════════════════════════════════════════════════════════════════════
// L6e — tendência produto a produto e detalhe do produto (Painel Diretor,
// §14 itens 2 e 3). Ver .scratch/plano-l6e-simulador-e-tendencia.md.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A situação de um produto no período (§14): a ORDEM em que o banco avalia
 * está em `com_tendencia_produtos`, não aqui — Novo/Descontinuado antes das
 * regras de variação, Esporádico antes de Crescendo/Caindo/Estável. `null`
 * é a ressalva do período de um único mês: não existe tendência para medir.
 */
export type SituacaoProduto = 'Novo' | 'Descontinuado' | 'Esporádico' | 'Crescendo' | 'Caindo' | 'Estável';

/**
 * Uma linha de `com_tendencia_produtos` — por produto, no período/filial/
 * critério escolhidos. `situacao` e `variacao` são nulas com um único mês
 * selecionado (ressalva 1 do §14, nunca 'Estável'); `concentrado` marca
 * quando mais da metade do faturamento saiu num único mês (ressalva 2), e é
 * nula pela MESMA razão de `situacao` (correção D3, auditoria da L6e): com
 * um único mês no período, "mais da metade do faturamento saiu num único
 * mês" seria sempre verdadeiro por definição — não informa nada.
 * `serie_mensal` é a série do critério escolhido (valor ou quantidade), na
 * ordem dos meses do período — para a miniatura.
 */
export interface TendenciaProduto {
  produto_codigo: string;
  nome: string;
  faturamento: number;
  quantidade: number;
  faixa: FaixaCurva;
  meses_com_venda: number;
  clientes: number;
  primeira_metade: number | null;
  segunda_metade: number | null;
  variacao: number | null;
  situacao: SituacaoProduto | null;
  concentrado: boolean | null;
  serie_mensal: number[];
}

/** Uma competência do detalhe do produto — o gráfico mensal com clientes distintos sobreposto (§14 item 3). */
export interface DetalheProdutoMensal {
  competencia: string;
  faturamento: number;
  quantidade: number;
  clientes_distintos: number;
}

/** Um cliente que comprou o produto no período — a lista de quem compra (§14 item 3). */
export interface DetalheProdutoCliente {
  cliente_codigo: string;
  nome: string;
  valor: number;
  quantidade: number;
}

/** O `jsonb` que `com_detalhe_produto` devolve — mesmo padrão de `FichaCliente`. */
export interface DetalheProduto {
  mensal: DetalheProdutoMensal[];
  clientes: DetalheProdutoCliente[];
}
