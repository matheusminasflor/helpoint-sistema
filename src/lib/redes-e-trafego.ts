// As contas das Redes sociais e do Tráfego pago nos Indicadores do Marketing (proposta v3, aprovada em 2026-11-03,
// https://claude.ai/artifact/Y2GAVmTspQUQNtsgrErFZZ): cada número do período ao lado do mesmo número no período anterior.
// A semana é o domingo que a fecha; entra no período a semana cujo domingo está nele. Campo em branco não vira zero:
// sem nenhuma semana com o número, o resultado é `null` ("—" na tela).
import { formatBRL } from '@/lib/crm';
import { somarDias } from '@/lib/ti-equipe';

export interface Campanha { nome: string; investimento: number; alcance: number | null; ativa: boolean }

export interface LinhaRedes {
  semana: string; conta: string; posts: number | null; reels: number | null; stories: number | null; engajamento: number | null;
  novos_seguidores: number | null; quedas_seguidores: number | null; total_seguidores: number | null; visitas_perfil: number | null;
  // O tráfego pago da conta (20270212260000).
  investimento: number | null; alcance_pago: number | null; visitas_pagas: number | null; campanhas_ativas: number | null;
  campanhas: Campanha[] | null;
}

export interface LinhaTrafego {
  semana: string; investimento: number | null; alcance: number | null; visitas_perfil: number | null; campanhas_ativas: number | null;
  leads_distribuidor: number | null; leads_consumidor: number | null; leads_salao: number | null; leads_sem_triagem: number | null;
}

export interface Intervalo { de: string; ate: string }

// Os nomes da planilha (aba "MKT - Redes"), que é como o histórico de outubro entrou.
export const CONTAS = ['@minasflor', '@mf.pro', '@by.mf'];

const dentro = (semana: string, p: Intervalo) => semana >= p.de && semana <= p.ate;
const porSemana = <T extends { semana: string }>(a: T, b: T) => a.semana.localeCompare(b.semana);

/** A soma do campo nas linhas; `null` quando nenhuma tem o número. */
export function somaOuNada<T>(linhas: T[], k: keyof T): number | null {
  const v = linhas.map((l) => l[k] as number | null).filter((x): x is number => x !== null && x !== undefined);
  return v.length ? v.reduce((s, x) => s + Number(x), 0) : null;
}

/** O último valor preenchido (as linhas em ordem de semana). */
function ultimo<T>(linhas: T[], k: keyof T): number | null {
  for (let i = linhas.length - 1; i >= 0; i--) {
    const v = linhas[i][k] as number | null;
    if (v !== null && v !== undefined) return Number(v);
  }
  return null;
}

const dividir = (a: number | null, b: number | null) => (a === null || !b ? null : a / b);
const somarNulos = (v: (number | null)[]) => (v.some((x) => x !== null) ? v.reduce<number>((s, x) => s + (x ?? 0), 0) : null);

export interface NumerosDaConta {
  conta: string;
  /** O total de seguidores na última semana do período. */
  seguidores: number | null;
  /** O total no fim do período menos o total no fim do anterior: exato, ao contrário de novos − perdidos. */
  saldo: number | null;
  novos: number | null; perdidos: number | null; visitas: number | null; engajamento: number | null;
  feed: number | null; reels: number | null; stories: number | null;
  investimento: number | null; alcancePago: number | null; visitasPagas: number | null; custoPorVisita: number | null;
  campanhasAtivas: number | null; campanhas: Campanha[];
}

export function numerosDaConta(linhas: LinhaRedes[], conta: string, p: Intervalo): NumerosDaConta {
  const daConta = linhas.filter((l) => l.conta === conta).sort(porSemana);
  const no = daConta.filter((l) => dentro(l.semana, p));
  const seguidores = ultimo(no, 'total_seguidores');
  const base = ultimo(daConta.filter((l) => l.semana < p.de), 'total_seguidores');
  const engs = no.map((l) => l.engajamento).filter((x): x is number => x !== null);
  const investimento = somaOuNada(no, 'investimento');
  const visitasPagas = somaOuNada(no, 'visitas_pagas');
  // A mesma campanha em várias semanas vira uma linha só, somada.
  const campanhas = new Map<string, Campanha>();
  for (const c of no.flatMap((l) => l.campanhas ?? [])) {
    const ja = campanhas.get(c.nome);
    campanhas.set(c.nome, ja ? { ...c, investimento: ja.investimento + c.investimento, alcance: somarNulos([ja.alcance, c.alcance]) } : { ...c });
  }
  return {
    conta, seguidores, saldo: seguidores === null || base === null ? null : seguidores - base,
    novos: somaOuNada(no, 'novos_seguidores'), perdidos: somaOuNada(no, 'quedas_seguidores'),
    visitas: somaOuNada(no, 'visitas_perfil'),
    engajamento: engs.length ? engs.reduce((s, x) => s + Number(x), 0) / engs.length : null,
    feed: somaOuNada(no, 'posts'), reels: somaOuNada(no, 'reels'), stories: somaOuNada(no, 'stories'),
    investimento, alcancePago: somaOuNada(no, 'alcance_pago'), visitasPagas, custoPorVisita: dividir(investimento, visitasPagas),
    campanhasAtivas: ultimo(no, 'campanhas_ativas'),
    campanhas: [...campanhas.values()].sort((a, b) => b.investimento - a.investimento),
  };
}

