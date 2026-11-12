// A Curva ABC dos clientes (aba "Por cliente" da Curva ABC, revisão aprovada pelo dono em 2026-11-11): a mesma régua
// da curva de produtos — A até 80% do acumulado, B até 95%, C o resto; quem não faturou fica fora.

export type FaixaDoCliente = 'A' | 'B' | 'C' | '-';

export function faixasDosClientes<L extends { faturamento: number }>(linhas: L[]): (L & { faixa: FaixaDoCliente; acumulado: number })[] {
  const ordenadas = [...linhas].sort((a, b) => b.faturamento - a.faturamento);
  const total = ordenadas.reduce((s, l) => s + Math.max(0, l.faturamento), 0);
  let soma = 0;
  return ordenadas.map((l) => {
    if (l.faturamento <= 0 || total <= 0) return { ...l, faixa: '-' as const, acumulado: 0 };
    // A faixa é de quem COMEÇA dentro dela: o cliente que cruza os 80% ainda é A.
    const antes = (soma / total) * 100;
    soma += l.faturamento;
    const faixa: FaixaDoCliente = antes < 80 ? 'A' : antes < 95 ? 'B' : 'C';
    return { ...l, faixa, acumulado: (soma / total) * 100 };
  });
}

/** O primeiro dia do mês, `meses - 1` meses antes do mês de `ate` (os últimos 6 meses incluem o mês de `ate`). */
export function inicioDosUltimosMeses(ate: string, meses: number): string {
  const ano = Number(ate.slice(0, 4));
  const mes = Number(ate.slice(5, 7)) - (meses - 1);
  const d = new Date(ano, mes - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
