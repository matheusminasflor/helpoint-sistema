// O gasto de Compras (dono, 2026-10-13): "por período ou mensal, e os setores que mais gastam por mês e ano".
// Decisão (múltipla escolha, a recomendada): gasto = o que foi COMPRADO — a compra registrada como feita
// (a que vira conta a pagar), pela data em que foi registrada, com o total aprovado.

export interface CompraFeita { quando: string; setor: string | null; valor: number }

const SEM_SETOR = 'sem_setor';

/** O total e os setores que mais gastaram entre duas datas (inclusive). */
export function gastoNoPeriodo(compras: CompraFeita[], de: Date, ate: Date) {
  const porSetor = new Map<string, number>();
  let total = 0;
  for (const c of compras) {
    const d = new Date(c.quando);
    if (d < de || d > ate) continue;
    total += c.valor;
    const s = c.setor || SEM_SETOR;
    porSetor.set(s, (porSetor.get(s) ?? 0) + c.valor);
  }
  return {
    total,
    porSetor: [...porSetor.entries()].map(([setor, valor]) => ({ setor, valor })).sort((a, b) => b.valor - a.valor),
  };
}

/** O ano mês a mês: o total de cada mês e quanto cada setor gastou nele (jan = 0). */
export function gastoPorMes(compras: CompraFeita[], ano: number) {
  const meses = Array.from({ length: 12 }, (_, mes) => ({ mes, total: 0, porSetor: {} as Record<string, number> }));
  for (const c of compras) {
    const d = new Date(c.quando);
    if (d.getFullYear() !== ano) continue;
    const m = meses[d.getMonth()];
    const s = c.setor || SEM_SETOR;
    m.total += c.valor;
    m.porSetor[s] = (m.porSetor[s] ?? 0) + c.valor;
  }
  return meses;
}

export const ehSemSetor = (setor: string) => setor === SEM_SETOR;
