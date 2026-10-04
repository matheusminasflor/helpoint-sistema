// Meta × realizado num PERÍODO (pedido do dono, 2026-10-03: "Este trimestre",
// "Personalizado"… também na Diretoria). Meta e realizado informado são MENSAIS por
// natureza: o período vale pelos MESES INTEIROS que ele toca (10/03–25/04 → março e abril
// inteiros), nunca rateio — decisão do dono. `meses` chega pronto de `mesesDoIntervalo`.
//
// Mesmas regras de `useMetaXRealizadoAno`, que faz a conta do ano:
//   * o realizado da empresa é `metas_ano.total_realizado`; o da carteira,
//     `metas_carteira.realizado` — duas fontes, nunca fundidas;
//   * a meta oficial do mês é a SOMA das metas por carteira (`com_metas`), e só sem nenhuma
//     a meta importada (`metas_ano.meta`) — `metaOficialPorMes`;
//   * "sem dado" é nulo, nunca zero (`somaComAusencia`).
// Módulo sem dependência de banco: divisão e soma de linhas já lidas inteiras.
import { somaComAusencia } from '@/lib/comparativoAnos';
import { calcularCobertura, calcularPeso } from '@/lib/metas-carteira-calc';
import type { MetaAno, MetaCarteira, MetaComercial } from '@/types/comercial';

export interface DadosDosAnos {
  metasAno: MetaAno[];
  metasCarteira: MetaCarteira[];
  comMetas: MetaComercial[];
}

const chave = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`;
const anoAnterior = (mes: string) => `${Number(mes.slice(0, 4)) - 1}${mes.slice(4)}`;

/** Os anos que a conta do período precisa ler: os dos meses e, para o "mesmo período um ano antes", os anteriores. */
export function anosParaOPeriodo(meses: string[]): number[] {
  const anos = new Set<number>();
  for (const m of meses) {
    const ano = Number(m.slice(0, 4));
    anos.add(ano);
    anos.add(ano - 1);
  }
  return [...anos].sort((a, b) => a - b);
}

export function metaXRealizadoDoPeriodo(meses: string[], dados: DadosDosAnos, carteiras: string[]) {
  const realizadoTotal = new Map<string, number | null>();
  const metaImportada = new Map<string, number | null>();
  for (const l of dados.metasAno) {
    realizadoTotal.set(chave(l.ano, l.mes), l.total_realizado);
    metaImportada.set(chave(l.ano, l.mes), l.meta);
  }
  const metaDasCarteiras = new Map<string, number>();
  const metaDaCarteira = new Map<string, number>();
  for (const l of dados.comMetas) {
    if (l.carteira === null) continue; // a meta TOTAL não entra na soma das carteiras
    const k = chave(l.ano, l.mes);
    metaDasCarteiras.set(k, (metaDasCarteiras.get(k) ?? 0) + l.valor);
    metaDaCarteira.set(`${l.carteira}|${k}`, l.valor);
  }
  const realizadoDaCarteira = new Map<string, number | null>();
  for (const l of dados.metasCarteira) realizadoDaCarteira.set(`${l.carteira}|${chave(l.ano, l.mes)}`, l.realizado);

  const metaOficial = (m: string) => metaDasCarteiras.get(m) ?? metaImportada.get(m) ?? null;
  const totalRealizadoDoPeriodo = somaComAusencia(meses.map((m) => realizadoTotal.get(m) ?? null));

  return {
    realizadoDoPeriodo: totalRealizadoDoPeriodo,
    metaDoPeriodo: somaComAusencia(meses.map(metaOficial)),
    mesmoPeriodoAnoAnterior: somaComAusencia(meses.map((m) => realizadoTotal.get(anoAnterior(m)) ?? null)),
    carteirasNoPeriodo: carteiras.map((nome) => {
      const realizado = somaComAusencia(meses.map((m) => realizadoDaCarteira.get(`${nome}|${m}`) ?? null));
      const meta = somaComAusencia(meses.map((m) => metaDaCarteira.get(`${nome}|${m}`) ?? null));
      return {
        nome, realizado, meta,
        cobertura: calcularCobertura(realizado, meta),
        peso: calcularPeso(realizado, totalRealizadoDoPeriodo),
      };
    }),
    carteirasMesAMes: carteiras.map((nome) => ({
      nome,
      porMes: meses.map((m) => {
        const realizado = realizadoDaCarteira.get(`${nome}|${m}`) ?? null;
        const meta = metaDaCarteira.get(`${nome}|${m}`) ?? null;
        return {
          peso: calcularPeso(realizado, realizadoTotal.get(m) ?? null),
          meta,
          cobertura: calcularCobertura(realizado, meta),
        };
      }),
    })),
  };
}
