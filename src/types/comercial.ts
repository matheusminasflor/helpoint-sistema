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

/**
 * AS CAIXAS do faturamento de uma janela — `com_caixas`, a conta única que o
 * Comercial e a Diretoria leem (migration 20261027010000).
 *
 * O que ela tem e `PainelTotais` não: a venda separada por SÉRIE (com nota ×
 * sem nota), as duas classes que não tinham caixa em tela nenhuma
 * (`industrializacao` e `outros` — R$ 243.989,69 na base de teste), o
 * `total_importado` da janela e a SOBRA entre ele e a soma das caixas.
 *
 * `fora_das_caixas` é zero em todo cenário conhecido, e é justamente por isso
 * que ela existe: se um dia der diferente de zero, a tela mostra o número em
 * vez de esconder o dinheiro, e o pgTAP reprova antes disso
 * (`comercial_caixas_fecham.test.sql`).
 *
 * Não existe filtro de série aqui de propósito — a série é coluna. Ver o
 * comentário da migration.
 */
export interface CaixasDoFaturamento {
  venda_com_nota: number;
  venda_sem_nota: number;
  venda_total: number;
  devolucao: number;
  faturamento_liquido: number;
  bonificacao: number;
  industrializacao: number;
  outros: number;
  total_importado: number;
  fora_das_caixas: number;
  unidades_vendidas: number;
  unidades_bonificadas: number;
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

// ═══════════════════════════════════════════════════════════════════════════
// Frente 1 — importar qualquer período. Ver
// .scratch/plano-frente1-importar-qualquer-periodo.md. A importação de
// vendas virou três tempos (início/lote/fim) para arquivos de centenas de
// milhares de linhas não caberem numa chamada só.
// ═══════════════════════════════════════════════════════════════════════════

/** Uma competência do resumo que `inicio` reserva — o mesmo formato de `CompetenciaReclamada`, calculado no navegador ANTES do primeiro lote. */
export interface ResumoCompetencia {
  competencia: string;
  linhas: number;
  total_venda: number;
}

/**
 * "O sistema tem vendas de X a Y" — devolvido por `com_periodo_importado`.
 * A verdade sobre o que está PUBLICADO em `com_vendas_itens`, nunca sobre a
 * última importação nem sobre a espera. `competencia_de`/`_ate` nulos e
 * `competencias` zero quando não há nenhuma venda importada ainda.
 */
export interface PeriodoImportado {
  competencia_de: string | null;
  competencia_ate: string | null;
  competencias: number;
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
  // Frente 1 (achado 6.1 da auditoria de 2026-09-22): gravadas por
  // `com_importar_vendas_fim` — nulas para clientes/metas, que não têm
  // competência. `useUltimasImportacoes` já só traz `status = 'concluida'`,
  // então uma importação de vendas aqui sempre tem as duas preenchidas.
  competencia_de: string | null;
  competencia_ate: string | null;
  created_at: string;
}

/**
 * Frente 6 (.scratch/plano-frente6-importacoes.md §1): a mesma linha de
 * `ComercialImportacao`, com `imported_by` (uuid, sem FK — a coluna nunca
 * teve uma) já resolvido para um nome legível — é o que a tela central de
 * Configurações → Importações usa no histórico ("quando, tipo, filial,
 * arquivo, período e quem importou").
 */
export interface HistoricoImportacao extends ComercialImportacao {
  importado_por: string | null;
}

/**
 * "O que já existe" no cadastro de clientes (Frente 6 §1, cartão Clientes):
 * total cadastrado e quantos têm `tabela_preco` — para o cartão mostrar
 * isto ANTES de abrir o diálogo de importar, não só depois.
 */
export interface ResumoClientes {
  total: number;
  comTabela: number;
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
 * Uma linha do FAROL de bonificação (migration `20261026040000`): só os
 * clientes que pedem decisão, nunca a base inteira.
 *
 * `motivo` separa as duas perguntas, que são diferentes:
 * - `sem_compra` — recebeu e **não comprou nada** no período. `percentual` é
 *   nulo: dividir por zero não dá "infinito por cento", dá outra pergunta;
 * - `recebe_mais` — comprou, mas recebeu mais do que comprou.
 *
 * `bonificacao` é TODA a remessa gratuita, das duas séries — cashback e
 * publicidade estão dentro, e não há como separá-los no que o Forteplus
 * exporta. Houve uma versão que contava só a série 75, por algumas horas em
 * 2026-09-25: ela escondia R$ 2,15 milhões de produto dado de graça e deixava
 * de apontar 3 clientes e R$ 70 mil.
 *
 * `comprado` soma as duas séries, porque as duas são faturamento (a série 75
 * é sem nota, mas é cobrada).
 */
export interface BonificacaoFarolCliente {
  cliente_codigo: string;
  nome: string;
  tabela_preco: string | null;
  bonificacao: number;
  comprado: number;
  percentual: number | null;
  motivo: 'sem_compra' | 'recebe_mais';
}

/**
 * Um produto que saiu mais de graça do que vendido, em QUANTIDADE — a
 * comparação é por unidade, não por valor, porque o valor da nota de
 * bonificação é praticamente o de tabela e sozinho não diz se saiu muito
 * produto barato ou pouco produto caro.
 *
 * `vezes` é nulo quando o produto nunca foi vendido no período: aí não
 * existe "quantas vezes mais", existe "nunca foi vendido".
 */
export interface BonificacaoFarolProduto {
  produto_codigo: string;
  nome: string;
  vendido: number;
  bonificado: number;
  quantidade_vendida: number;
  quantidade_bonificada: number;
  vezes: number | null;
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
  /**
   * Cliente em CONDIÇÃO (leva F, 2026-09-26). Entrou porque a lista do Comercial
   * não marcava e a da Diretoria marcava — o §11 linha 325 pede a marca, e quem
   * só passava os olhos na lista do Comercial não a via.
   *
   * Vem da coluna `com_clientes.em_condicao`, a mesma de onde
   * `com_faturamento_por_cliente`, `com_ficha_identificacao` e
   * `com_pedidos_em_condicao` leem. A regra do que é "condição" (tabela de preço
   * terminada em CONDICAO) mora na coluna gerada do banco, num lugar só — dava
   * para derivar a regex no navegador e seria a segunda cópia.
   */
  em_condicao: boolean;
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

/** Uma linha de produto na ficha do cliente — bonificado (comprou ganhou as duas faixas, ver `FichaClienteComprou`). */
export interface FichaClienteProduto {
  produto_codigo: string;
  nome: string;
  valor: number;
  quantidade: number;
}

/**
 * Um produto que o cliente comprou, com as DUAS faixas do §11: a dele
 * (`faixa_cliente`, o Pareto calculado só sobre as compras dele) e a geral
 * (`faixa_geral`, a curva da empresa no mesmo período/filial/critério). As
 * duas podem divergir — é a comparação que a tela existe para mostrar.
 */
export interface FichaClienteComprou {
  produto_codigo: string;
  nome: string;
  valor: number;
  quantidade: number;
  faixa_cliente: string;
  faixa_geral: string;
}

/**
 * Um produto que o cliente nunca comprou no período — `valor_outros` é o
 * quanto ele vendeu para os OUTROS clientes, `faixa` é a faixa geral do
 * produto e `total_da_faixa` é quantos produtos daquela faixa existem NO
 * TOTAL (o teto de 100 vale por faixa — a tela filtra por faixa, o corte é
 * do banco).
 */
export interface FichaClienteNuncaComprou {
  produto_codigo: string;
  nome: string;
  faixa: string;
  valor_outros: number;
  total_da_faixa: number;
}

/** Um produto que o cliente comprou em ≥2 dos 3 meses anteriores ao último mês com movimento dele, e não comprou nesse último mês. */
export interface FichaClienteParouDeComprar {
  produto_codigo: string;
  nome: string;
}

/** Bloco 1 da ficha — identificação. `em_condicao` é o mesmo critério de `com_faturamento_por_cliente`. */
export interface FichaClienteIdentificacao {
  codigo: string;
  nome: string;
  tabela_preco: string | null;
  em_condicao: boolean;
}

/**
 * Bloco 2 — indicadores do período, com a variação do último mês contra a
 * média dos 3 anteriores. Com menos de 3 meses anteriores com dado,
 * `variacao` é `null` — nunca 0%.
 */
export interface FichaClienteIndicadores {
  faturamento: number;
  /**
   * TODA a remessa gratuita do período — as duas séries, CFOP 5910/6910.
   * Inclui bonificação, cashback e publicidade, porque **não há como
   * separá-las** no que o Forteplus exporta:
   *
   * - a SÉRIE não separa: 98,7% do valor da série 1 é produto que também é
   *   vendido (medido na base inteira em 2026-09-25);
   * - o CFOP não separa: só existem 5910 e 6910, os dois aparecem nas duas
   *   séries, e a diferença entre eles é geografia (dentro/fora do estado),
   *   nunca finalidade;
   * - a natureza da operação, que separaria, não vem no export.
   *
   * Houve uma versão desta tela com um campo `publicidade` à parte, por
   * algumas horas em 2026-09-25. Era erro meu: generalizei da lista de um
   * cliente só. Número que não se consegue calcular não ganha rótulo.
   */
  bonificacao: number;
  skus: number;
  meses_ativos: number;
  ultimo_mes: string | null;
  media_3_anteriores: number | null;
  variacao: number | null;
}

/** Bloco 3 — um mês do ano de `ate`. `valor` é `null` (não zero) no mês sem venda. */
export interface FichaClienteMes {
  mes: string;
  valor: number | null;
}

/** Bloco 4 — mix por faixa. A faixa é sempre relativa ao período/filial selecionados, nunca gravada. */
export interface FichaClienteMixFaixa {
  faixa: string;
  valor: number;
  quantidade: number;
  participacao: number | null;
}

/** Bloco 5 — evolução por faixa, com o período anterior (em cinza na tela) e o total do período atual. */
export interface FichaClienteEvolucaoFaixa {
  atual: EvolucaoPorFaixaMes[];
  anterior: EvolucaoPorFaixaMes[];
  total: number;
}

/** Um produto dentro de `FichaClienteEvolucaoProdutos.produtos` — o período atual contra o anterior de mesmo tamanho. */
export interface FichaClienteEvolucaoProdutoItem {
  produto_codigo: string;
  nome: string;
  valor_atual: number;
  /**
   * NULOS quando a janela anterior não foi importada — não é zero, é "não
   * dá para comparar" (migration 20261025020000, item 5). O tipo dizia
   * `number` e a tela escrevia "R$ 0,00" por cima do nulo, contradizendo o
   * próprio cabeçalho dela; achado ao abrir a tela em 2026-09-24.
   */
  valor_anterior: number | null;
  delta: number | null;
  marca: 'novo' | 'zerou' | null;
}

/**
 * Bloco 6 — evolução produto a produto contra o período anterior de mesmo
 * tamanho. `anterior_existe`/`anterior_completo` respondem ao que foi
 * IMPORTADO (nunca ao calendário) — a tela avisa quando um dos dois é
 * falso, como o §11 pede.
 */
export interface FichaClienteEvolucaoProdutos {
  produtos: FichaClienteEvolucaoProdutoItem[];
  anterior_existe: boolean;
  anterior_completo: boolean;
}

/**
 * A ficha do cliente inteira, num `jsonb` só — nove blocos, na ordem do
 * §11. A âncora de `parou_de_comprar`/`indicadores` é o último mês com
 * movimento DO CLIENTE, nunca `current_date`.
 */
export interface FichaCliente {
  identificacao: FichaClienteIdentificacao;
  indicadores: FichaClienteIndicadores;
  mensal_do_ano: FichaClienteMes[];
  mix_por_faixa: FichaClienteMixFaixa[];
  evolucao_faixa: FichaClienteEvolucaoFaixa;
  evolucao_produtos: FichaClienteEvolucaoProdutos;
  comprou: FichaClienteComprou[];
  bonificado: FichaClienteProduto[];
  parou_de_comprar: FichaClienteParouDeComprar[];
  nunca_comprou: FichaClienteNuncaComprou[];
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

// ═══════════════════════════════════════════════════════════════════════════
// Frente 7d — renomear carteira, com memória. Ver
// .scratch/plano-frente7d-renomear-carteira.md.
// ═══════════════════════════════════════════════════════════════════════════

/** Uma linha de `com_carteiras_com_meses()` — a carteira e quantos meses ela tem `realizado` informado, para a lista do plano §4. */
export interface CarteiraComMeses {
  carteira: string;
  meses_com_valor: number;
}

/** Uma linha de `com_carteira_renomeacoes` — a memória de renomeações, lida direto pela tela (RLS já filtra por tenant). */
export interface RenomeacaoCarteira {
  de: string;
  para: string;
}

/**
 * O quadro de conciliação. A SÉRIE separa a venda em duas, e essa parte se
 * provou (migration `20261026020000`):
 *
 * |            | série 1 (com nota) | série 75 (sem nota, mas COBRADA) |
 * |------------|--------------------|----------------------------------|
 * | CFOP venda | `venda_com_nota`   | `venda_sem_nota`                 |
 * | CFOP 5910/ | `bonificacao` — as duas séries juntas, porque a série NÃO  |
 * |   6910     | separa bonificação de publicidade e o CFOP também não     |
 *
 * DUAS diferenças, não uma. `diferenca_com_nota` é contra a venda com nota
 * fiscal, que é o que a planilha do diretor mede (provado nos sete meses de
 * 2026: bate com 0,5% de folga). `diferenca_total` é contra a venda inteira,
 * e é a que interessa — mostra, em reais, quanto ele fatura pela série 75 e
 * não aparece na apresentação comercial dele.
 *
 * A conta ANTIGA somava bonificação à venda antes de comparar, sob a premissa
 * de que a planilha contava bonificação como faturamento. O dado negou a
 * premissa e o dono confirmou: bonificação é remessa gratuita, nunca
 * faturamento. Aquela soma não explicava a diferença — fabricava uma de
 * R$ 3,1 milhões.
 *
 * Tudo cobre só os `meses_comparados` meses com `total_realizado` informado,
 * nunca o ano inteiro (Frente 5b — a armadilha dos meses desiguais).
 * `informado` e as duas diferenças são nulos juntos quando nenhum mês do ano
 * foi informado — "sem dado" nunca é "zero".
 */
export interface Conciliacao {
  informado: number | null;
  venda_com_nota: number;
  venda_sem_nota: number;
  venda_total: number;
  bonificacao: number;
  diferenca_com_nota: number | null;
  diferenca_total: number | null;
  meses_comparados: number;
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

// ═══════════════════════════════════════════════════════════════════════════
// Frente 3 — §14 itens 4, 5 e 6 do Painel Diretor: faturamento por cliente,
// evolução por faixa e a matriz produto × cliente. Backend já existia
// (`com_faturamento_por_cliente`, `com_evolucao_por_faixa`,
// `com_matriz_produto_cliente`); esta leva constrói a tela.
// ═══════════════════════════════════════════════════════════════════════════

/** Uma linha de `com_faturamento_por_cliente` — todos os clientes, sem filtro de faixa (§14 item 4). */
export interface FaturamentoPorCliente {
  cliente_codigo: string;
  nome: string;
  tabela_preco: string | null;
  em_condicao: boolean;
  faturamento: number;
  bonificacao: number;
  skus: number;
  meses_ativos: number;
  serie_mensal: number[];
}

/** Um mês dentro de `EvolucaoPorFaixaCliente.meses` — o que veio de cada faixa A/B/C naquele mês. */
export interface EvolucaoPorFaixaMes {
  competencia: string;
  valor_a: number;
  valor_b: number;
  valor_c: number;
  valor_outros: number;
  total: number;
}

/** Uma linha de `com_evolucao_por_faixa` — barra empilhada A/B/C por mês, por cliente (§14 item 5). */
export interface EvolucaoPorFaixaCliente {
  cliente_codigo: string;
  nome: string;
  total: number;
  meses: EvolucaoPorFaixaMes[];
}

/** Uma célula da matriz — um cliente que comprou o produto no período (§14 item 6). */
export interface MatrizCelula {
  cliente_codigo: string;
  cliente_nome: string;
  valor: number;
  quantidade: number;
}

/**
 * Uma linha de `com_matriz_produto_cliente` — um produto e as células de
 * quem comprou. `maximo` é o maior valor da métrica escolhida NA MATRIZ
 * INTEIRA (não só desta linha) — é a régua da intensidade de cor que a
 * Frente 4 ainda vai aplicar; aqui ela já vem pronta para não recalcular
 * em JavaScript por cima do que o banco já devolveu.
 */
export interface MatrizProdutoLinha {
  produto_codigo: string;
  produto_nome: string;
  total: number;
  celulas: MatrizCelula[];
  maximo: number;
}
