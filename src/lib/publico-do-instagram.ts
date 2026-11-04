// Quem segue cada conta do Instagram (proposta de 2026-11-04, https://claude.ai/artifact/38uLvZFcbX9kXD2efuQxqZ): o
// coletor grava em `mkt_publico_ig`, uma linha por conta por mês, as contagens que a Meta dá (gênero, idade, país, cidade)
// e os seguidores online por dia da semana e hora de Brasília. Aqui viram as porcentagens e os melhores horários da tela.

import { pctTexto } from '@/lib/redes-e-trafego';

type Contagem = Record<string, number>;

export interface LinhaPublico {
  conta: string; mes: string; genero: Contagem | null; idade: Contagem | null; paises: Contagem | null; cidades: Contagem | null;
  /** { dia da semana (0 = domingo): { hora: seguidores online } } */
  online: Record<string, Contagem> | null;
  coletado_em: string;
}

export interface Fatia { nome: string; pct: number }
export interface Horario { dia: number; hora: number; seguidores: number }

export interface ResumoDoPublico {
  conta: string; mes: string;
  mulheres: number | null;
  faixas: Fatia[];
  brasil: number | null;
  /** Os países de fora do Brasil com mais seguidores (código ISO; a tela põe o nome). */
  fora: Fatia[];
  cidades: Fatia[];
  horarios: Horario[];
  /** 7 dias × 8 faixas de 3 h (0h, 3h … 21h), de 0 a 1 em relação à faixa mais cheia. */
  grade: number[][] | null;
}

const soma = (c: Contagem | null) => Object.values(c ?? {}).reduce((s, n) => s + n, 0);
const pct = (n: number, total: number) => Math.round((n / total) * 1000) / 10;

/** As maiores fatias de uma contagem, em % do total de seguidores. */
function maiores(c: Contagem | null, total: number, n: number, fora: string[] = []): Fatia[] {
  if (!c || !total) return [];
  return Object.entries(c).filter(([k]) => !fora.includes(k)).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([nome, v]) => ({ nome, pct: pct(v, total) }));
}

export function resumoDoPublico(l: LinhaPublico): ResumoDoPublico {
  // O gênero cobre todo seguidor; as cidades vêm só as 45 maiores, então a base é o gênero quando existe.
  const total = soma(l.genero) || soma(l.paises) || soma(l.idade);
  const horarios = Object.entries(l.online ?? {})
    .flatMap(([d, hs]) => Object.entries(hs).map(([h, n]) => ({ dia: Number(d), hora: Number(h), seguidores: n })))
    .sort((a, b) => b.seguidores - a.seguidores);
  let grade: number[][] | null = null;
  if (horarios.length) {
    const blocos = Array.from({ length: 7 }, (_, d) => Array.from({ length: 8 }, (_, b) => {
      const hs = horarios.filter((x) => x.dia === d && Math.floor(x.hora / 3) === b);
      return hs.length ? hs.reduce((s, x) => s + x.seguidores, 0) / hs.length : 0;
    }));
    const max = Math.max(...blocos.flat());
    grade = blocos.map((linha) => linha.map((v) => (max ? Math.round((v / max) * 100) / 100 : 0)));
  }
  return {
    conta: l.conta, mes: l.mes,
    mulheres: l.genero && total ? pct(l.genero.F ?? 0, total) : null,
    faixas: maiores(l.idade, total, 2),
    brasil: l.paises && total ? pct(l.paises.BR ?? 0, total) : null,
    fora: maiores(l.paises, total, 3, ['BR']),
    cidades: maiores(l.cidades, total, 3).map((c) => ({ ...c, nome: c.nome.split(',')[0] })),
    horarios: horarios.slice(0, 3),
    grade,
  };
}

// Os textos que a tela e o PDF mostram.
export const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const nomeDoPais = (codigo: string) => {
  try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(codigo) ?? codigo; } catch { return codigo; }
};
export const fatias = (fs: Fatia[], nome: (s: string) => string = (s) => s) =>
  fs.length ? fs.map((f) => `${nome(f.nome)} ${pctTexto(f.pct)}`).join(' · ') : '—';
export const horariosTexto = (hs: Horario[]) => hs.map((h) => `${DIAS[h.dia]} ${h.hora}h`).join(' · ');

/** A primeira linha de cada conta (a consulta já vem do mês mais novo para o mais velho), na ordem das contas pedidas. */
export function publicoDoMes(linhas: LinhaPublico[], contas: string[]): ResumoDoPublico[] {
  return contas.flatMap((c) => {
    const l = linhas.find((x) => x.conta === c);
    return l ? [resumoDoPublico(l)] : [];
  });
}
