// Leads e vendas do Kommo nos Indicadores do Marketing (dono, 2026-11-07, proposta v4
// https://claude.ai/artifact/4YkGvumGgu6Z9JmgmwodQr): por segmento, quantos leads chegaram, quantas vendas ganhas e
// perdidas (no dia em que fecharam), a taxa de ganho, o valor e os motivos das perdas. As linhas são por dia
// (`mkt_kommo_dia`, `mkt_kommo_perdas`), então qualquer período é exato.
import type { Intervalo } from '@/lib/redes-e-trafego';

export type Segmento = 'salao' | 'distribuidor' | 'consumidor' | 'sem_triagem';
export const SEGMENTOS: { k: Segmento; nome: string }[] = [
  { k: 'salao', nome: 'Salão de beleza' },
  { k: 'distribuidor', nome: 'Distribuidor' },
  { k: 'consumidor', nome: 'Consumidor final' },
  { k: 'sem_triagem', nome: 'Sem triagem (Entrada)' },
];

export interface LinhaKommo { dia: string; funil: Segmento; chegaram: number; ganhas: number; perdidas: number; valor_ganho: number }
export interface LinhaPerda { dia: string; funil: Segmento; motivo: string | null; quantos: number }

export interface Numeros { chegaram: number; ganhas: number; perdidas: number; valor: number; taxa: number | null }
export interface ResumoDoKommo {
  segmentos: (Numeros & { k: Segmento; nome: string })[];
  total: Numeros;
  /** Os motivos das perdas, do mais comum ao menos; "Sem motivo anotado" por último. */
  motivos: { motivo: string; quantos: number }[];
  /** Algum dia do período tem linha: sem isso o Kommo ainda não foi lido ali. */
  temDados: boolean;
}

const dentro = (dia: string, p: Intervalo) => dia >= p.de && dia <= p.ate;
/** Ganhas sobre as que fecharam (ganhas + perdidas); sem nenhuma fechada, não há taxa. */
const taxa = (ganhas: number, perdidas: number) => (ganhas + perdidas ? ganhas / (ganhas + perdidas) : null);

function somar(linhas: LinhaKommo[]): Numeros {
  const n = linhas.reduce((s, l) => ({
    chegaram: s.chegaram + l.chegaram, ganhas: s.ganhas + l.ganhas, perdidas: s.perdidas + l.perdidas, valor: s.valor + Number(l.valor_ganho),
  }), { chegaram: 0, ganhas: 0, perdidas: 0, valor: 0 });
  return { ...n, taxa: taxa(n.ganhas, n.perdidas) };
}

export function resumoDoKommo(linhas: LinhaKommo[], perdas: LinhaPerda[], p: Intervalo): ResumoDoKommo {
  const no = linhas.filter((l) => dentro(l.dia, p));
  const motivos = new Map<string, number>();
  for (const x of perdas.filter((x) => dentro(x.dia, p))) {
    const m = x.motivo ?? 'Sem motivo anotado';
    motivos.set(m, (motivos.get(m) ?? 0) + x.quantos);
  }
  return {
    segmentos: SEGMENTOS.map((s) => ({ ...s, ...somar(no.filter((l) => l.funil === s.k)) })),
    total: somar(no),
    motivos: [...motivos].map(([motivo, quantos]) => ({ motivo, quantos }))
      .sort((a, b) => Number(a.motivo === 'Sem motivo anotado') - Number(b.motivo === 'Sem motivo anotado') || b.quantos - a.quantos),
    temDados: no.length > 0,
  };
}