export interface NumerosDoTrafego {
  investimento: number | null; alcance: number | null; visitas: number | null; custoPorVisita: number | null;
  campanhasAtivas: number | null;
  leads: { salao: number | null; distribuidor: number | null; consumidor: number | null; semTriagem: number | null };
  /** Os que já têm segmento (sem triagem fica de fora). */
  leadsClassificados: number | null;
}

/** O total da conta de anúncios; sem o total lançado, o investimento é a soma das contas. */
export function numerosDoTrafego(linhas: LinhaTrafego[], contas: NumerosDaConta[], p: Intervalo): NumerosDoTrafego {
  const no = linhas.filter((l) => dentro(l.semana, p)).sort(porSemana);
  const investimento = somaOuNada(no, 'investimento') ?? somarNulos(contas.map((c) => c.investimento));
  const visitas = somaOuNada(no, 'visitas_perfil') ?? somarNulos(contas.map((c) => c.visitasPagas));
  const leads = {
    salao: somaOuNada(no, 'leads_salao'), distribuidor: somaOuNada(no, 'leads_distribuidor'),
    consumidor: somaOuNada(no, 'leads_consumidor'), semTriagem: somaOuNada(no, 'leads_sem_triagem'),
  };
  return {
    investimento, visitas, custoPorVisita: dividir(investimento, visitas),
    alcance: somaOuNada(no, 'alcance') ?? somarNulos(contas.map((c) => c.alcancePago)),
    campanhasAtivas: ultimo(no, 'campanhas_ativas') ?? somarNulos(contas.map((c) => c.campanhasAtivas)),
    leads, leadsClassificados: somarNulos([leads.salao, leads.distribuidor, leads.consumidor]),
  };
}

/** Os `n` domingos até o fim do período (o último é o da semana que contém `ate`). */
export function ultimasSemanas(ate: string, n: number): string[] {
  const d = new Date(`${ate}T12:00:00`);
  const domingo = somarDias(ate, (7 - d.getDay()) % 7);
  return Array.from({ length: n }, (_, i) => somarDias(domingo, -7 * (n - 1 - i)));
}

/**
 * A semana em andamento entra no período que contém hoje antes de o domingo dela chegar (dono, 2026-11-04: "Esta
 * semana" vinha vazia com os números da Meta já buscados, porque o domingo 08/11 ainda não estava no período).
 * ponytail: na semana que atravessa o fim do mês, ela conta no mês de hoje até fechar; depois vale a regra do domingo.
 */
export function comASemanaEmAndamento(p: Intervalo, hoje: string): Intervalo {
  if (hoje < p.de || hoje > p.ate) return p;
  const [domingo] = ultimasSemanas(hoje, 1);
  return domingo > p.ate ? { ...p, ate: domingo } : p;
}

export interface SemanaNoGrafico { semana: string; saldos: Record<string, number | null>; investimento: number | null; visitas: number | null }

/** Semana a semana: o saldo de seguidores de cada conta, o investimento e as visitas do tráfego. */
export function semanaASemana(redes: LinhaRedes[], trafego: LinhaTrafego[], semanas: string[], contas: string[]): SemanaNoGrafico[] {
  return semanas.map((s) => {
    const p = { de: somarDias(s, -6), ate: s };
    const dasContas = contas.map((c) => numerosDaConta(redes, c, p));
    const t = numerosDoTrafego(trafego, dasContas, p);
    return { semana: s, saldos: Object.fromEntries(dasContas.map((c) => [c.conta, c.saldo])), investimento: t.investimento, visitas: t.visitas };
  });
}

