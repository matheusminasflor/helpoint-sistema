// As somas da tela "Informado × Faturado" (decisão do dono, 2026-10-03). A conta de cada linha
// mora no banco (`com_lancado_x_faturado`); aqui só se agrupa o que veio.
//
// A ARMADILHA que esta função existe para não cair: o faturado é do CLIENTE. Quando duas
// vendedoras lançaram para o mesmo cliente, as duas linhas trazem o mesmo faturado — somar linha
// a linha contaria a nota duas vezes. O total geral e a visão por cliente contam cada cliente
// UMA vez; a visão por vendedora mostra "o faturado dos clientes em que ela lançou", que é o
// que a comparação dela pede.

export interface LinhaLxF {
  vendedor_id: string | null;
  vendedor_nome: string | null;
  cliente_codigo: string;
  cliente_nome: string;
  lancado_ate_corte: number;
  lancado_previa: number;
  faturado: number;
  /** Outra vendedora também lançou para este cliente no período. */
  compartilhado?: boolean;
}

export interface GrupoLxF {
  chave: string;
  nome: string;
  informado: number;
  previa: number;
  faturado: number;
  diferenca: number;
  /** Quantos clientes (na visão por vendedora) ou quantas vendedoras (na visão por cliente). */
  itens: number;
  linhas: LinhaLxF[];
}

export const SEM_LANCAMENTO = 'Sem lançamento';

/** O mês inteiro de uma competência (`aaaa-mm-01`), como intervalo de dias. */
export function mesDaCompetencia(competencia: string): { de: string; ate: string } {
  const [ano, mes] = competencia.slice(0, 7).split('-').map(Number);
  // Dia 0 do mês seguinte = último dia deste. `mes` já é o seguinte no Date (base 0).
  const ultimo = new Date(ano, mes, 0).getDate();
  return { de: `${competencia.slice(0, 7)}-01`, ate: `${competencia.slice(0, 7)}-${String(ultimo).padStart(2, '0')}` };
}

const faturadoPorCliente = (linhas: LinhaLxF[]) => {
  const porCliente = new Map<string, number>();
  for (const l of linhas) porCliente.set(l.cliente_codigo, l.faturado);
  return porCliente;
};

export function totaisLxF(linhas: LinhaLxF[]) {
  const informado = linhas.reduce((s, l) => s + l.lancado_ate_corte, 0);
  const previa = linhas.reduce((s, l) => s + l.lancado_previa, 0);
  const faturado = [...faturadoPorCliente(linhas).values()].reduce((s, v) => s + v, 0);
  return { informado, previa, faturado, diferenca: informado - faturado };
}

const porMaiorDiferenca = (a: GrupoLxF, b: GrupoLxF) =>
  Math.abs(b.diferenca) - Math.abs(a.diferenca) || a.nome.localeCompare(b.nome);

export function agruparPorVendedora(linhas: LinhaLxF[]): GrupoLxF[] {
  const grupos = new Map<string, GrupoLxF>();
  for (const l of linhas) {
    const chave = l.vendedor_id ?? '';
    const g = grupos.get(chave) ?? {
      chave, nome: l.vendedor_id ? (l.vendedor_nome ?? '—') : SEM_LANCAMENTO,
      informado: 0, previa: 0, faturado: 0, diferenca: 0, itens: 0, linhas: [],
    };
    g.informado += l.lancado_ate_corte;
    g.previa += l.lancado_previa;
    g.faturado += l.faturado;
    g.itens += 1;
    g.linhas.push(l);
    grupos.set(chave, g);
  }
  return [...grupos.values()].map((g) => ({ ...g, diferenca: g.informado - g.faturado })).sort(porMaiorDiferenca);
}

export function agruparPorCliente(linhas: LinhaLxF[]): GrupoLxF[] {
  const grupos = new Map<string, GrupoLxF>();
  for (const l of linhas) {
    const g = grupos.get(l.cliente_codigo) ?? {
      chave: l.cliente_codigo, nome: l.cliente_nome,
      // O faturado do cliente é um só, venha em quantas linhas vier.
      informado: 0, previa: 0, faturado: l.faturado, diferenca: 0, itens: 0, linhas: [],
    };
    g.informado += l.lancado_ate_corte;
    g.previa += l.lancado_previa;
    if (l.vendedor_id) g.itens += 1;
    g.linhas.push(l);
    grupos.set(l.cliente_codigo, g);
  }
  return [...grupos.values()].map((g) => ({ ...g, diferenca: g.informado - g.faturado })).sort(porMaiorDiferenca);
}