/** Leads que chegaram em cada semana (segunda a domingo), para o gráfico; `domingos` em ordem. */
export function leadsPorSemana(linhas: LinhaKommo[], domingos: string[], somarDias: (iso: string, n: number) => string) {
  return domingos.map((d) => ({
    semana: d,
    chegaram: linhas.filter((l) => dentro(l.dia, { de: somarDias(d, -6), ate: d })).reduce((s, l) => s + l.chegaram, 0),
  }));
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const partes = (iso: string) => ({ a: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1, d: Number(iso.slice(8, 10)) });

/**
 * A data como o Google Analytics escreve, uma forma só na tela inteira: "26 out – 1 nov 2026", "1 – 30 nov 2026",
 * "19 – 25 out". O ano sai quando `comAno` é falso (o período comparado, logo depois do atual).
 */
export function periodoCurto({ de, ate }: Intervalo, comAno = true): string {
  const a = partes(de), b = partes(ate);
  const ano = comAno ? ` ${b.a}` : '';
  if (a.a !== b.a) return `${a.d} ${MESES[a.m]} ${a.a} – ${b.d} ${MESES[b.m]} ${b.a}`;
  if (a.m !== b.m) return `${a.d} ${MESES[a.m]} – ${b.d} ${MESES[b.m]}${ano}`;
  if (a.d === b.d) return `${a.d} ${MESES[a.m]}${ano}`;
  return `${a.d} – ${b.d} ${MESES[b.m]}${ano}`;
}

/** A semana no gráfico, de segunda a domingo: "26/10–01/11". O domingo sozinho parecia um dia, não uma semana. */
export function rotuloDaSemana(domingo: string, somarDias: (iso: string, n: number) => string): string {
  const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return `${ddmm(somarDias(domingo, -6))}–${ddmm(domingo)}`;
}

/** O período é um mês inteiro, do dia 1 ao último: é aí que valem as linhas do mês da Meta. */
export function ehMesInteiro({ de, ate }: Intervalo): boolean {
  const a = partes(de), b = partes(ate);
  return a.d === 1 && a.a === b.a && a.m === b.m && b.d === new Date(b.a, b.m + 1, 0).getDate();
}

export interface Destaque { texto: string; tom: 'bom' | 'ruim' | 'info' }
const pctMudou = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Os três destaques do período (Lei de Miller: três, não cinco assuntos num parágrafo): o segmento que mais trouxe
 * leads, as vendas ganhas e perdidas, e o tráfego. Só entra o que tem número.
 */
export function destaquesDoPeriodo(atual: ResumoDoKommo, anterior: ResumoDoKommo,
  trafego: { investimento: number | null; investimentoAntes: number | null; custoPorVisita: number | null }): Destaque[] {
  const d: Destaque[] = [];
  if (atual.total.chegaram > 0) {
    const maior = [...atual.segmentos].sort((a, b) => b.chegaram - a.chegaram)[0];
    const antes = anterior.segmentos.find((s) => s.k === maior.k)?.chegaram ?? 0;
    const nome = maior.k === 'sem_triagem' ? 'Os leads sem triagem' : maior.nome;
    d.push({
      texto: `${nome} ${maior.k === 'sem_triagem' ? 'foram a maior parte' : 'puxou os leads'}: ${maior.chegaram} de ${atual.total.chegaram}${anterior.temDados ? `, eram ${antes} no período anterior` : ''}.`,
      tom: maior.k === 'sem_triagem' ? 'ruim' : maior.chegaram >= antes ? 'bom' : 'info',
    });
  }
  const { ganhas, perdidas } = atual.total;
  if (ganhas + perdidas > 0) {
    const semMotivo = atual.motivos.find((m) => m.motivo === 'Sem motivo anotado')?.quantos ?? 0;
    d.push({
      texto: `${ganhas} ${ganhas === 1 ? 'venda ganha' : 'vendas ganhas'} e ${perdidas} ${perdidas === 1 ? 'perdida' : 'perdidas'}${semMotivo ? `; ${semMotivo} sem motivo anotado no Kommo` : ''}.`,
      tom: ganhas >= perdidas ? 'bom' : 'ruim',
    });
  }
  if (trafego.investimento !== null) {
    const mudou = trafego.investimentoAntes === null ? null : pctMudou(trafego.investimento, trafego.investimentoAntes);
    d.push({
      texto: `O tráfego pago investiu ${reais(trafego.investimento)}${mudou ? `, ${Math.abs(mudou)}% ${mudou > 0 ? 'a mais' : 'a menos'}` : ''}${trafego.custoPorVisita !== null ? `, e cada visita ao perfil custou ${reais(trafego.custoPorVisita)}` : ''}.`,
      tom: 'info',
    });
  }
  return d;
}

/** Uma venda ganha ou perdida do Kommo, com o nome do contato e o link do lead (`mkt_kommo_vendas`). */
export interface Venda {
  lead_id: number; nome: string; funil: Segmento; situacao: 'ganha' | 'perdida'; valor: number; fechou: string; motivo: string | null; link: string;
}
export interface Pendencias { semValor: Venda[]; semSegmento: Venda[]; semMotivo: Venda[] }

/**
 * O que corrigir no Kommo para o número sair certo (proposta v5): venda ganha sem valor, venda ganha ainda na Entrada
 * (sem segmento) e venda perdida sem motivo. Só as do período.
 */
export function pendenciasDoKommo(vendas: Venda[], p: Intervalo): Pendencias {
  const no = vendas.filter((v) => dentro(v.fechou, p));
  return {
    semValor: no.filter((v) => v.situacao === 'ganha' && !Number(v.valor)),
    semSegmento: no.filter((v) => v.situacao === 'ganha' && v.funil === 'sem_triagem'),
    semMotivo: no.filter((v) => v.situacao === 'perdida' && !v.motivo),
  };
}
