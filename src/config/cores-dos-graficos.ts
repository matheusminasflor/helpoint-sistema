/**
 * As cores dos gráficos, da DashStack (dono, 2026-10-28; docs/visual-dashstack.md). O gráfico desenha em SVG, que não lê
 * as variáveis do tema; por isso as cores moram aqui, uma vez, e valem no claro e no escuro.
 */
export const COR = {
  azul: '#4880FF',
  lilas: '#8280FF',
  verde: '#00B69B',
  verdeClaro: '#4AD991',
  amarelo: '#FEC53D',
  laranja: '#FF9066',
  vermelho: '#EF3826',
  rosa: '#F93C65',
  roxo: '#6226EF',
  violeta: '#BA29FF',
  /** O texto dos eixos: o grafite a 40% da DashStack, legível no claro e no escuro. */
  eixo: '#8E9095',
  /** A linha da grade, quase apagada. */
  grade: 'rgba(142, 144, 149, 0.2)',
} as const;

/** Uma série por cor, na ordem em que a DashStack as usa. */
export const SERIES = [COR.azul, COR.verde, COR.laranja, COR.rosa, COR.roxo, COR.amarelo, COR.lilas, COR.violeta] as const;

/** Prioridade do chamado no gráfico. */
export const COR_DA_PRIORIDADE: Record<string, string> = {
  critical: COR.vermelho,
  high: COR.laranja,
  medium: COR.amarelo,
  low: COR.verde,
};

/** Abertos × resolvidos: as duas linhas que todo relatório de chamados desenha. */
export const COR_ABERTOS = COR.azul;
export const COR_RESOLVIDOS = COR.verde;

/** O texto dos eixos, no formato que o Recharts pede. */
export const EIXO = { fill: COR.eixo, fontSize: 12 } as const;
