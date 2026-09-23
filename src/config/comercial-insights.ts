// As visões do Insights do Comercial — a lista que o MENU LATERAL desenha e
// que `ComercialInsights` usa para decidir o que renderizar.
//
// Mora aqui, e não dentro da página, porque o menu lateral não pode importar
// uma página só para saber os nomes dos itens: puxaria o código da tela (e o
// dos gráficos) para dentro do bundle do menu, que é carregado em toda rota.
//
// Os `valor` são contrato com a URL (`?visao=`) e com os links salvos das
// pessoas — não se renomeiam. Os `rotulo` são o que se MEDE, não o artefato:
// dentro do módulo Comercial tudo é comercial, então "Painel Comercial" não
// distinguia nada (decisão do dono, 2026-09-21).

// Frente 3 (.scratch/plano-frente3-organizacao.md, item 1): 'curva' e
// 'produtos' saíram daqui. 'curva' fundiu com 'vendas' — o dono nunca teve
// abas para as duas (§11 do documento dele é uma página só, em rolagem); e
// 'produtos' (tendência + detalhe do produto) foi para a Diretoria, junto
// da matriz produto × cliente (§14 do mesmo documento). Link salvo com
// `?visao=curva` ou `?visao=produtos` cai no padrão por `resolverVisao` —
// o mesmo comportamento de qualquer valor desconhecido.
import type { FaixaCurva } from '@/types/comercial';

export type Visao = 'vendas' | 'clientes' | 'bonificacao' | 'cashback' | 'atendimento';

export const VISAO_PADRAO: Visao = 'vendas';

export interface VisaoInsight {
  valor: Visao;
  rotulo: string;
  /** Vira o `title` do item no menu — a frase que explica sem abrir. */
  descricao: string;
}

/** A ordem aqui é a ordem do menu. A L6b entra como mais itens desta lista. */
export const VISOES: VisaoInsight[] = [
  { valor: 'vendas', rotulo: 'Vendas', descricao: 'Faturamento, curva ABC e produtos por faixa, do relatório do Forteplus' },
  { valor: 'clientes', rotulo: 'Clientes', descricao: 'Quem comprava e parou de comprar' },
  { valor: 'bonificacao', rotulo: 'Bonificação', descricao: 'Bonificação por cliente e os pedidos em condição' },
  { valor: 'cashback', rotulo: 'Cashback', descricao: 'A apuração mês a mês do cashback, por cliente' },
  { valor: 'atendimento', rotulo: 'Atendimento', descricao: 'Indicadores dos chamados do Comercial' },
];

/**
 * A correspondência faixa → cor que `ComercialPainel.tsx` usa na Curva ABC.
 * Mora aqui (config, não página) para a barra empilhada de
 * `DiretoriaClientes.tsx` (Frente 4, §3 do plano) importar a MESMA tabela
 * em vez de duplicá-la — duas cópias divergindo foi como faixa A e faixa B
 * viraram a mesma cor a primeira vez (`--primary/--accent`, ver
 * docs/nao-funciona.md). Exportar constante de um arquivo de página dispara
 * aviso do react-refresh; um config não tem esse problema.
 */
export const FAIXA_BADGE: Record<FaixaCurva, string> = {
  A: 'badge-success',
  B: 'badge-warning',
  C: 'badge-neutral',
  '-': 'badge-danger',
};

/**
 * A MESMA faixa, a metade escura do par: `FAIXA_BADGE` guarda fundo pálido
 * + texto escuro, feito para o chip de texto da Curva ABC. Preencher a
 * barra empilhada de `DiretoriaClientes.tsx` com o pálido mediu contraste
 * de 1,02–1,07:1 nos seis pares (correção da auditoria da Frente 4,
 * 2026-09-23; a orientação para objetos gráficos adjacentes é 3:1) — pálido
 * sobre pálido não separa nada. As classes `bg-status-*` (`index.css:433-
 * 437`) já são a metade escura da mesma paleta; nenhum token novo.
 * Fica lado a lado com `FAIXA_BADGE` de propósito — são as duas metades do
 * mesmo par, e lado a lado é o que impede as duas cópias de divergirem
 * depois. `FAIXA_BADGE` continua servindo os chips; não se troca ali.
 */
export const FAIXA_BARRA: Record<FaixaCurva, string> = {
  A: 'bg-status-success',
  B: 'bg-status-warning',
  C: 'bg-status-muted',
  '-': 'bg-status-danger',
};

/** O endereço de uma visão. Uma rota só; a escolha vive na query. */
export function rotaDaVisao(valor: Visao): string {
  return valor === VISAO_PADRAO ? '/comercial/insights' : `/comercial/insights?visao=${valor}`;
}

/**
 * A porta única da ficha do cliente (item 2 do plano): todo nome de
 * cliente, em qualquer lista do Comercial ou da Diretoria, aponta para
 * aqui — nunca para uma ficha própria construída na tela que lista.
 */
export function linkFichaCliente(codigo: string): string {
  return `${rotaDaVisao('clientes')}&cliente=${encodeURIComponent(codigo)}`;
}

/**
 * O que `?visao=` significa, resolvido uma vez só — **a página e o menu usam
 * esta mesma função**. Ausente ou desconhecido (link velho, digitação) vira o
 * padrão: a tela renderiza Vendas, e o item de Vendas é o que acende.
 *
 * Existe porque os dois lados resolviam por conta própria e discordavam com
 * `?visao=xyz`: a tela mostrava Vendas e o menu não acendia nada (achado A4
 * da auditoria de 2026-09-21).
 */
export function resolverVisao(bruto: string | null | undefined): Visao {
  return VISOES.some((v) => v.valor === bruto) ? (bruto as Visao) : VISAO_PADRAO;
}
