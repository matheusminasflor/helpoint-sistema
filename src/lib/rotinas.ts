// Rotinas do dia (dono, 2026-10-30; docs/proposta-rotinas.md): as regras puras que a tela usa.

export type Periodo = 'manha' | 'tarde' | 'fim_do_dia';
export type Repeticao = 'dias_uteis' | 'dias_da_semana' | 'mensal' | 'ultimo_dia_util';
export type Pede = 'nada' | 'observacao' | 'anexo';

export const PERIODOS: Periodo[] = ['manha', 'tarde', 'fim_do_dia'];
export const ROTULO_DO_PERIODO: Record<Periodo, string> = { manha: 'Manhã', tarde: 'Tarde', fim_do_dia: 'Fim do dia' };
export const ROTULO_DA_REPETICAO: Record<Repeticao, string> = {
  dias_uteis: 'Todo dia útil',
  dias_da_semana: 'Dias da semana',
  mensal: 'Uma vez por mês',
  ultimo_dia_util: 'Último dia útil do mês',
};
export const ROTULO_DO_PEDE: Record<Pede, string> = { nada: 'Nada', observacao: 'Uma observação', anexo: 'Uma foto ou arquivo' };
/** 1 = segunda … 5 = sexta, como o banco guarda (`extract(isodow …)`). */
export const DIAS_UTEIS: { n: number; curto: string }[] = [
  { n: 1, curto: 'Seg' }, { n: 2, curto: 'Ter' }, { n: 3, curto: 'Qua' }, { n: 4, curto: 'Qui' }, { n: 5, curto: 'Sex' },
];

/**
 * Em que período a pessoa está agora (`agora` em "HH:MM"). A manhã vai até o almoço dela (RH), a tarde até uma hora
 * antes do fim do expediente do setor, e o fim do dia é essa última hora. Sem horário cadastrado: almoço às 12h e
 * expediente até as 18h.
 */
