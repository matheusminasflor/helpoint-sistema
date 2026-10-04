// O quadro mês × família da ficha do cliente (decisão do dono, 2026-10-03). O banco devolve uma
// linha por (mês, família) com movimento; aqui ela vira a grade — e mês sem compra numa família
// fica VAZIO, não zero: "não comprou" e "comprou e devolveu tudo" são coisas diferentes.

export interface LinhaHistorico {
  competencia: string;
  familia: string;
  ordem: number;
  quantidade: number;
  valor: number;
}

export interface Celula { quantidade: number; valor: number }

export interface QuadroPorFamilia {
  /** `aaaa-mm-01`, do mais antigo ao mais recente. */
  meses: string[];
  /** Na ordem da configuração (a `ordem` da família), depois por nome. */
  familias: string[];
  celula: (mes: string, familia: string) => Celula | null;
  totalDaFamilia: (familia: string) => Celula;
}

export function montarQuadro(linhas: LinhaHistorico[]): QuadroPorFamilia {
  const mapa = new Map<string, Celula>();
  const ordens = new Map<string, number>();
  const meses = new Set<string>();
  for (const l of linhas) {
    meses.add(l.competencia);
    ordens.set(l.familia, l.ordem);
    mapa.set(`${l.competencia}|${l.familia}`, { quantidade: l.quantidade, valor: l.valor });
  }
  const familias = [...ordens.keys()].sort((a, b) => ordens.get(a)! - ordens.get(b)! || a.localeCompare(b));
  return {
    meses: [...meses].sort(),
    familias,
    celula: (mes, familia) => mapa.get(`${mes}|${familia}`) ?? null,
    totalDaFamilia: (familia) =>
      linhas.filter((l) => l.familia === familia)
        .reduce((t, l) => ({ quantidade: t.quantidade + l.quantidade, valor: t.valor + l.valor }), { quantidade: 0, valor: 0 }),
  };
}
