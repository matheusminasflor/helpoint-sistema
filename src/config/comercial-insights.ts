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

export type Visao =
  | 'vendas' | 'clientes' | 'bonificacao' | 'cashback' | 'diretrizes' | 'informado-faturado' | 'atendimento';

export const VISAO_PADRAO: Visao = 'vendas';

export interface VisaoInsight {
  valor: Visao;
  rotulo: string;
  /** Vira o `title` do item no menu — a frase que explica sem abrir. */
  descricao: string;
  /**
   * Endereço próprio (dono, 2026-10-14: o balde "Insights" acabou — cada análise é item do menu, no grupo de quem
   * usa). `?visao=` continua valendo nos links salvos: `/comercial/insights` redireciona para cá.
   */
  rota: string;
  /** A seção do perfil de acesso que abre a tela (`view`). */
  secao: string;
  /** O grupo do menu do Comercial. */
  grupo: 'Vendas e clientes' | 'Gestão';
}

/** A ordem aqui é a ordem do menu. */
export const VISOES: VisaoInsight[] = [
  { valor: 'vendas', rotulo: 'Vendas', descricao: 'Faturamento, curva ABC e produtos por faixa, do relatório do Forteplus',
    rota: '/comercial/vendas', secao: 'vendas', grupo: 'Vendas e clientes' },
  { valor: 'clientes', rotulo: 'Clientes parados', descricao: 'Quem comprava e parou de comprar, e a ficha de cada cliente',
    rota: '/comercial/clientes-parados', secao: 'clientes', grupo: 'Vendas e clientes' },
  { valor: 'bonificacao', rotulo: 'Bonificação', descricao: 'Bonificação por cliente e os pedidos em condição',
    rota: '/comercial/bonificacao', secao: 'bonificacao', grupo: 'Vendas e clientes' },
  { valor: 'cashback', rotulo: 'Cashback', descricao: 'A apuração mês a mês do cashback, por cliente',
    rota: '/comercial/cashback', secao: 'cashback', grupo: 'Vendas e clientes' },
  // 2026-10-04 (decisão do dono): quem atingiu uma diretriz comercial no mês e o que já foi concedido.
  { valor: 'diretrizes', rotulo: 'Benefícios a conceder', descricao: 'Quem atingiu uma diretriz comercial no mês: a conceder, perto de atingir e concedidos',
    rota: '/comercial/beneficios', secao: 'diretrizes_beneficio', grupo: 'Gestão' },
  // 2026-10-03 (decisão do dono): o que a vendedora lançou contra o que foi faturado, lado a lado.
  { valor: 'informado-faturado', rotulo: 'Informado × Faturado', descricao: 'O valor lançado pelas vendedoras contra a nota fiscal importada, por vendedora e por cliente',
    rota: '/comercial/informado-faturado', secao: 'informado_faturado', grupo: 'Gestão' },
  { valor: 'atendimento', rotulo: 'Atendimento (chamados)', descricao: 'Indicadores dos chamados do Comercial',
    rota: '/comercial/atendimento', secao: 'atendimento', grupo: 'Gestão' },
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

/**
 * A ressalva do critério por quantidade, escrita UMA vez. A Curva ABC do
 * `ComercialPainel.tsx` e o bloco de mix da `FichaCliente.tsx` mostram a
 * mesma frase quando `criterio === 'quantidade'`; a ficha nasceu com uma
 * cópia literal do texto do painel (achado da auditoria da Frente 5a,
 * 2026-09-23). Dois textos sobre a mesma ressalva divergem na primeira vez
 * que alguém corrige um só.
 */
export const NOTA_CURVA_POR_QUANTIDADE =
  'Unidades misturam sachê de 12 ml com máscara de 1 kg — a curva por quantidade não pesa o tamanho do produto.';
/** O endereço de uma visão (rota própria desde 2026-10-14). */
/** O endereço de uma visão. Uma rota só; a escolha vive na query. */
export function rotaDaVisao(valor: Visao): string {
  return VISOES.find((v) => v.valor === valor)!.rota;
}

/**
 * A porta única da ficha do cliente (item 2 do plano): todo nome de
 * cliente, em qualquer lista do Comercial ou da Diretoria, aponta para
 * aqui — nunca para uma ficha própria construída na tela que lista.
 */
export function linkFichaCliente(codigo: string): string {
  return `${rotaDaVisao('clientes')}?cliente=${encodeURIComponent(codigo)}`;
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
