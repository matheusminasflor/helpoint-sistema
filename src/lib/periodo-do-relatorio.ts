// O período dos relatórios de Compras e da Caixinha (dono, 2026-10-14: "semanal, mensal e personalizado").
// Semana de segunda a domingo; mês do dia 1 ao último. Datas em AAAA-MM-DD, do dia do Brasil (regra 4).

export type TipoDePeriodo = 'semana' | 'mes' | 'personalizado';
export interface Intervalo { de: string; ate: string }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const data = (s: string) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };

export function intervaloDoPeriodo(tipo: TipoDePeriodo, hoje: string, personalizado?: Partial<Intervalo>): Intervalo {
  const h = data(hoje);
  if (tipo === 'semana') {
    const seg = new Date(h); seg.setDate(h.getDate() - ((h.getDay() + 6) % 7));
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    return { de: iso(seg), ate: iso(dom) };
  }
  if (tipo === 'mes') {
    return { de: iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate: iso(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
  }
  const de = personalizado?.de || hoje;
  const ate = personalizado?.ate || de;
  return de <= ate ? { de, ate } : { de: ate, ate: de };
}

/** O intervalo como instantes do Brasil, para filtrar colunas `timestamptz` (o fim é o começo do dia seguinte). */
export function instantesDoIntervalo({ de, ate }: Intervalo): { desde: string; antes: string } {
  const fim = data(ate); fim.setDate(fim.getDate() + 1);
  return { desde: `${de}T00:00:00-03:00`, antes: `${iso(fim)}T00:00:00-03:00` };
}

/**
 * O período anterior, para a comparação de todo relatório (etapa 5): o mês de antes inteiro, a semana de antes, ou o
 * intervalo do mesmo tamanho colado antes do personalizado.
 */
export function periodoAnterior(tipo: TipoDePeriodo, atual: Intervalo): Intervalo {
  const de = data(atual.de);
  if (tipo === 'mes') return { de: iso(new Date(de.getFullYear(), de.getMonth() - 1, 1)), ate: iso(new Date(de.getFullYear(), de.getMonth(), 0)) };
  const dias = Math.round((data(atual.ate).getTime() - de.getTime()) / 86_400_000) + 1;
  const fim = new Date(de.getFullYear(), de.getMonth(), de.getDate() - 1);
  return { de: iso(new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() - dias + 1)), ate: iso(fim) };
}