export function periodoAgora(agora: string, horarios?: { inicio_almoco?: string | null; fim_expediente?: string | null } | null): Periodo {
  const almoco = (horarios?.inicio_almoco ?? '12:00').slice(0, 5);
  const [h, m] = (horarios?.fim_expediente ?? '18:00').slice(0, 5).split(':').map(Number);
  const ultimaHora = `${String(Math.max(h - 1, 0)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  if (agora < almoco) return 'manha';
  if (agora < ultimaHora) return 'tarde';
  return 'fim_do_dia';
}

// ─── Etapa 2: o que o gestor vê (rotinas_da_equipe) ──────────────────────────────────────────

export type SituacaoNoDia = 'feita' | 'pulada' | 'nao_feita' | 'pendente' | 'pausada';
export interface LinhaDaEquipe {
  rotina_id: string; titulo: string; setor: string; periodo: Periodo; pessoa_id: string; pessoa_nome: string | null;
  dia: string; situacao: SituacaoNoDia; motivo: string | null; observacao: string | null; anexo_path: string | null;
  feita_em: string | null; feita_por_nome: string | null;
}

/**
 * Cumprimento = feitas ÷ (feitas + puladas + não feitas). Pendente (hoje, ainda dá tempo) e pausada (férias) ficam
 * fora da conta — não são falta de ninguém. Sem nada a contar, `null` ("—" na tela, não 0%).
 */
export function cumprimento(linhas: Pick<LinhaDaEquipe, 'situacao'>[]): number | null {
  const conta = linhas.filter((l) => l.situacao === 'feita' || l.situacao === 'pulada' || l.situacao === 'nao_feita');
  return conta.length ? Math.round((conta.filter((l) => l.situacao === 'feita').length / conta.length) * 100) : null;
}

/** A cor do cumprimento: verde a partir de 90%, laranja de 70% a 89%, vermelho abaixo (proposta aprovada). */
export const corDoCumprimento = (p: number | null) => (p === null ? 'muted' : p >= 90 ? 'verde' : p >= 70 ? 'laranja' : 'vermelho');

export interface ResumoDaPessoa {
  pessoa_id: string; nome: string; previstas: number; feitas: number; puladas: number; naoFeitas: number; cumprimento: number | null;
}

export function resumoPorPessoa(linhas: LinhaDaEquipe[]): ResumoDaPessoa[] {
  const por = new Map<string, LinhaDaEquipe[]>();
  for (const l of linhas) por.set(l.pessoa_id, [...(por.get(l.pessoa_id) ?? []), l]);
  return [...por.values()].map((ls) => ({
    pessoa_id: ls[0].pessoa_id,
    nome: ls[0].pessoa_nome ?? 'Pessoa',
    previstas: ls.filter((l) => l.situacao !== 'pausada').length,
    feitas: ls.filter((l) => l.situacao === 'feita').length,
    puladas: ls.filter((l) => l.situacao === 'pulada').length,
    naoFeitas: ls.filter((l) => l.situacao === 'nao_feita').length,
    cumprimento: cumprimento(ls),
  })).sort((a, b) => (a.cumprimento ?? 101) - (b.cumprimento ?? 101) || a.nome.localeCompare(b.nome));
}

/** As rotinas que mais ficam para trás (puladas + não feitas), com os motivos mais recentes. */
export function maisPuladas(linhas: LinhaDaEquipe[], quantas = 5) {
  const por = new Map<string, { titulo: string; falhas: number; vezes: number; motivos: string[] }>();
  for (const l of [...linhas].sort((a, b) => b.dia.localeCompare(a.dia))) {
    if (l.situacao === 'pendente' || l.situacao === 'pausada') continue;
    const x = por.get(l.rotina_id) ?? { titulo: l.titulo, falhas: 0, vezes: 0, motivos: [] };
    x.vezes += 1;
    if (l.situacao !== 'feita') x.falhas += 1;
    if (l.motivo && x.motivos.length < 3 && !x.motivos.includes(l.motivo)) x.motivos.push(l.motivo);
    por.set(l.rotina_id, x);
  }
  return [...por.values()].filter((x) => x.falhas > 0).sort((a, b) => b.falhas - a.falhas).slice(0, quantas);
}

/** A hora média em que cada rotina é marcada como feita ("HH:MM", hora local de quem vê). */
export function horarioMedio(linhas: LinhaDaEquipe[]) {
  const por = new Map<string, { titulo: string; periodo: Periodo; minutos: number[] }>();
  for (const l of linhas) {
    if (l.situacao !== 'feita' || !l.feita_em) continue;
    const d = new Date(l.feita_em);
    const x = por.get(l.rotina_id) ?? { titulo: l.titulo, periodo: l.periodo, minutos: [] };
    x.minutos.push(d.getHours() * 60 + d.getMinutes());
    por.set(l.rotina_id, x);
  }
  return [...por.values()].map((x) => {
    const m = Math.round(x.minutos.reduce((s, v) => s + v, 0) / x.minutos.length);
    return { titulo: x.titulo, periodo: x.periodo, vezes: x.minutos.length, hora: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` };
  }).sort((a, b) => PERIODOS.indexOf(a.periodo) - PERIODOS.indexOf(b.periodo) || a.hora.localeCompare(b.hora));
}

/** "Todo dia útil", "Seg, Qua e Sex", "Todo dia 10" ou "Último dia útil do mês". */
export function descreverRepeticao(r: { repeticao: Repeticao; dias_da_semana?: number[] | null; dia_do_mes?: number | null }): string {
  if (r.repeticao === 'dias_da_semana') {
    const nomes = DIAS_UTEIS.filter((d) => r.dias_da_semana?.includes(d.n)).map((d) => d.curto);
    return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0] ?? '';
  }
  if (r.repeticao === 'mensal') return `Todo dia ${r.dia_do_mes}`;
  return ROTULO_DA_REPETICAO[r.repeticao];
}