export interface Painel {
  contas: { atual: NumerosDaConta; anterior: NumerosDaConta }[];
  trafego: { atual: NumerosDoTrafego; anterior: NumerosDoTrafego };
  total: { seguidores: number | null; seguidoresAntes: number | null; saldo: number | null; visitas: number | null; visitasAntes: number | null };
  temDados: boolean;
}

/** As contas de sempre e qualquer outra que tenha sido lançada nos dois períodos. */
export function painelDasRedes(redes: LinhaRedes[], trafego: LinhaTrafego[], atual: Intervalo, anterior: Intervalo): Painel {
  const lancadas = redes.filter((l) => dentro(l.semana, anterior) || dentro(l.semana, atual)).map((l) => l.conta);
  const nomes = [...new Set([...CONTAS, ...lancadas])];
  const contas = nomes.map((c) => ({ atual: numerosDaConta(redes, c, atual), anterior: numerosDaConta(redes, c, anterior) }));
  return {
    contas,
    trafego: {
      atual: numerosDoTrafego(trafego, contas.map((c) => c.atual), atual),
      anterior: numerosDoTrafego(trafego, contas.map((c) => c.anterior), anterior),
    },
    total: {
      seguidores: somarNulos(contas.map((c) => c.atual.seguidores)), seguidoresAntes: somarNulos(contas.map((c) => c.anterior.seguidores)),
      saldo: somarNulos(contas.map((c) => c.atual.saldo)),
      visitas: somarNulos(contas.map((c) => c.atual.visitas)), visitasAntes: somarNulos(contas.map((c) => c.anterior.visitas)),
    },
    temDados: redes.some((l) => dentro(l.semana, atual)) || trafego.some((l) => dentro(l.semana, atual)),
  };
}

const sinal = (n: number) => (n > 0 ? `+${n.toLocaleString('pt-BR')}` : n.toLocaleString('pt-BR').replace('-', '−'));

/** "Na semana, as três contas ganharam 78 seguidores (+55, +33 e −10). O tráfego investiu R$ 338,14…". */
export function fraseDasRedes(p: Painel): string {
  if (!p.temDados) return '';
  const partes: string[] = [];
  const comSaldo = p.contas.filter((c) => c.atual.saldo !== null);
  if (comSaldo.length && p.total.saldo !== null) {
    const verbo = p.total.saldo >= 0 ? 'ganharam' : 'perderam';
    const lista = comSaldo.map((c) => `${c.atual.conta} ${sinal(c.atual.saldo as number)}`).join(', ');
    partes.push(`Nas redes, as contas ${verbo} ${Math.abs(p.total.saldo).toLocaleString('pt-BR')} seguidores (${lista}).`);
  }
  const t = p.trafego.atual;
  if (t.investimento !== null) {
    const visitas = t.visitas ? ` e trouxe ${t.visitas.toLocaleString('pt-BR')} visitas ao perfil${t.custoPorVisita !== null ? ` a ${formatBRL(t.custoPorVisita)} cada` : ''}` : '';
    partes.push(`O tráfego pago investiu ${formatBRL(t.investimento)}${visitas}.`);
  }
  if (t.leadsClassificados !== null) {
    const maior = (Object.entries({ 'de salão': t.leads.salao, 'de distribuidor': t.leads.distribuidor, 'de consumidor final': t.leads.consumidor }) as [string, number | null][])
      .filter(([, v]) => v).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
    partes.push(`Chegaram ${t.leadsClassificados} leads classificados${maior ? `, ${maior[1]} ${maior[0]}` : ''}.`);
  }
  return partes.join(' ');
}

/** O que falta lançar na semana (efeito Zeigarnik, na proposta): conta sem linha ou sem os números principais. */
export function faltaLancar(redes: LinhaRedes[], trafego: LinhaTrafego[], semana: string): { rotulo: string; ok: boolean }[] {
  const CAMPOS: [keyof LinhaRedes, string][] = [
    ['posts', 'feed'], ['reels', 'reels'], ['stories', 'stories'], ['total_seguidores', 'seguidores'], ['visitas_perfil', 'visitas'],
  ];
  const t = trafego.find((l) => l.semana === semana);
  return [
    { rotulo: t ? 'Tráfego' : 'Tráfego: nada lançado', ok: !!t },
    ...CONTAS.map((c) => {
      const l = redes.find((r) => r.semana === semana && r.conta === c);
      if (!l) return { rotulo: `${c}: nada lançado`, ok: false };
      const faltam = CAMPOS.filter(([k]) => l[k] === null).map(([, r]) => r);
      return { rotulo: faltam.length ? `${c}: falta ${faltam.join(', ')}` : c, ok: faltam.length === 0 };
    }),
  ];
}
