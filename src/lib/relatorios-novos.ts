// As contas dos relatórios da etapa 5, fora das telas para o teste.

/** Agrupa e soma: uma linha por grupo, a maior primeiro. */
export function agrupar<T>(linhas: T[], grupo: (l: T) => string, valor: (l: T) => number): { grupo: string; total: number; linhas: number }[] {
  const m = new Map<string, { grupo: string; total: number; linhas: number }>();
  for (const l of linhas) {
    const g = grupo(l);
    const atual = m.get(g) ?? { grupo: g, total: 0, linhas: 0 };
    atual.total += Number(valor(l)) || 0;
    atual.linhas += 1;
    m.set(g, atual);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

/** O grupo de maior média (ex.: o aprovador que mais demora), só entre os que têm número. */
export function maisLentoPorGrupo<T>(linhas: T[], grupo: (l: T) => string | null, valor: (l: T) => number | null) {
  const m = new Map<string, number[]>();
  for (const l of linhas) {
    const g = grupo(l); const v = valor(l);
    if (!g || v == null) continue;
    m.set(g, [...(m.get(g) ?? []), v]);
  }
  let pior: { grupo: string; media: number } | null = null;
  for (const [g, vs] of m) {
    const media = vs.reduce((s, x) => s + x, 0) / vs.length;
    if (!pior || media > pior.media) pior = { grupo: g, media };
  }
  return pior;
}

/**
 * A previsão de caixa semana a semana: começa no saldo informado, e cada semana soma o que entra e tira o que sai.
 * O vencido (a receber e a pagar) pesa na primeira semana. Sem saldo informado, a conta parte do zero e diz isso.
 */
export function projetarCaixa(saldo: number | null, semanas: { semana: string; entra: number; sai: number; entra_vencido: number; sai_vencido: number }[]) {
  let corrente = saldo ?? 0;
  return semanas.map((s) => {
    corrente += Number(s.entra) + Number(s.entra_vencido) - Number(s.sai) - Number(s.sai_vencido);
    return { ...s, saldo: Math.round(corrente * 100) / 100 };
  });
}

/** Retorno do Comercial: atrasado, hoje, ou próximo. */
export function situacaoDoRetorno(prazo: string, hoje: string): 'atrasado' | 'hoje' | 'proximo' {
  return prazo < hoje ? 'atrasado' : prazo === hoje ? 'hoje' : 'proximo';
}

/** Dias corridos de uma ausência, de e até inclusos. */
export function diasEntre(de: string, ate: string): number {
  const d = (s: string) => { const [a, m, dd] = s.split('-').map(Number); return Date.UTC(a, m - 1, dd); };
  return Math.round((d(ate) - d(de)) / 86_400_000) + 1;
}
