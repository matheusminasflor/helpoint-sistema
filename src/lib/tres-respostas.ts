// As três respostas dos Indicadores (tópico 4, dono, 2026-11-05): quanto vendi, quanto falta e o que ainda pode entrar.
export interface EntradaDasRespostas { vendido: number; meta: number | null; faturado: number; condicao: number; aFaturar: number }

export function tresRespostas({ vendido, meta, faturado, condicao, aFaturar }: EntradaDasRespostas) {
  const temMeta = meta !== null && meta > 0;
  const pct = (v: number) => (temMeta ? Math.max(0, (v / meta) * 100) : 0);
  // A barra para em 100%: quem passou da meta vê a barra cheia, e o número diz quanto passou.
  const larguraFaturado = Math.min(100, pct(faturado));
  const larguraCondicao = Math.min(100 - larguraFaturado, pct(condicao));
  const larguraAFaturar = Math.min(100 - larguraFaturado - larguraCondicao, pct(aFaturar));
  return {
    temMeta,
    percentual: temMeta ? Math.round(pct(vendido)) : null,
    falta: temMeta ? Math.max(0, meta - vendido) : null,
    larguraFaturado, larguraCondicao, larguraAFaturar,
  };
}
